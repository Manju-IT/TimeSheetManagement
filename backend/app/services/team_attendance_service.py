from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import Forbidden, NotFound
from app.models.attendance_day import AttendanceDay
from app.models.enums import GeoEventType
from app.models.geo_event import GeoEvent
from app.models.organization import OrgPolicy
from app.models.team import Team, TeamMember
from app.models.time_entry import TimeEntry
from app.models.user import AppUser
from app.models.work_session import WorkSession
from app.services import attendance_service, team_service
from app.services.attendance_service import work_date_window_utc


@dataclass
class _Row:
    user: AppUser
    attendance: AttendanceDay | None
    first_event: GeoEvent | None
    last_event: GeoEvent | None
    active_session: WorkSession | None
    entry_count: int
    billable_minutes: int


async def _assert_can_view_team(
    db: AsyncSession, *, actor_id: uuid.UUID, is_admin: bool, team_id: uuid.UUID
) -> Team:
    team = await team_service.get_team_or_404(db, team_id)
    if is_admin:
        return team
    # Manager must manage this team.
    stmt = select(TeamMember.id).where(
        TeamMember.team_id == team_id,
        TeamMember.user_id == actor_id,
        TeamMember.is_manager.is_(True),
    )
    if (await db.execute(stmt.limit(1))).first() is None:
        raise Forbidden("You do not manage this team")
    return team


async def _threshold(db: AsyncSession, org_id: uuid.UUID) -> int:
    val = (
        await db.execute(
            select(OrgPolicy.variance_threshold_minutes).where(OrgPolicy.org_id == org_id)
        )
    ).scalar_one_or_none()
    return int(val) if val is not None else 60


async def get_team_attendance(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID,
    is_admin: bool,
    team_id: uuid.UUID,
    work_date: date,
) -> dict:
    team = await _assert_can_view_team(
        db, actor_id=actor_id, is_admin=is_admin, team_id=team_id
    )

    # Member set of this team.
    member_ids = [
        uid
        for (uid,) in (
            await db.execute(
                select(TeamMember.user_id).where(TeamMember.team_id == team_id)
            )
        ).all()
    ]
    if not member_ids:
        return {
            "team_id": team.id,
            "team_name": team.name,
            "work_date": work_date,
            "variance_threshold_minutes": await _threshold(db, team.org_id),
            "rows": [],
        }

    users = {
        u.id: u
        for u in (
            await db.execute(select(AppUser).where(AppUser.id.in_(member_ids)))
        ).scalars()
    }

    attendance_map = {
        a.user_id: a
        for a in (
            await db.execute(
                select(AttendanceDay).where(
                    AttendanceDay.user_id.in_(member_ids),
                    AttendanceDay.work_date == work_date,
                )
            )
        ).scalars()
    }

    active_sessions = {
        s.user_id: s
        for s in (
            await db.execute(
                select(WorkSession).where(
                    WorkSession.user_id.in_(member_ids),
                    WorkSession.logout_at.is_(None),
                )
            )
        ).scalars()
    }

    # Entry counts + billable minutes in one aggregate query.
    entry_rows = (
        await db.execute(
            select(
                TimeEntry.user_id,
                func.count(TimeEntry.id),
                func.coalesce(
                    func.sum(
                        case(
                            (TimeEntry.billable.is_(True), TimeEntry.duration_minutes),
                            else_=0,
                        )
                    ),
                    0,
                ),
            )
            .where(
                TimeEntry.user_id.in_(member_ids),
                TimeEntry.work_date == work_date,
            )
            .group_by(TimeEntry.user_id)
        )
    ).all()
    entry_counts = {uid: int(c) for uid, c, _ in entry_rows}
    billable_minutes = {uid: int(b) for uid, _, b in entry_rows}

    # First/last events.
    event_ids: set[uuid.UUID] = set()
    for a in attendance_map.values():
        if a.first_login_event_id:
            event_ids.add(a.first_login_event_id)
        if a.last_logout_event_id:
            event_ids.add(a.last_logout_event_id)
    events: dict[uuid.UUID, GeoEvent] = {}
    if event_ids:
        events = {
            e.id: e
            for e in (
                await db.execute(select(GeoEvent).where(GeoEvent.id.in_(event_ids)))
            ).scalars()
        }

    threshold = await _threshold(db, team.org_id)
    threshold_seconds = threshold * 60
    rows: list[dict] = []

    for uid in member_ids:
        u = users.get(uid)
        if u is None:
            continue
        a = attendance_map.get(uid)
        s = active_sessions.get(uid)
        first_evt = events.get(a.first_login_event_id) if a and a.first_login_event_id else None
        last_evt = events.get(a.last_logout_event_id) if a and a.last_logout_event_id else None

        flags: list[str] = []

        # Location flags (from first login event of the day).
        if first_evt is not None:
            gp = first_evt.geo_permission.value
            if gp == "denied":
                flags.append("location_denied")
            elif gp == "unavailable":
                flags.append("location_unavailable")
            if first_evt.inside_site is False:
                flags.append("outside_geofence")

        session_seconds = a.total_session_seconds if a else 0
        logged_seconds = a.logged_seconds if a else 0

        if a is None and s is None and entry_counts.get(uid, 0) == 0:
            flags.append("no_activity")
        if s is not None:
            flags.append("open_session")
        if a is not None and a.last_logout_at is None and s is None:
            flags.append("no_logout")
        if a is None and entry_counts.get(uid, 0) > 0:
            flags.append("missing_attendance")
        if session_seconds and logged_seconds and abs(session_seconds - logged_seconds) > threshold_seconds:
            flags.append("variance_exceeds_threshold")

        rows.append(
            {
                "user_id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "timezone": u.timezone,
                "work_date": work_date,
                "first_login_at": a.first_login_at if a else None,
                "last_logout_at": a.last_logout_at if a else None,
                "first_login_event": first_evt,
                "last_logout_event": last_evt,
                "active_session": s,
                "total_session_seconds": session_seconds,
                "logged_seconds": logged_seconds,
                "entry_count": entry_counts.get(uid, 0),
                "billable_minutes": billable_minutes.get(uid, 0),
                "attendance_status": a.status.value if a else None,
                "flags": flags,
            }
        )

    rows.sort(key=lambda r: r["full_name"].lower())
    return {
        "team_id": team.id,
        "team_name": team.name,
        "work_date": work_date,
        "variance_threshold_minutes": threshold,
        "rows": rows,
    }


async def get_timeline(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID,
    is_admin: bool,
    team_id: uuid.UUID,
    target_user_id: uuid.UUID,
    work_date: date,
) -> dict:
    """Timeline for one team member on one work_date.

    Location capture is at login/logout only, so events are naturally sparse.
    """
    await _assert_can_view_team(db, actor_id=actor_id, is_admin=is_admin, team_id=team_id)

    # Target must belong to the team.
    belongs = (
        await db.execute(
            select(TeamMember.id).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == target_user_id,
            ).limit(1)
        )
    ).first()
    if belongs is None:
        raise NotFound("User is not a member of this team")

    user = (
        await db.execute(select(AppUser).where(AppUser.id == target_user_id))
    ).scalar_one_or_none()
    if user is None:
        raise NotFound("User not found")

    from app.models.organization import Organization

    org = (
        await db.execute(select(Organization).where(Organization.id == user.org_id))
    ).scalar_one()
    tz_name = user.timezone or org.default_timezone
    start_utc, end_utc = work_date_window_utc(work_date, tz_name, org.workday_cutoff)

    attendance = (
        await db.execute(
            select(AttendanceDay).where(
                AttendanceDay.user_id == target_user_id,
                AttendanceDay.work_date == work_date,
            )
        )
    ).scalar_one_or_none()

    events = list(
        (
            await db.execute(
                select(GeoEvent)
                .where(
                    GeoEvent.user_id == target_user_id,
                    GeoEvent.occurred_at >= start_utc,
                    GeoEvent.occurred_at < end_utc,
                    GeoEvent.event_type.in_([GeoEventType.login, GeoEventType.logout]),
                )
                .order_by(GeoEvent.occurred_at.asc())
            )
        ).scalars()
    )

    sessions = list(
        (
            await db.execute(
                select(WorkSession)
                .where(
                    WorkSession.user_id == target_user_id,
                    WorkSession.login_at >= start_utc,
                    WorkSession.login_at < end_utc,
                )
                .order_by(WorkSession.login_at.asc())
            )
        ).scalars()
    )

    # Match events to sessions by login_event_id/logout_event_id.
    event_to_session: dict[uuid.UUID, uuid.UUID] = {}
    for s in sessions:
        if s.login_event_id:
            event_to_session[s.login_event_id] = s.id
        if s.logout_event_id:
            event_to_session[s.logout_event_id] = s.id

    timeline: list[dict] = []
    for e in events:
        timeline.append(
            {
                "kind": e.event_type.value,
                "occurred_at": e.occurred_at,
                "latitude": float(e.latitude) if e.latitude is not None else None,
                "longitude": float(e.longitude) if e.longitude is not None else None,
                "accuracy_m": float(e.accuracy_m) if e.accuracy_m is not None else None,
                "place_label": e.place_label,
                "inside_site": e.inside_site,
                "geo_permission": e.geo_permission.value,
                "ip": str(e.ip_address) if e.ip_address else None,
                "device_id": e.device_id,
                "session_id": event_to_session.get(e.id),
            }
        )

    return {
        "user": {
            "user_id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "timezone": user.timezone,
        },
        "work_date": work_date,
        "attendance_day_id": attendance.id if attendance else None,
        "attendance_status": attendance.status.value if attendance else None,
        "first_login_at": attendance.first_login_at if attendance else None,
        "last_logout_at": attendance.last_logout_at if attendance else None,
        "total_session_seconds": attendance.total_session_seconds if attendance else 0,
        "logged_seconds": attendance.logged_seconds if attendance else 0,
        "events": timeline,
        "sessions": sessions,
    }