from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time as dtime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    Conflict,
    Forbidden,
    NotFound,
    OptimisticConcurrencyError,
    ValidationError,
)
from app.core.state_machines import TIME_ENTRY_TRANSITIONS, assert_transition
from app.models.enums import TimeEntryStatus
from app.models.organization import Organization
from app.models.project import Project
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.user import AppUser
from app.services import attendance_service, audit_service, code_link_service
from app.utils.timezone import work_date_for


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

async def _assert_week_is_editable(
    db: AsyncSession,
    user_id: uuid.UUID,
    work_date: date,
) -> None:
    """Refuse changes when the user's timesheet for that week is locked."""

    from app.models.enums import TimesheetStatus
    from app.models.timesheet_period import TimesheetPeriod

    period = (
        await db.execute(
            select(TimesheetPeriod).where(
                TimesheetPeriod.user_id == user_id,
                TimesheetPeriod.period_start <= work_date,
                TimesheetPeriod.period_end >= work_date,
                TimesheetPeriod.status.in_(
                    [
                        TimesheetStatus.submitted,
                        TimesheetStatus.approved,
                    ]
                ),
            )
        )
    ).scalar_one_or_none()

    if period is not None:
        raise Conflict(
            "This week's timesheet is locked and cannot accept changes",
            details={
                "code": "TIMESHEET_LOCKED",
                "period_id": str(period.id),
            },
        )


def _require_editable(entry: TimeEntry) -> None:
    if entry.status not in (
        TimeEntryStatus.draft,
        TimeEntryStatus.rejected,
    ):
        raise Conflict(
            "This time entry is locked and cannot be edited",
            details={
                "status": entry.status.value,
                "code": "TIME_ENTRY_LOCKED",
            },
        )


def _derive_duration(
    *,
    started_at: datetime | None,
    ended_at: datetime | None,
    duration_minutes: int | None,
) -> int:
    if started_at is not None and ended_at is not None:
        if ended_at <= started_at:
            raise ValidationError("ended_at must be after started_at")

        computed = int(
            (ended_at - started_at).total_seconds() // 60
        )

        if computed < 1:
            raise ValidationError(
                "Duration must be at least 1 minute"
            )

        if computed > 1440:
            raise ValidationError(
                "Duration cannot exceed 1440 minutes in a single entry"
            )

        if (
            duration_minutes is not None
            and abs(duration_minutes - computed) > 1
        ):
            raise ValidationError(
                "duration_minutes does not match started_at/ended_at",
                details={
                    "computed": computed,
                    "supplied": duration_minutes,
                },
            )

        return computed

    if duration_minutes is None:
        raise ValidationError(
            "duration_minutes is required when start/end are omitted"
        )

    if not (1 <= duration_minutes <= 1440):
        raise ValidationError(
            "duration_minutes must be between 1 and 1440"
        )

    return duration_minutes


async def _resolve_work_date(
    db: AsyncSession,
    user: AppUser,
    *,
    explicit: date | None,
    started_at: datetime | None,
) -> date:
    org = (
        await db.execute(
            select(Organization).where(
                Organization.id == user.org_id
            )
        )
    ).scalar_one()

    tz_name = user.timezone or org.default_timezone

    if explicit is not None:
        return explicit

    if started_at is not None:
        return work_date_for(
            started_at,
            tz_name,
            org.workday_cutoff,
        )

    return work_date_for(
        datetime.now(timezone.utc),
        tz_name,
        org.workday_cutoff,
    )


async def _check_overlap(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    started_at: datetime,
    ended_at: datetime,
    exclude_id: uuid.UUID | None = None,
) -> None:
    """Overlap check applies only when precise times are provided."""

    stmt = select(TimeEntry.id).where(
        TimeEntry.user_id == user_id,
        TimeEntry.status != TimeEntryStatus.rejected,
        TimeEntry.started_at.is_not(None),
        TimeEntry.ended_at.is_not(None),
        TimeEntry.started_at < ended_at,
        TimeEntry.ended_at > started_at,
    )

    if exclude_id is not None:
        stmt = stmt.where(TimeEntry.id != exclude_id)

    hit = (
        await db.execute(
            stmt.limit(1)
        )
    ).first()

    if hit is not None:
        raise Conflict(
            "This entry overlaps an existing time entry",
            details={
                "code": "TIME_ENTRY_OVERLAP",
            },
        )


async def _load_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> AppUser:
    user = (
        await db.execute(
            select(AppUser).where(
                AppUser.id == user_id
            )
        )
    ).scalar_one_or_none()

    if user is None:
        raise NotFound("User not found")

    return user


async def _load_project_or_404(
    db: AsyncSession,
    project_id: uuid.UUID,
) -> Project:
    project = (
        await db.execute(
            select(Project).where(
                Project.id == project_id
            )
        )
    ).scalar_one_or_none()

    if project is None:
        raise NotFound("Project not found")

    return project


async def _load_task_or_none(
    db: AsyncSession,
    task_id: uuid.UUID | None,
    project_id: uuid.UUID,
) -> Task | None:
    if task_id is None:
        return None

    task = (
        await db.execute(
            select(Task).where(
                Task.id == task_id
            )
        )
    ).scalar_one_or_none()

    if task is None:
        raise NotFound("Task not found")

    if task.project_id != project_id:
        raise ValidationError(
            "Task does not belong to the specified project"
        )

    return task


# --------------------------------------------------------------------------- #
# Loaders
# --------------------------------------------------------------------------- #


async def get_entry(
    db: AsyncSession,
    entry_id: uuid.UUID,
) -> TimeEntry | None:
    return (
        await db.execute(
            select(TimeEntry).where(
                TimeEntry.id == entry_id
            )
        )
    ).scalar_one_or_none()


async def get_entry_or_404(
    db: AsyncSession,
    entry_id: uuid.UUID,
) -> TimeEntry:
    entry = await get_entry(db, entry_id)

    if entry is None:
        raise NotFound("Time entry not found")

    return entry

async def _load_entry_with_code_links(
    db: AsyncSession,
    entry_id: uuid.UUID,
) -> TimeEntry:
    entry = (
        await db.execute(
            select(TimeEntry)
            .options(
                selectinload(TimeEntry.code_links)
            )
            .where(TimeEntry.id == entry_id)
        )
    ).scalar_one_or_none()

    if entry is None:
        raise NotFound("Time entry not found")

    return entry


async def list_entries(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    from_date: date | None,
    to_date: date | None,
    project_id: uuid.UUID | None = None,
    task_id: uuid.UUID | None = None,
    status: TimeEntryStatus | None = None,
    billable: bool | None = None,
    offset: int = 0,
    limit: int = 25,
) -> tuple[list[TimeEntry], int]:
    conds = [
        TimeEntry.user_id == user_id,
    ]

    if from_date is not None:
        conds.append(
            TimeEntry.work_date >= from_date
        )

    if to_date is not None:
        conds.append(
            TimeEntry.work_date <= to_date
        )

    if project_id is not None:
        conds.append(
            TimeEntry.project_id == project_id
        )

    if task_id is not None:
        conds.append(
            TimeEntry.task_id == task_id
        )

    if status is not None:
        conds.append(
            TimeEntry.status == status
        )

    if billable is not None:
        conds.append(
            TimeEntry.billable.is_(billable)
        )

    total = (
        await db.execute(
            select(
                func.count(TimeEntry.id)
            ).where(
                and_(*conds)
            )
        )
    ).scalar_one()

    rows = list(
        (
            await db.execute(
                select(TimeEntry)
                .options(selectinload(TimeEntry.code_links))
                .where(and_(*conds))
                .order_by(
                    TimeEntry.work_date.desc(),
                    TimeEntry.created_at.desc(),
                )
                .offset(offset)
                .limit(limit)
            )
        ).scalars()
    )

    return rows, total


# --------------------------------------------------------------------------- #
# Mutations
# --------------------------------------------------------------------------- #


@dataclass
class CreatedEntry:
    entry: TimeEntry
    was_idempotent_replay: bool


async def create_entry(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID,
    project_id: uuid.UUID,
    task_id: uuid.UUID | None,
    description: str,
    started_at: datetime | None,
    ended_at: datetime | None,
    duration_minutes: int | None,
    billable: bool,
    work_date: date | None,
    code_links: list[dict],
    client_idempotency_key: str | None,
    ip: str | None,
) -> CreatedEntry:
    user = await _load_user(
        db,
        actor_id,
    )

    # ------------------------------------------------------------------ #
    # Idempotency fast path.
    #
    # If this exact request was already successfully created, return it.
    # ------------------------------------------------------------------ #

    if client_idempotency_key:
        prior = (
            await db.execute(
                select(TimeEntry).where(
                    TimeEntry.user_id == actor_id,
                    TimeEntry.client_idempotency_key
                    == client_idempotency_key,
                )
            )
        ).scalar_one_or_none()

        if prior is not None:
            prior = await _load_entry_with_code_links(
                db,
                prior.id,
            )

            return CreatedEntry(
                entry=prior,
                was_idempotent_replay=True,
            )

    # ------------------------------------------------------------------ #
    # Validate project.
    # ------------------------------------------------------------------ #

    project = await _load_project_or_404(
        db,
        project_id,
    )

    if project.org_id != user.org_id:
        raise Forbidden(
            "Project belongs to a different organization"
        )

    if not project.is_active:
        raise Conflict(
            "Project is inactive"
        )

    # ------------------------------------------------------------------ #
    # Validate task.
    # ------------------------------------------------------------------ #

    task = await _load_task_or_none(
        db,
        task_id,
        project_id,
    )

    title_snapshot = (
        task.title
        if task is not None
        else None
    )

    # ------------------------------------------------------------------ #
    # Validate duration.
    # ------------------------------------------------------------------ #

    duration = _derive_duration(
        started_at=started_at,
        ended_at=ended_at,
        duration_minutes=duration_minutes,
    )

    # ------------------------------------------------------------------ #
    # Validate time overlap.
    # ------------------------------------------------------------------ #

    if (
        started_at is not None
        and ended_at is not None
    ):
        await _check_overlap(
            db,
            user_id=actor_id,
            started_at=started_at,
            ended_at=ended_at,
            exclude_id=None,
        )

    # ------------------------------------------------------------------ #
    # Resolve work date.
    # ------------------------------------------------------------------ #

    wdate = await _resolve_work_date(
        db,
        user,
        explicit=work_date,
        started_at=started_at,
    )

    await _assert_week_is_editable(
        db,
        actor_id,
        wdate,
    )

    # ------------------------------------------------------------------ #
    # Construct entry.
    # ------------------------------------------------------------------ #

    entry = TimeEntry(
        user_id=actor_id,
        work_date=wdate,
        project_id=project_id,
        task_id=task_id,
        task_title_snapshot=title_snapshot,
        description=description,
        started_at=started_at,
        ended_at=ended_at,
        duration_minutes=duration,
        billable=billable,
        status=TimeEntryStatus.draft,
        version=1,
        client_idempotency_key=client_idempotency_key,
    )

    db.add(entry)

    # ------------------------------------------------------------------ #
    # Atomic idempotency race handling.
    # ------------------------------------------------------------------ #

    try:
        await db.flush()

    except IntegrityError as exc:
        await db.rollback()

        # If there is no idempotency key, this is a real database
        # constraint failure and cannot be treated as a replay.
        if client_idempotency_key is None:
            raise Conflict(
                "Time entry could not be created",
                details={
                    "code": "TIME_ENTRY_CREATE_FAILED",
                    "database_error": str(exc.orig),
                },
            ) from exc

        # Another concurrent request may have created the same
        # idempotency key.
        prior = (
            await db.execute(
                select(TimeEntry).where(
                    TimeEntry.user_id == actor_id,
                    TimeEntry.client_idempotency_key
                    == client_idempotency_key,
                )
            )
        ).scalar_one_or_none()

        # IMPORTANT:
        # If no matching entry exists, this IntegrityError was caused
        # by some other database constraint.
        if prior is None:
            raise Conflict(
                "Time entry could not be created",
                details={
                    "code": "TIME_ENTRY_CREATE_FAILED",
                    "database_error": str(exc.orig),
                },
            ) from exc

        # Matching row exists -> idempotent replay.
        prior = await _load_entry_with_code_links(
            db,
            prior.id,
        )

        return CreatedEntry(
            entry=prior,
            was_idempotent_replay=True,
        )

    # ------------------------------------------------------------------ #
    # Parse and persist code links.
    # ------------------------------------------------------------------ #

    parsed_links = [
        code_link_service.parse(
            link["url"],
            link.get("note"),
        )
        for link in code_links
    ]

    await code_link_service.replace_for_entry(
        db,
        time_entry_id=entry.id,
        links=parsed_links,
    )

    # ------------------------------------------------------------------ #
    # Keep attendance_day.logged_seconds consistent.
    # ------------------------------------------------------------------ #

    await attendance_service.recompute_day(
        db,
        actor_id,
        wdate,
    )

    # ------------------------------------------------------------------ #
    # Audit.
    # ------------------------------------------------------------------ #

    await audit_service.record(
        db,
        actor_user_id=actor_id,
        action="time_entry.create",
        entity="time_entry",
        entity_id=entry.id,
        after={
            "project_id": str(project_id),
            "task_id": (
                str(task_id)
                if task_id
                else None
            ),
            "duration_minutes": duration,
            "work_date": wdate.isoformat(),
            "status": entry.status.value,
        },
        ip=ip,
    )

    # ------------------------------------------------------------------ #
    # Reload with code_links before returning.
    # ------------------------------------------------------------------ #

    entry = await _load_entry_with_code_links(
        db,
        entry.id,
    )

    return CreatedEntry(
        entry=entry,
        was_idempotent_replay=False,
    )


async def update_entry(
    db: AsyncSession,
    *,
    entry_id: uuid.UUID,
    actor_id: uuid.UUID,
    is_admin: bool,
    expected_version: int,
    fields: dict,
    ip: str | None,
) -> TimeEntry:
    # Row-level lock protects the version check and mutation from
    # concurrent updates.
    entry = (
        await db.execute(
            select(TimeEntry)
            .where(TimeEntry.id == entry_id)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if entry is None:
        raise NotFound(
            "Time entry not found"
        )

    if (
        entry.user_id != actor_id
        and not is_admin
    ):
        raise Forbidden(
            "You can only edit your own time entries"
        )

    _require_editable(entry)

    await _assert_week_is_editable(
        db,
        entry.user_id,
        entry.work_date,
    )

    if entry.version != expected_version:
        raise OptimisticConcurrencyError(
            "This entry was modified by another session",
            details={
                "expected": expected_version,
                "actual": entry.version,
            },
        )

    before = {
        "project_id": str(entry.project_id),
        "task_id": (
            str(entry.task_id)
            if entry.task_id
            else None
        ),
        "description": entry.description,
        "duration_minutes": entry.duration_minutes,
        "started_at": (
            entry.started_at.isoformat()
            if entry.started_at
            else None
        ),
        "ended_at": (
            entry.ended_at.isoformat()
            if entry.ended_at
            else None
        ),
        "billable": entry.billable,
        "work_date": entry.work_date.isoformat(),
        "status": entry.status.value,
        "version": entry.version,
    }

    prior_work_date = entry.work_date

    # ------------------------------------------------------------------ #
    # Project / task.
    # ------------------------------------------------------------------ #

    if (
        "project_id" in fields
        and fields["project_id"] is not None
    ):
        new_project = await _load_project_or_404(
            db,
            fields["project_id"],
        )

        owner = await _load_user(
            db,
            entry.user_id,
        )

        if new_project.org_id != owner.org_id:
            raise Forbidden(
                "Project belongs to a different organization"
            )

        entry.project_id = new_project.id

    if fields.get("clear_task"):
        entry.task_id = None
        entry.task_title_snapshot = None

    elif (
        "task_id" in fields
        and fields["task_id"] is not None
    ):
        task = await _load_task_or_none(
            db,
            fields["task_id"],
            entry.project_id,
        )

        entry.task_id = fields["task_id"]
        entry.task_title_snapshot = (
            task.title
            if task
            else None
        )

    # ------------------------------------------------------------------ #
    # Basic fields.
    # ------------------------------------------------------------------ #

    if (
        "description" in fields
        and fields["description"] is not None
    ):
        entry.description = fields["description"]

    if (
        "billable" in fields
        and fields["billable"] is not None
    ):
        entry.billable = fields["billable"]

    if (
        "work_date" in fields
        and fields["work_date"] is not None
    ):
        entry.work_date = fields["work_date"]

    # ------------------------------------------------------------------ #
    # Timing / duration.
    #
    # Any timing fields supplied together determine the duration.
    # ------------------------------------------------------------------ #

    new_start = fields.get(
        "started_at",
        entry.started_at,
    )

    new_end = fields.get(
        "ended_at",
        entry.ended_at,
    )

    new_duration_input = fields.get(
        "duration_minutes",
        entry.duration_minutes,
    )

    if (
        ("started_at" in fields or "ended_at" in fields)
        and (new_start or new_end)
    ):
        if (
            new_start is None
            or new_end is None
        ):
            raise ValidationError(
                "Both started_at and ended_at must be provided "
                "to use precise timing"
            )

        duration = _derive_duration(
            started_at=new_start,
            ended_at=new_end,
            duration_minutes=None,
        )

        await _check_overlap(
            db,
            user_id=entry.user_id,
            started_at=new_start,
            ended_at=new_end,
            exclude_id=entry.id,
        )

        entry.started_at = new_start
        entry.ended_at = new_end
        entry.duration_minutes = duration

    elif (
        "duration_minutes" in fields
        and fields["duration_minutes"] is not None
    ):
        entry.duration_minutes = _derive_duration(
            started_at=None,
            ended_at=None,
            duration_minutes=new_duration_input,
        )

        # Switching to duration-only mode clears precise timing.
        entry.started_at = None
        entry.ended_at = None

    # ------------------------------------------------------------------ #
    # Code links.
    # ------------------------------------------------------------------ #

    if (
        "code_links" in fields
        and fields["code_links"] is not None
    ):
        parsed = [
            code_link_service.parse(
                link["url"],
                link.get("note"),
            )
            for link in fields["code_links"]
        ]

        await code_link_service.replace_for_entry(
            db,
            time_entry_id=entry.id,
            links=parsed,
        )

    # ------------------------------------------------------------------ #
    # Version increment.
    # ------------------------------------------------------------------ #

    entry.version = entry.version + 1

    await db.flush()

    # ------------------------------------------------------------------ #
    # Attendance recalculation.
    # ------------------------------------------------------------------ #

    await attendance_service.recompute_day(
        db,
        entry.user_id,
        entry.work_date,
    )

    if prior_work_date != entry.work_date:
        await attendance_service.recompute_day(
            db,
            entry.user_id,
            prior_work_date,
        )

    # ------------------------------------------------------------------ #
    # Audit.
    # ------------------------------------------------------------------ #

    after = {
        "project_id": str(entry.project_id),
        "task_id": (
            str(entry.task_id)
            if entry.task_id
            else None
        ),
        "description": entry.description,
        "duration_minutes": entry.duration_minutes,
        "started_at": (
            entry.started_at.isoformat()
            if entry.started_at
            else None
        ),
        "ended_at": (
            entry.ended_at.isoformat()
            if entry.ended_at
            else None
        ),
        "billable": entry.billable,
        "work_date": entry.work_date.isoformat(),
        "status": entry.status.value,
        "version": entry.version,
    }

    await audit_service.record(
        db,
        actor_user_id=actor_id,
        action="time_entry.update",
        entity="time_entry",
        entity_id=entry.id,
        before=before,
        after=after,
        ip=ip,
    )

    return entry


async def delete_entry(
    db: AsyncSession,
    *,
    entry_id: uuid.UUID,
    actor_id: uuid.UUID,
    is_admin: bool,
    ip: str | None,
) -> None:
    # Lock the row before checking ownership/editability.
    entry = (
        await db.execute(
            select(TimeEntry)
            .where(TimeEntry.id == entry_id)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if entry is None:
        raise NotFound(
            "Time entry not found"
        )

    if (
        entry.user_id != actor_id
        and not is_admin
    ):
        raise Forbidden(
            "You can only delete your own time entries"
        )

    _require_editable(entry)

    await _assert_week_is_editable(
        db,
        entry.user_id,
        entry.work_date,
    )

    wd = entry.work_date

    snapshot = {
        "project_id": str(entry.project_id),
        "task_id": (
            str(entry.task_id)
            if entry.task_id
            else None
        ),
        "duration_minutes": entry.duration_minutes,
        "work_date": wd.isoformat(),
        "status": entry.status.value,
    }

    await db.delete(entry)
    await db.flush()

    await attendance_service.recompute_day(
        db,
        actor_id,
        wd,
    )

    await audit_service.record(
        db,
        actor_user_id=actor_id,
        action="time_entry.delete",
        entity="time_entry",
        entity_id=entry_id,
        before=snapshot,
        ip=ip,
    )


async def transition_entry(
    db: AsyncSession,
    *,
    entry_id: uuid.UUID,
    actor_id: uuid.UUID,
    is_manager: bool,
    is_admin: bool,
    target: TimeEntryStatus,
    expected_version: int,
    comment: str | None,
    ip: str | None,
) -> TimeEntry:
    # ------------------------------------------------------------------ #
    # IMPORTANT:
    # Lock the row before reading/checking the version.
    #
    # This serializes concurrent state transitions and makes the
    # optimistic-concurrency check authoritative.
    # ------------------------------------------------------------------ #

    entry = (
        await db.execute(
            select(TimeEntry)
            .where(TimeEntry.id == entry_id)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if entry is None:
        raise NotFound(
            "Time entry not found"
        )

    if entry.version != expected_version:
        raise OptimisticConcurrencyError(
            "This entry was modified by another session",
            details={
                "expected": expected_version,
                "actual": entry.version,
            },
        )

    # ------------------------------------------------------------------ #
    # Ownership / role check.
    # ------------------------------------------------------------------ #

    if target == TimeEntryStatus.submitted:
        if (
            entry.user_id != actor_id
            and not is_admin
        ):
            raise Forbidden(
                "Only the owner can submit a time entry"
            )

    elif target in (
        TimeEntryStatus.approved,
        TimeEntryStatus.rejected,
    ):
        if not is_manager:
            raise Forbidden(
                "Only a manager can approve or reject"
            )

    else:
        raise ValidationError(
            f"Unsupported transition target: {target.value}"
        )

    # ------------------------------------------------------------------ #
    # State-machine enforcement.
    # ------------------------------------------------------------------ #

    assert_transition(
        TIME_ENTRY_TRANSITIONS,
        entry.status.value,
        target.value,
        entity="time_entry",
    )

    before_status = entry.status

    entry.status = target
    entry.version = entry.version + 1

    await db.flush()

    # ------------------------------------------------------------------ #
    # Audit.
    # ------------------------------------------------------------------ #

    await audit_service.record(
        db,
        actor_user_id=actor_id,
        action=f"time_entry.{target.value}",
        entity="time_entry",
        entity_id=entry.id,
        before={
            "status": before_status.value,
            "version": expected_version,
        },
        after={
            "status": entry.status.value,
            "version": entry.version,
            "comment": comment,
        },
        ip=ip,
    )

    return entry