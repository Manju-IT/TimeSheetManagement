from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.models.attendance_day import AttendanceDay
from app.models.geo_event import GeoEvent
from app.models.organization import Organization
from app.models.team import Team, TeamMember
from app.models.time_entry import TimeEntry
from app.models.user import AppUser
from app.models.work_session import WorkSession
from app.schemas.attendance import TeamAttendanceRow
from app.utils.timezone import work_date_for


router = APIRouter(
    prefix="/team",
    tags=["team-attendance"],
)


@router.get(
    "/attendance",
    response_model=list[TeamAttendanceRow],
)
async def team_attendance(
    team_id: uuid.UUID | None = Query(default=None),
    work_date: date | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TeamAttendanceRow]:
    """
    Return attendance information for members of teams managed by the
    current user.

    If team_id is supplied, the caller must be a manager of that team.

    If work_date is omitted, the current user's organization/user timezone
    and workday cutoff are used to determine today's work date.
    """

    # ---------------------------------------------------------
    # 1. Load current application user
    # ---------------------------------------------------------

    app_user = (
        await db.execute(
            select(AppUser).where(AppUser.id == user.id)
        )
    ).scalar_one_or_none()

    if app_user is None:
        return []

    # ---------------------------------------------------------
    # 2. Load organization
    # ---------------------------------------------------------

    org = (
        await db.execute(
            select(Organization).where(
                Organization.id == app_user.org_id
            )
        )
    ).scalar_one()

    # ---------------------------------------------------------
    # 3. Resolve work date
    # ---------------------------------------------------------

    if work_date is None:
        tz_name = app_user.timezone or org.default_timezone

        work_date = work_date_for(
            datetime.now(timezone.utc),
            tz_name,
            org.workday_cutoff,
        )

    # ---------------------------------------------------------
    # 4. Find teams managed by the current user
    # ---------------------------------------------------------

    managed_team_query = (
        select(Team)
        .join(
            TeamMember,
            TeamMember.team_id == Team.id,
        )
        .where(
            TeamMember.user_id == user.id,
            TeamMember.is_manager.is_(True),
            Team.org_id == app_user.org_id,
        )
    )

    if team_id is not None:
        managed_team_query = managed_team_query.where(
            Team.id == team_id
        )

    managed_teams = list(
        (
            await db.execute(
                managed_team_query
            )
        ).scalars()
    )

    # The caller does not manage the requested team.
    if team_id is not None and not managed_teams:
        return []

    if not managed_teams:
        return []

    managed_team_ids = [team.id for team in managed_teams]

    # ---------------------------------------------------------
    # 5. Get members belonging to those teams
    # ---------------------------------------------------------

    member_rows = list(
        (
            await db.execute(
                select(TeamMember).where(
                    TeamMember.team_id.in_(managed_team_ids)
                )
            )
        ).scalars()
    )

    # A user can belong to multiple managed teams.
    # Deduplicate users for the attendance response.
    member_user_ids = list(
        dict.fromkeys(
            member.user_id
            for member in member_rows
        )
    )

    if not member_user_ids:
        return []

    # ---------------------------------------------------------
    # 6. Load users
    # ---------------------------------------------------------

    users = {
        row.id: row
        for row in (
            await db.execute(
                select(AppUser).where(
                    AppUser.id.in_(member_user_ids),
                    AppUser.org_id == app_user.org_id,
                )
            )
        ).scalars()
    }

    # ---------------------------------------------------------
    # 7. Load attendance days
    # ---------------------------------------------------------

    attendance_days = {
        row.user_id: row
        for row in (
            await db.execute(
                select(AttendanceDay).where(
                    AttendanceDay.user_id.in_(member_user_ids),
                    AttendanceDay.work_date == work_date,
                )
            )
        ).scalars()
    }

    # ---------------------------------------------------------
    # 8. Load active work sessions
    # ---------------------------------------------------------

    active_sessions = {
        row.user_id: row
        for row in (
            await db.execute(
                select(WorkSession).where(
                    WorkSession.user_id.in_(member_user_ids),
                    WorkSession.logout_at.is_(None),
                )
            )
        ).scalars()
    }

    # ---------------------------------------------------------
    # 9. Load first login events
    # ---------------------------------------------------------

    first_event_ids = [
        attendance.first_login_event_id
        for attendance in attendance_days.values()
        if attendance.first_login_event_id is not None
    ]

    first_login_events: dict[uuid.UUID, GeoEvent] = {}

    if first_event_ids:
        first_login_events = {
            event.id: event
            for event in (
                await db.execute(
                    select(GeoEvent).where(
                        GeoEvent.id.in_(first_event_ids)
                    )
                )
            ).scalars()
        }

    # ---------------------------------------------------------
    # 10. Load last logout events
    # ---------------------------------------------------------

    last_event_ids = [
        attendance.last_logout_event_id
        for attendance in attendance_days.values()
        if attendance.last_logout_event_id is not None
    ]

    last_logout_events: dict[uuid.UUID, GeoEvent] = {}

    if last_event_ids:
        last_logout_events = {
            event.id: event
            for event in (
                await db.execute(
                    select(GeoEvent).where(
                        GeoEvent.id.in_(last_event_ids)
                    )
                )
            ).scalars()
        }

    # ---------------------------------------------------------
    # 11. Count time entries for each member
    # ---------------------------------------------------------

    entry_counts = {
        user_id: count
        for user_id, count in (
            await db.execute(
                select(
                    TimeEntry.user_id,
                    func.count(TimeEntry.id),
                )
                .where(
                    TimeEntry.user_id.in_(member_user_ids),
                    TimeEntry.work_date == work_date,
                )
                .group_by(TimeEntry.user_id)
            )
        ).all()
    }

    # ---------------------------------------------------------
    # 12. Build response
    # ---------------------------------------------------------

    response: list[TeamAttendanceRow] = []

    for member_user_id in member_user_ids:
        app_member = users.get(member_user_id)

        if app_member is None:
            continue

        attendance = attendance_days.get(member_user_id)
        active_session = active_sessions.get(member_user_id)

        first_event = None
        last_event = None

        if attendance is not None:
            if attendance.first_login_event_id:
                first_event = first_login_events.get(
                    attendance.first_login_event_id
                )

            if attendance.last_logout_event_id:
                last_event = last_logout_events.get(
                    attendance.last_logout_event_id
                )

        # -----------------------------------------------------
        # Flags
        # -----------------------------------------------------

        flags: list[str] = []

        if attendance is None:
            flags.append("not_checked_in")

        else:
            if active_session is not None:
                flags.append("active_session")

            if (
                attendance.first_login_at is not None
                and attendance.last_logout_at is None
                and active_session is None
            ):
                flags.append("missing_checkout")

            if (
                first_event is not None
                and first_event.inside_site is False
            ):
                flags.append("off_site")

        response.append(
            TeamAttendanceRow(
                user_id=app_member.id,
                email=app_member.email,
                full_name=app_member.full_name,
                attendance_day=attendance,
                active_session=active_session,
                first_login_event=first_event,
                last_logout_event=last_event,
                entry_count=entry_counts.get(
                    member_user_id,
                    0,
                ),
                flags=flags,
            )
        )

    return response