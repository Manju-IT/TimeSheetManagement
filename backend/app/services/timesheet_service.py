"""Weekly timesheet and approval workflow.

State machine:
    draft -> submitted -> {approved | rejected}
    rejected -> draft (owner reopens)
    approved -> terminal

Attendance-day integration:
    closed  -> submitted  (on submit)
    submitted -> approved (on approve)
    submitted -> rejected (on reject)
    rejected -> closed    (on reopen)

Entries are transitioned alongside the period and always move as a group.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.work_session import WorkSession

from app.core.exceptions import (
    Conflict,
    Forbidden,
    NotFound,
    OptimisticConcurrencyError,
)
from app.core.locks import acquire_advisory_locks
from app.core.logging import get_logger
from app.core.state_machines import (
    ATTENDANCE_DAY_TRANSITIONS,
    TIME_ENTRY_TRANSITIONS,
    TIMESHEET_PERIOD_TRANSITIONS,
    assert_transition,
)
from app.models.attendance_day import AttendanceDay
from app.models.enums import (
    AttendanceStatus,
    TimeEntryStatus,
    TimesheetStatus,
)
from app.models.organization import OrgPolicy
from app.models.project import Project
from app.models.team import TeamMember
from app.models.time_entry import TimeEntry
from app.models.timesheet_period import TimesheetPeriod
from app.models.user import AppUser
from app.services import audit_service, attendance_service

log = get_logger("app.timesheet_service")

_WEEKDAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _week_bounds(any_day: date) -> tuple[date, date]:
    start = any_day - timedelta(days=any_day.weekday())  # Monday
    return start, start + timedelta(days=6)


def _iter_days(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


# --------------------------------------------------------------------------- #
# Loaders / creation
# --------------------------------------------------------------------------- #

async def get_period(db: AsyncSession, period_id: uuid.UUID) -> TimesheetPeriod | None:
    return (
        await db.execute(select(TimesheetPeriod).where(TimesheetPeriod.id == period_id))
    ).scalar_one_or_none()


async def get_period_or_404(db: AsyncSession, period_id: uuid.UUID) -> TimesheetPeriod:
    p = await get_period(db, period_id)
    if p is None:
        raise NotFound("Timesheet period not found")
    return p


async def get_or_create_for_week(
    db: AsyncSession, *, user_id: uuid.UUID, any_day: date
) -> TimesheetPeriod:
    start, end = _week_bounds(any_day)
    row = (
        await db.execute(
            select(TimesheetPeriod).where(
                TimesheetPeriod.user_id == user_id,
                TimesheetPeriod.period_start == start,
                TimesheetPeriod.period_end == end,
            )
        )
    ).scalar_one_or_none()
    if row is not None:
        return row
    row = TimesheetPeriod(
        user_id=user_id,
        period_start=start,
        period_end=end,
        status=TimesheetStatus.draft,
        version=1,
    )
    db.add(row)
    await db.flush()
    return row


# --------------------------------------------------------------------------- #
# Grid
# --------------------------------------------------------------------------- #

@dataclass
class GridData:
    period: TimesheetPeriod
    days: list[dict]
    rows: list[dict]
    daily_totals: dict[str, int]
    weekly_total_minutes: int
    variance_threshold_minutes: int


async def build_grid(
    db: AsyncSession, *, user_id: uuid.UUID, period: TimesheetPeriod
) -> GridData:
    today = datetime.now(timezone.utc).date()

    # Entries in the week.
    entries = list(
        (
            await db.execute(
                select(TimeEntry).where(
                    TimeEntry.user_id == user_id,
                    TimeEntry.work_date >= period.period_start,
                    TimeEntry.work_date <= period.period_end,
                )
            )
        ).scalars()
    )

    # Attendance days.
    attendance_rows = list(
        (
            await db.execute(
                select(AttendanceDay).where(
                    AttendanceDay.user_id == user_id,
                    AttendanceDay.work_date >= period.period_start,
                    AttendanceDay.work_date <= period.period_end,
                )
            )
        ).scalars()
    )
    attendance_by_date = {a.work_date: a for a in attendance_rows}

    active = (
        await db.execute(
            select(WorkSession).where(
                WorkSession.user_id == user_id, WorkSession.logout_at.is_(None)
            )
        )
    ).scalar_one_or_none()

    # Threshold from org policy.
    org_id = (
        await db.execute(select(AppUser.org_id).where(AppUser.id == user_id))
    ).scalar_one()
    threshold = (
        await db.execute(
            select(OrgPolicy.variance_threshold_minutes).where(OrgPolicy.org_id == org_id)
        )
    ).scalar_one_or_none()
    threshold_minutes = int(threshold) if threshold is not None else 60

    # ---- Days array (always 7) ------------------------------------------- #
    logged_by_date: dict[date, int] = {}
    for e in entries:
        logged_by_date[e.work_date] = logged_by_date.get(e.work_date, 0) + e.duration_minutes

    days: list[dict] = []
    for d in _iter_days(period.period_start, period.period_end):
        a = attendance_by_date.get(d)
        logged_minutes = logged_by_date.get(d, 0)
        session_seconds = a.total_session_seconds if a else 0
        variance_seconds = session_seconds - logged_minutes * 60
        days.append(
            {
                "work_date": d,
                "weekday": _WEEKDAY_ABBR[d.weekday()],
                "is_future": d > today,
                "first_login_at": a.first_login_at if a else None,
                "last_logout_at": a.last_logout_at if a else None,
                "total_session_seconds": session_seconds,
                "logged_seconds": logged_minutes * 60,
                "attendance_status": a.status.value if a else None,
                "has_open_session": bool(
                    active is not None and active.login_at.date() == d
                ),
                "missing_attendance": a is None and logged_minutes > 0,
                "variance_seconds": variance_seconds,
                "variance_exceeds_threshold": (
                    (a is not None or logged_minutes > 0)
                    and abs(variance_seconds) > threshold_minutes * 60
                ),
            }
        )

    # ---- Rows (project/task grouping) ------------------------------------ #
    project_ids = {e.project_id for e in entries}
    projects: dict[uuid.UUID, Project] = {}
    if project_ids:
        projects = {
            p.id: p
            for p in (
                await db.execute(select(Project).where(Project.id.in_(project_ids)))
            ).scalars()
        }

    row_key_to_cells: dict[tuple[uuid.UUID, uuid.UUID | None], dict[str, dict]] = {}
    row_key_to_title: dict[tuple[uuid.UUID, uuid.UUID | None], str | None] = {}

    for e in entries:
        key = (e.project_id, e.task_id)
        cells = row_key_to_cells.setdefault(key, {})
        iso = e.work_date.isoformat()
        cell = cells.setdefault(iso, {"minutes": 0, "entry_ids": []})
        cell["minutes"] += e.duration_minutes
        cell["entry_ids"].append(e.id)
        row_key_to_title.setdefault(key, e.task_title_snapshot)

    rows: list[dict] = []
    for (project_id, task_id), cells in row_key_to_cells.items():
        proj = projects.get(project_id)
        total = sum(c["minutes"] for c in cells.values())
        rows.append(
            {
                "project_id": project_id,
                "project_name": proj.name if proj else "(deleted project)",
                "project_code": proj.code if proj else None,
                "task_id": task_id,
                "task_title": row_key_to_title.get((project_id, task_id)),
                "cells": cells,
                "total_minutes": total,
            }
        )

    rows.sort(key=lambda r: (r["project_name"].lower(), (r["task_title"] or "").lower()))

    # ---- Totals ---------------------------------------------------------- #
    daily_totals: dict[str, int] = {
        d["work_date"].isoformat(): 0 for d in days
    }
    weekly_total = 0
    for r in rows:
        for iso, c in r["cells"].items():
            if iso in daily_totals:
                daily_totals[iso] += c["minutes"]
                weekly_total += c["minutes"]

    return GridData(
        period=period,
        days=days,
        rows=rows,
        daily_totals=daily_totals,
        weekly_total_minutes=weekly_total,
        variance_threshold_minutes=threshold_minutes,
    )


# --------------------------------------------------------------------------- #
# Entry and attendance-day bulk transitions
# --------------------------------------------------------------------------- #

async def _list_entries_in_period(
    db: AsyncSession, *, user_id: uuid.UUID, start: date, end: date, for_update: bool = True
) -> list[TimeEntry]:
    stmt = select(TimeEntry).where(
        TimeEntry.user_id == user_id,
        TimeEntry.work_date >= start,
        TimeEntry.work_date <= end,
    )
    if for_update:
        stmt = stmt.with_for_update()
    return list((await db.execute(stmt)).scalars())


async def _list_days_in_period(
    db: AsyncSession, *, user_id: uuid.UUID, start: date, end: date, for_update: bool = True
) -> list[AttendanceDay]:
    stmt = select(AttendanceDay).where(
        AttendanceDay.user_id == user_id,
        AttendanceDay.work_date >= start,
        AttendanceDay.work_date <= end,
    )
    if for_update:
        stmt = stmt.with_for_update()
    return list((await db.execute(stmt)).scalars())


async def _transition_entries(
    db: AsyncSession,
    *,
    entries: list[TimeEntry],
    allowed_from: set[TimeEntryStatus],
    target: TimeEntryStatus,
    actor_id: uuid.UUID,
    action: str,
    ip: str | None,
) -> int:
    count = 0
    for e in entries:
        if e.status not in allowed_from:
            continue
        assert_transition(
            TIME_ENTRY_TRANSITIONS, e.status.value, target.value, entity="time_entry"
        )
        before = e.status.value
        e.status = target
        e.version += 1
        count += 1
        await audit_service.record(
            db,
            actor_user_id=actor_id,
            action=f"time_entry.{action}",
            entity="time_entry",
            entity_id=e.id,
            before={"status": before, "version": e.version - 1},
            after={"status": target.value, "version": e.version},
            ip=ip,
        )
    return count


async def _transition_days(
    db: AsyncSession,
    *,
    days: list[AttendanceDay],
    allowed_from: set[AttendanceStatus],
    target: AttendanceStatus,
    actor_id: uuid.UUID,
    action: str,
    ip: str | None,
) -> int:
    count = 0
    for d in days:
        if d.status not in allowed_from:
            continue
        assert_transition(
            ATTENDANCE_DAY_TRANSITIONS, d.status.value, target.value,
            entity="attendance_day",
        )
        before = d.status.value
        d.status = target
        count += 1
        await audit_service.record(
            db,
            actor_user_id=actor_id,
            action=f"attendance_day.{action}",
            entity="attendance_day",
            entity_id=d.id,
            before={"status": before},
            after={"status": target.value},
            ip=ip,
        )
    return count


# --------------------------------------------------------------------------- #
# Manager scoping
# --------------------------------------------------------------------------- #

async def _assert_manager_can_review(
    db: AsyncSession, *, manager_id: uuid.UUID, target_user_id: uuid.UUID, is_admin: bool
) -> None:
    if is_admin or manager_id == target_user_id:
        return
    managed = [
        tid
        for (tid,) in (
            await db.execute(
                select(TeamMember.team_id).where(
                    TeamMember.user_id == manager_id,
                    TeamMember.is_manager.is_(True),
                )
            )
        ).all()
    ]
    if not managed:
        raise Forbidden("You do not manage any teams")
    overlap = (
        await db.execute(
            select(TeamMember.id)
            .where(
                TeamMember.user_id == target_user_id,
                TeamMember.team_id.in_(managed),
            )
            .limit(1)
        )
    ).first()
    if overlap is None:
        raise Forbidden("This user is not on a team you manage")


# --------------------------------------------------------------------------- #
# Submit
# --------------------------------------------------------------------------- #

@dataclass
class SubmitResult:
    period: TimesheetPeriod
    entries_transitioned: int
    days_transitioned: int



async def submit_week(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    period_id: uuid.UUID,
    expected_version: int,
    ip: str | None,
) -> SubmitResult:
    # Serialize attendance and timesheet mutations.
    await acquire_advisory_locks(db, f"attendance:{user_id}")
    await acquire_advisory_locks(db, f"timesheet:{period_id}")

    period = (
        await db.execute(
            select(TimesheetPeriod)
            .where(TimesheetPeriod.id == period_id)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if period is None:
        raise NotFound("Timesheet period not found")

    if period.user_id != user_id:
        raise Forbidden("Only the owner can submit this period")

    if period.version != expected_version:
        raise OptimisticConcurrencyError(
            "This period was modified by another session",
            details={
                "expected": expected_version,
                "actual": period.version,
            },
        )

    assert_transition(
        TIMESHEET_PERIOD_TRANSITIONS,
        period.status.value,
        TimesheetStatus.submitted.value,
        entity="timesheet_period",
    )

    entries = await _list_entries_in_period(
        db,
        user_id=user_id,
        start=period.period_start,
        end=period.period_end,
    )

    if not entries:
        raise Conflict(
            "Cannot submit a week with no time entries",
            details={"code": "EMPTY_WEEK"},
        )

    # Every entry must be a draft before submission.
    bad_entries = [
        entry
        for entry in entries
        if entry.status != TimeEntryStatus.draft
    ]

    if bad_entries:
        raise Conflict(
            "Some entries are not editable. Reopen the week to make changes.",
            details={
                "code": "ENTRIES_NOT_DRAFT",
                "entry_ids": [
                    str(entry.id) for entry in bad_entries[:5]
                ],
            },
        )

    days = await _list_days_in_period(
        db,
        user_id=user_id,
        start=period.period_start,
        end=period.period_end,
    )

    # Check actual active sessions rather than trusting attendance status.
    active_sessions = list(
        (
            await db.execute(
                select(WorkSession).where(
                    WorkSession.user_id == user_id,
                    WorkSession.logout_at.is_(None),
                )
            )
        ).scalars()
    )

    active_work_dates: set[date] = set()

    if active_sessions:
        user = await attendance_service._load_user(db, user_id)
        org = await attendance_service._load_org(db, user.org_id)
        tz_name = attendance_service._user_tz(user, org)

        active_work_dates = {
            attendance_service.work_date_for(
                session.login_at,
                tz_name,
                org.workday_cutoff,
            )
            for session in active_sessions
        }

    # A real active session within this week blocks submission.
    active_dates_in_period = sorted(
        work_date
        for work_date in active_work_dates
        if period.period_start <= work_date <= period.period_end
    )

    if active_dates_in_period:
        raise Conflict(
            "Close your active session before submitting the week.",
            details={
                "code": "OPEN_ATTENDANCE_DAY",
                "dates": [
                    work_date.isoformat()
                    for work_date in active_dates_in_period
                ],
            },
        )

    # Repair legacy/inconsistent records: a day may still be marked open
    # even though the user's session has already been closed.
    for day in days:
        if (
            day.status == AttendanceStatus.open
            and day.work_date not in active_work_dates
        ):
            assert_transition(
                ATTENDANCE_DAY_TRANSITIONS,
                day.status.value,
                AttendanceStatus.closed.value,
                entity="attendance_day",
                details={"reason": "submit_reconciliation"},
            )

            previous_status = day.status
            day.status = AttendanceStatus.closed

            await audit_service.record(
                db,
                actor_user_id=user_id,
                action="attendance.close",
                entity="attendance_day",
                entity_id=day.id,
                before={"status": previous_status.value},
                after={
                    "status": AttendanceStatus.closed.value,
                    "reason": "submit_reconciliation",
                },
                ip=ip,
            )

    # IMPORTANT: transition entries only after all validation succeeds.
    entries_count = await _transition_entries(
        db,
        entries=entries,
        allowed_from={TimeEntryStatus.draft},
        target=TimeEntryStatus.submitted,
        actor_id=user_id,
        action="submit",
        ip=ip,
    )

    # Closed attendance days transition to submitted.
    days_count = await _transition_days(
        db,
        days=days,
        allowed_from={AttendanceStatus.closed},
        target=AttendanceStatus.submitted,
        actor_id=user_id,
        action="submit",
        ip=ip,
    )

    # Update the timesheet period.
    previous_status = period.status
    previous_version = period.version

    period.status = TimesheetStatus.submitted
    period.submitted_at = datetime.now(timezone.utc)
    period.version += 1

    await db.flush()

    await audit_service.record(
        db,
        actor_user_id=user_id,
        action="timesheet.submit",
        entity="timesheet_period",
        entity_id=period.id,
        before={
            "status": previous_status.value,
            "version": previous_version,
        },
        after={
            "status": period.status.value,
            "version": period.version,
            "entries_transitioned": entries_count,
            "days_transitioned": days_count,
        },
        ip=ip,
    )

    return SubmitResult(
        period=period,
        entries_transitioned=entries_count,
        days_transitioned=days_count,
    )

# --------------------------------------------------------------------------- #
# Approve / reject
# --------------------------------------------------------------------------- #

async def approve_week(
    db: AsyncSession,
    *,
    manager_id: uuid.UUID,
    is_admin: bool,
    period_id: uuid.UUID,
    expected_version: int,
    comment: str | None,
    ip: str | None,
) -> TimesheetPeriod:
    return await _review(
        db,
        reviewer_id=manager_id,
        is_admin=is_admin,
        period_id=period_id,
        expected_version=expected_version,
        target=TimesheetStatus.approved,
        comment=comment,
        ip=ip,
    )


async def reject_week(
    db: AsyncSession,
    *,
    manager_id: uuid.UUID,
    is_admin: bool,
    period_id: uuid.UUID,
    expected_version: int,
    comment: str | None,
    ip: str | None,
) -> TimesheetPeriod:
    if not comment or not comment.strip():
        raise Conflict(
            "A comment is required when requesting changes",
            details={"code": "COMMENT_REQUIRED"},
        )
    return await _review(
        db,
        reviewer_id=manager_id,
        is_admin=is_admin,
        period_id=period_id,
        expected_version=expected_version,
        target=TimesheetStatus.rejected,
        comment=comment.strip(),
        ip=ip,
    )


async def _review(
    db: AsyncSession,
    *,
    reviewer_id: uuid.UUID,
    is_admin: bool,
    period_id: uuid.UUID,
    expected_version: int,
    target: TimesheetStatus,
    comment: str | None,
    ip: str | None,
) -> TimesheetPeriod:
    await acquire_advisory_locks(db, f"timesheet:{period_id}")

    period = (
        await db.execute(
            select(TimesheetPeriod)
            .where(TimesheetPeriod.id == period_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if period is None:
        raise NotFound("Timesheet period not found")
    if period.version != expected_version:
        raise OptimisticConcurrencyError(
            "This period was modified by another session",
            details={"expected": expected_version, "actual": period.version},
        )

    await _assert_manager_can_review(
        db,
        manager_id=reviewer_id,
        target_user_id=period.user_id,
        is_admin=is_admin,
    )

    assert_transition(
        TIMESHEET_PERIOD_TRANSITIONS,
        period.status.value,
        target.value,
        entity="timesheet_period",
    )

    entries = await _list_entries_in_period(
        db, user_id=period.user_id,
        start=period.period_start, end=period.period_end,
    )
    days = await _list_days_in_period(
        db, user_id=period.user_id,
        start=period.period_start, end=period.period_end,
    )

    entry_target = (
        TimeEntryStatus.approved
        if target == TimesheetStatus.approved
        else TimeEntryStatus.rejected
    )
    day_target = (
        AttendanceStatus.approved
        if target == TimesheetStatus.approved
        else AttendanceStatus.rejected
    )

    await _transition_entries(
        db,
        entries=entries,
        allowed_from={TimeEntryStatus.submitted},
        target=entry_target,
        actor_id=reviewer_id,
        action=target.value,
        ip=ip,
    )
    await _transition_days(
        db,
        days=days,
        allowed_from={AttendanceStatus.submitted},
        target=day_target,
        actor_id=reviewer_id,
        action=target.value,
        ip=ip,
    )

    before_status = period.status.value
    period.status = target
    period.comment = comment
    if target == TimesheetStatus.approved:
        period.approved_by = reviewer_id
        period.approved_at = datetime.now(timezone.utc)
    period.version += 1
    await db.flush()

    await audit_service.record(
        db,
        actor_user_id=reviewer_id,
        action=f"timesheet.{target.value}",
        entity="timesheet_period",
        entity_id=period.id,
        before={"status": before_status, "version": expected_version},
        after={
            "status": target.value,
            "version": period.version,
            "comment": comment,
        },
        ip=ip,
    )
    return period


# --------------------------------------------------------------------------- #
# Reopen
# --------------------------------------------------------------------------- #

async def reopen_week(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    period_id: uuid.UUID,
    expected_version: int,
    ip: str | None,
) -> TimesheetPeriod:
    await acquire_advisory_locks(db, f"timesheet:{period_id}")

    period = (
        await db.execute(
            select(TimesheetPeriod)
            .where(TimesheetPeriod.id == period_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if period is None:
        raise NotFound("Timesheet period not found")
    if period.user_id != user_id:
        raise Forbidden("Only the owner can reopen this period")
    if period.version != expected_version:
        raise OptimisticConcurrencyError(
            "This period was modified by another session",
            details={"expected": expected_version, "actual": period.version},
        )

    assert_transition(
        TIMESHEET_PERIOD_TRANSITIONS,
        period.status.value,
        TimesheetStatus.draft.value,
        entity="timesheet_period",
    )

    entries = await _list_entries_in_period(
        db, user_id=user_id,
        start=period.period_start, end=period.period_end,
    )
    days = await _list_days_in_period(
        db, user_id=user_id,
        start=period.period_start, end=period.period_end,
    )

    await _transition_entries(
        db,
        entries=entries,
        allowed_from={TimeEntryStatus.rejected},
        target=TimeEntryStatus.draft,
        actor_id=user_id,
        action="reopen",
        ip=ip,
    )
    await _transition_days(
        db,
        days=days,
        allowed_from={AttendanceStatus.rejected},
        target=AttendanceStatus.closed,
        actor_id=user_id,
        action="reopen",
        ip=ip,
    )

    period.status = TimesheetStatus.draft
    period.version += 1
    await db.flush()

    await audit_service.record(
        db,
        actor_user_id=user_id,
        action="timesheet.reopen",
        entity="timesheet_period",
        entity_id=period.id,
        before={"status": "rejected", "version": expected_version},
        after={"status": "draft", "version": period.version},
        ip=ip,
    )
    return period


# --------------------------------------------------------------------------- #
# Listings
# --------------------------------------------------------------------------- #

async def list_periods_for_user(
    db: AsyncSession, *, user_id: uuid.UUID, offset: int, limit: int
) -> tuple[list[TimesheetPeriod], int]:
    total = (
        await db.execute(
            select(func.count(TimesheetPeriod.id)).where(TimesheetPeriod.user_id == user_id)
        )
    ).scalar_one()
    rows = list(
        (
            await db.execute(
                select(TimesheetPeriod)
                .where(TimesheetPeriod.user_id == user_id)
                .order_by(TimesheetPeriod.period_start.desc())
                .offset(offset)
                .limit(limit)
            )
        ).scalars()
    )
    return rows, total


async def list_periods_for_review(
    db: AsyncSession,
    *,
    manager_id: uuid.UUID,
    is_admin: bool,
    status: TimesheetStatus | None,
    offset: int,
    limit: int,
) -> tuple[list[tuple[TimesheetPeriod, AppUser]], int]:
    """Returns (period, user) tuples scoped to the manager's teams."""
    base = select(TimesheetPeriod, AppUser).join(AppUser, AppUser.id == TimesheetPeriod.user_id)
    count = select(func.count(TimesheetPeriod.id))

    if status is not None:
        base = base.where(TimesheetPeriod.status == status)
        count = count.where(TimesheetPeriod.status == status)

    if not is_admin:
        managed_team_ids = [
            tid
            for (tid,) in (
                await db.execute(
                    select(TeamMember.team_id).where(
                        TeamMember.user_id == manager_id,
                        TeamMember.is_manager.is_(True),
                    )
                )
            ).all()
        ]
        if not managed_team_ids:
            return [], 0
        member_ids = [
            uid
            for (uid,) in (
                await db.execute(
                    select(TeamMember.user_id)
                    .where(TeamMember.team_id.in_(managed_team_ids))
                    .distinct()
                )
            ).all()
        ]
        if not member_ids:
            return [], 0
        base = base.where(TimesheetPeriod.user_id.in_(member_ids))
        count = count.where(TimesheetPeriod.user_id.in_(member_ids))

    total = (await db.execute(count)).scalar_one()
    rows = list(
        (
            await db.execute(
                base.order_by(TimesheetPeriod.submitted_at.desc().nullslast())
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )
    return rows, total