from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.exceptions import NotFound
from app.core.permissions import CurrentUser
from app.models.enums import TimeEntryStatus, TimesheetStatus
from app.models.project import Project
from app.models.time_entry import TimeEntry
from app.models.timesheet_period import TimesheetPeriod
from app.schemas.timesheet import (
    TimeEntryCreate,
    TimeEntryOut,
    TimeEntryUpdate,
    TimesheetPeriodOut,
    TimesheetPeriodSubmit,
)

router = APIRouter(prefix="/time-entries", tags=["time-entries"])


@router.get("", response_model=list[TimeEntryOut])
async def list_time_entries(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    project_id: uuid.UUID | None = Query(None),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TimeEntryOut]:
    stmt = select(TimeEntry).where(TimeEntry.user_id == user.id)
    if start_date:
        stmt = stmt.where(TimeEntry.work_date >= start_date)
    if end_date:
        stmt = stmt.where(TimeEntry.work_date <= end_date)
    if project_id:
        stmt = stmt.where(TimeEntry.project_id == project_id)

    stmt = stmt.order_by(TimeEntry.work_date.desc(), TimeEntry.created_at.desc())
    result = await db.execute(stmt)
    entries = result.scalars().all()
    return [TimeEntryOut.model_validate(e) for e in entries]


@router.post("", response_model=TimeEntryOut, status_code=status.HTTP_201_CREATED)
async def create_time_entry(
    payload: TimeEntryCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryOut:
    # Verify project exists
    project = await db.get(Project, payload.project_id)
    if not project:
        raise NotFound(message="Project not found")

    entry = TimeEntry(
        user_id=user.id,
        work_date=payload.work_date,
        project_id=payload.project_id,
        task_id=payload.task_id,
        task_title_snapshot=payload.task_title_snapshot,
        description=payload.description,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
        duration_minutes=payload.duration_minutes,
        billable=payload.billable,
        status=TimeEntryStatus.draft,
        version=1,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return TimeEntryOut.model_validate(entry)


@router.patch("/{entry_id}", response_model=TimeEntryOut)
async def update_time_entry(
    entry_id: uuid.UUID,
    payload: TimeEntryUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryOut:
    entry = await db.get(TimeEntry, entry_id)
    if not entry or entry.user_id != user.id:
        raise NotFound(message="Time entry not found")

    if entry.status != TimeEntryStatus.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify a time entry that is already submitted or approved.",
        )

    if payload.project_id is not None:
        project = await db.get(Project, payload.project_id)
        if not project:
            raise NotFound(message="Project not found")
        entry.project_id = payload.project_id

    if payload.task_id is not None:
        entry.task_id = payload.task_id
    if payload.task_title_snapshot is not None:
        entry.task_title_snapshot = payload.task_title_snapshot
    if payload.description is not None:
        entry.description = payload.description
    if payload.duration_minutes is not None:
        entry.duration_minutes = payload.duration_minutes
    if payload.billable is not None:
        entry.billable = payload.billable
    if payload.work_date is not None:
        entry.work_date = payload.work_date

    entry.version += 1
    await db.commit()
    await db.refresh(entry)
    return TimeEntryOut.model_validate(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_time_entry(
    entry_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    entry = await db.get(TimeEntry, entry_id)
    if not entry or entry.user_id != user.id:
        raise NotFound(message="Time entry not found")

    if entry.status != TimeEntryStatus.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete an entry that has been submitted or approved.",
        )

    await db.delete(entry)
    await db.commit()


@router.post("/submit", response_model=TimesheetPeriodOut)
async def submit_timesheet(
    payload: TimesheetPeriodSubmit,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimesheetPeriodOut:
    if payload.period_start > payload.period_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Period start date cannot be after period end date.",
        )

    # Find existing or create new period
    stmt = select(TimesheetPeriod).where(
        TimesheetPeriod.user_id == user.id,
        TimesheetPeriod.period_start == payload.period_start,
        TimesheetPeriod.period_end == payload.period_end,
    )
    period = (await db.execute(stmt)).scalar_one_or_none()

    if not period:
        period = TimesheetPeriod(
            user_id=user.id,
            period_start=payload.period_start,
            period_end=payload.period_end,
            status=TimesheetStatus.submitted,
            submitted_at=datetime.now(timezone.utc),
            version=1,
        )
        db.add(period)
    else:
        period.status = TimesheetStatus.submitted
        period.submitted_at = datetime.now(timezone.utc)
        period.version += 1

    # Transition all entries in this period to submitted
    entries_stmt = select(TimeEntry).where(
        TimeEntry.user_id == user.id,
        TimeEntry.work_date >= payload.period_start,
        TimeEntry.work_date <= payload.period_end,
        TimeEntry.status == TimeEntryStatus.draft,
    )
    entries = (await db.execute(entries_stmt)).scalars().all()
    for e in entries:
        e.status = TimeEntryStatus.submitted
        e.version += 1

    await db.commit()
    await db.refresh(period)
    return TimesheetPeriodOut.model_validate(period)
