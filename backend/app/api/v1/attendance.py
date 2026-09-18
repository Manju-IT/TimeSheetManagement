from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.models.attendance_day import AttendanceDay
from app.models.enums import GeoEventType
from app.models.geo_event import GeoEvent
from app.models.organization import Organization
from app.models.user import AppUser
from app.models.work_session import WorkSession
from app.schemas.attendance import (
    AttendanceDayOut,
    AttendanceTodayOut,
    CheckInOut,
    CheckOutOut,
    GeoEventOut,
    LocationInput,
    WorkSessionOut,
)
from app.services import attendance_service, session_service
from app.services.attendance_service import LocationPayload
from app.utils.timezone import work_date_for

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _payload(p: LocationInput) -> LocationPayload:
    return LocationPayload(
        latitude=p.latitude,
        longitude=p.longitude,
        accuracy_m=p.accuracy_m,
        geo_permission=p.geo_permission,
        client_reported_at=p.client_reported_at,
        device_id=p.device_id,
    )


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("/today", response_model=AttendanceTodayOut)
async def today(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttendanceTodayOut:
    app_user = (
        await db.execute(select(AppUser).where(AppUser.id == user.id))
    ).scalar_one()
    org = (
        await db.execute(select(Organization).where(Organization.id == app_user.org_id))
    ).scalar_one()
    tz_name = app_user.timezone or org.default_timezone
    work_date = work_date_for(datetime.now(timezone.utc), tz_name, org.workday_cutoff)

    attendance = (
        await db.execute(
            select(AttendanceDay).where(
                AttendanceDay.user_id == user.id,
                AttendanceDay.work_date == work_date,
            )
        )
    ).scalar_one_or_none()
    active = await session_service.get_active_session(db, user.id)

    first_evt = None
    last_evt = None
    if attendance is not None:
        if attendance.first_login_event_id:
            first_evt = (
                await db.execute(
                    select(GeoEvent).where(GeoEvent.id == attendance.first_login_event_id)
                )
            ).scalar_one_or_none()
        if attendance.last_logout_event_id:
            last_evt = (
                await db.execute(
                    select(GeoEvent).where(GeoEvent.id == attendance.last_logout_event_id)
                )
            ).scalar_one_or_none()

    return AttendanceTodayOut(
        attendance_day=AttendanceDayOut.model_validate(attendance) if attendance else None,
        active_session=WorkSessionOut.model_validate(active) if active else None,
        first_login_event=GeoEventOut.model_validate(first_evt) if first_evt else None,
        last_logout_event=GeoEventOut.model_validate(last_evt) if last_evt else None,
    )


@router.post("/check-in", response_model=CheckInOut)
async def check_in(
    payload: LocationInput,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckInOut:
    result = await attendance_service.check_in(
        db,
        user_id=user.id,
        payload=_payload(payload),
        ip=_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return CheckInOut(
        attendance_day=AttendanceDayOut.model_validate(result.attendance_day),
        work_session=WorkSessionOut.model_validate(result.work_session),
        login_event=GeoEventOut.model_validate(result.login_event),
        is_duplicate=result.is_duplicate,
    )


@router.post("/check-out", response_model=CheckOutOut)
async def check_out(
    payload: LocationInput,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckOutOut:
    result = await attendance_service.check_out(
        db,
        user_id=user.id,
        payload=_payload(payload),
        ip=_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return CheckOutOut(
        attendance_day=(
            AttendanceDayOut.model_validate(result.attendance_day)
            if result.attendance_day
            else None
        ),
        work_session=(
            WorkSessionOut.model_validate(result.work_session)
            if result.work_session
            else None
        ),
        logout_event=(
            GeoEventOut.model_validate(result.logout_event)
            if result.logout_event
            else None
        ),
        is_duplicate=result.is_duplicate,
    )


@router.get("/events", response_model=list[GeoEventOut])
async def my_events(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
) -> list[GeoEventOut]:
    """The caller's own location history. Location is captured ONLY at check-in/out."""
    rows = list(
        (
            await db.execute(
                select(GeoEvent)
                .where(
                    GeoEvent.user_id == user.id,
                    GeoEvent.event_type != GeoEventType.heartbeat,
                )
                .order_by(GeoEvent.occurred_at.desc())
                .limit(limit)
            )
        ).scalars()
    )
    return [GeoEventOut.model_validate(e) for e in rows]


@router.get("/sessions", response_model=list[WorkSessionOut])
async def my_sessions(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
) -> list[WorkSessionOut]:
    rows = list(
        (
            await db.execute(
                select(WorkSession)
                .where(WorkSession.user_id == user.id)
                .order_by(WorkSession.login_at.desc())
                .limit(limit)
            )
        ).scalars()
    )
    return [WorkSessionOut.model_validate(s) for s in rows]