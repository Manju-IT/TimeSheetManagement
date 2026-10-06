from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user, require_manager
from app.api.dependencies.pagination import Pagination, pagination_params
from app.api.dependencies.rate_limit import rate_limit
from app.core.database import get_db
from app.core.idempotency import idempotent_call
from app.core.permissions import CurrentUser
from app.models.enums import TimesheetStatus
from app.schemas.common import PaginatedResponse, PaginationMeta
from app.schemas.timesheet import (
    ReviewDetailOut,
    ReviewItemOut,
    ReviewUserOut,
    TimesheetPeriodOut,
    TimesheetReviewIn,
    TimesheetSubmitIn,
    TimesheetWeekOut,
)
from app.services import timesheet_service

router = APIRouter(prefix="/timesheets", tags=["timesheets"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _grid_to_out(grid) -> TimesheetWeekOut:  # noqa: ANN001
    return TimesheetWeekOut(
        period=TimesheetPeriodOut.model_validate(grid.period),
        days=grid.days,
        rows=grid.rows,
        daily_totals=grid.daily_totals,
        weekly_total_minutes=grid.weekly_total_minutes,
        variance_threshold_minutes=grid.variance_threshold_minutes,
    )


# --------------------------------------------------------------------------- #
# Mine
# --------------------------------------------------------------------------- #

@router.get("/week", response_model=TimesheetWeekOut)
async def my_week(
    anchor: date = Query(description="Any date within the desired week"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimesheetWeekOut:
    """Returns the grid for the week containing `anchor` (auto-creates the period)."""
    period = await timesheet_service.get_or_create_for_week(
        db, user_id=user.id, any_day=anchor
    )
    grid = await timesheet_service.build_grid(db, user_id=user.id, period=period)
    return _grid_to_out(grid)


@router.get("/mine", response_model=PaginatedResponse[TimesheetPeriodOut])
async def mine(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    pagination: Pagination = Depends(pagination_params),
) -> PaginatedResponse[TimesheetPeriodOut]:
    rows, total = await timesheet_service.list_periods_for_user(
        db, user_id=user.id, offset=pagination.offset, limit=pagination.limit
    )
    return PaginatedResponse[TimesheetPeriodOut](
        data=[TimesheetPeriodOut.model_validate(r) for r in rows],
        pagination=PaginationMeta(
            page=pagination.page,
            page_size=pagination.page_size,
            total=total,
            has_next=pagination.offset + len(rows) < total,
        ),
    )


@router.get("/{period_id}", response_model=TimesheetWeekOut)
async def my_period(
    period_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimesheetWeekOut:
    period = await timesheet_service.get_period_or_404(db, period_id)
    if period.user_id != user.id:
        raise Forbidden("You do not have access to this period")
    grid = await timesheet_service.build_grid(db, user_id=user.id, period=period)
    return _grid_to_out(grid)


# --------------------------------------------------------------------------- #
# Transitions (owner)
# --------------------------------------------------------------------------- #

@router.post(
    "/{period_id}/submit",
    response_model=TimesheetPeriodOut,
    dependencies=[Depends(rate_limit("timesheet.submit"))],
)
async def submit(
    period_id: uuid.UUID,
    payload: TimesheetSubmitIn,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimesheetPeriodOut:
    async def _do():
        result = await timesheet_service.submit_week(
            db,
            user_id=user.id,
            period_id=period_id,
            expected_version=payload.expected_version,
            ip=_ip(request),
        )
        return TimesheetPeriodOut.model_validate(result.period)

    return await idempotent_call(db, request=request, scope="timesheet.submit", handler=_do)


@router.post(
    "/{period_id}/reopen",
    response_model=TimesheetPeriodOut,
    dependencies=[Depends(rate_limit("timesheet.reopen"))],
)
async def reopen(
    period_id: uuid.UUID,
    payload: TimesheetSubmitIn,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimesheetPeriodOut:
    period = await timesheet_service.reopen_week(
        db,
        user_id=user.id,
        period_id=period_id,
        expected_version=payload.expected_version,
        ip=_ip(request),
    )
    return TimesheetPeriodOut.model_validate(period)


# --------------------------------------------------------------------------- #
# Review (manager)
# --------------------------------------------------------------------------- #

@router.get("/review/queue", response_model=PaginatedResponse[ReviewItemOut])
async def review_queue(
    user: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
    pagination: Pagination = Depends(pagination_params),
    status: TimesheetStatus | None = Query(default=TimesheetStatus.submitted),
) -> PaginatedResponse[ReviewItemOut]:
    rows, total = await timesheet_service.list_periods_for_review(
        db,
        manager_id=user.id,
        is_admin=user.is_admin,
        status=status,
        offset=pagination.offset,
        limit=pagination.limit,
    )
    data = [
        ReviewItemOut(
            period=TimesheetPeriodOut.model_validate(p),
            user=ReviewUserOut.model_validate(u),
        )
        for (p, u) in rows
    ]
    return PaginatedResponse[ReviewItemOut](
        data=data,
        pagination=PaginationMeta(
            page=pagination.page,
            page_size=pagination.page_size,
            total=total,
            has_next=pagination.offset + len(rows) < total,
        ),
    )


@router.get("/review/{period_id}", response_model=ReviewDetailOut)
async def review_detail(
    period_id: uuid.UUID,
    user: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
) -> ReviewDetailOut:
    period = await timesheet_service.get_period_or_404(db, period_id)
    await timesheet_service._assert_manager_can_review(
        db,
        manager_id=user.id,
        target_user_id=period.user_id,
        is_admin=user.is_admin,
    )
    # Need the user record.
    from sqlalchemy import select
    from app.models.user import AppUser

    target = (
        await db.execute(select(AppUser).where(AppUser.id == period.user_id))
    ).scalar_one()

    grid = await timesheet_service.build_grid(db, user_id=period.user_id, period=period)
    return ReviewDetailOut(
        period=TimesheetPeriodOut.model_validate(period),
        user=ReviewUserOut.model_validate(target),
        week=_grid_to_out(grid),
    )


@router.post(
    "/{period_id}/approve",
    response_model=TimesheetPeriodOut,
    dependencies=[Depends(rate_limit("timesheet.review"))],
)
async def approve(
    period_id: uuid.UUID,
    payload: TimesheetReviewIn,
    request: Request,
    user: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
) -> TimesheetPeriodOut:
    async def _do():
        period = await timesheet_service.approve_week(
            db,
            manager_id=user.id,
            is_admin=user.is_admin,
            period_id=period_id,
            expected_version=payload.expected_version,
            comment=payload.comment,
            ip=_ip(request),
        )
        return TimesheetPeriodOut.model_validate(period)

    return await idempotent_call(db, request=request, scope="timesheet.approve", handler=_do)


@router.post(
    "/{period_id}/reject",
    response_model=TimesheetPeriodOut,
    dependencies=[Depends(rate_limit("timesheet.review"))],
)
async def reject(
    period_id: uuid.UUID,
    payload: TimesheetReviewIn,
    request: Request,
    user: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
) -> TimesheetPeriodOut:
    async def _do():
        period = await timesheet_service.reject_week(
            db,
            manager_id=user.id,
            is_admin=user.is_admin,
            period_id=period_id,
            expected_version=payload.expected_version,
            comment=payload.comment,
            ip=_ip(request),
        )
        return TimesheetPeriodOut.model_validate(period)

    return await idempotent_call(db, request=request, scope="timesheet.reject", handler=_do)