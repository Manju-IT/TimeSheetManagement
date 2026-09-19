from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.exceptions import NotFound
from app.core.permissions import CurrentUser
from app.models.enums import TimeEntryStatus, TimesheetStatus
from app.models.time_entry import TimeEntry
from app.models.timesheet_period import TimesheetPeriod
from app.schemas.timesheet import ApprovalAction, TimesheetPeriodOut

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.get("/pending", response_model=list[TimesheetPeriodOut])
async def list_pending_approvals(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TimesheetPeriodOut]:
    if not user.is_manager and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers or administrators can review timesheets.",
        )

    stmt = (
        select(TimesheetPeriod)
        .where(TimesheetPeriod.status == TimesheetStatus.submitted)
        .order_by(TimesheetPeriod.submitted_at.desc())
    )
    periods = (await db.execute(stmt)).scalars().all()
    return [TimesheetPeriodOut.model_validate(p) for p in periods]


@router.post("/{period_id}", response_model=TimesheetPeriodOut)
async def review_timesheet(
    period_id: uuid.UUID,
    payload: ApprovalAction,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimesheetPeriodOut:
    if not user.is_manager and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers or administrators can approve or reject timesheets.",
        )

    period = await db.get(TimesheetPeriod, period_id)
    if not period:
        raise NotFound(message="Timesheet period not found")

    if period.status != TimesheetStatus.submitted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Timesheet period is already {period.status.value}.",
        )

    now = datetime.now(timezone.utc)
    new_status = (
        TimesheetStatus.approved
        if payload.action == "approve"
        else TimesheetStatus.rejected
    )
    entry_status = (
        TimeEntryStatus.approved
        if payload.action == "approve"
        else TimeEntryStatus.rejected
    )

    period.status = new_status
    period.approved_by = user.id
    period.approved_at = now
    period.comment = payload.comment
    period.version += 1

    # Update associated entries
    entries_stmt = select(TimeEntry).where(
        TimeEntry.user_id == period.user_id,
        TimeEntry.work_date >= period.period_start,
        TimeEntry.work_date <= period.period_end,
    )
    entries = (await db.execute(entries_stmt)).scalars().all()
    for e in entries:
        e.status = entry_status
        e.version += 1

    await db.commit()
    await db.refresh(period)
    return TimesheetPeriodOut.model_validate(period)
