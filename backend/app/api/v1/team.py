from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_manager
from app.api.dependencies.rate_limit import rate_limit
from app.core.database import get_db
from app.core.exceptions import ValidationError
from app.core.permissions import CurrentUser
from app.schemas.team_attendance import (
    TeamAttendancePageOut,
    TeamOptionOut,
    TimelineOut,
)
from app.services import team_attendance_service, team_service

router = APIRouter(prefix="/team", tags=["team"])



@router.get("/teams", response_model=list[TeamOptionOut])
async def my_teams(
    actor: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
) -> list[TeamOptionOut]:
    if actor.is_admin:
        teams = await team_service.list_all_teams(db, actor.org_id)
    else:
        teams = await team_service.list_managed_teams(db, actor.id)
    return [TeamOptionOut(id=t.id, name=t.name) for t in teams]


@router.get(
    "/attendance",
    response_model=TeamAttendancePageOut,
    dependencies=[Depends(rate_limit("reports.read"))],
)
async def team_attendance(
    actor: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
    team_id: uuid.UUID = Query(...),
    work_date: date = Query(default_factory=lambda: datetime.now(timezone.utc).date()),
) -> TeamAttendancePageOut:
    result = await team_attendance_service.get_team_attendance(
        db,
        actor_id=actor.id,
        is_admin=actor.is_admin,
        team_id=team_id,
        work_date=work_date,
    )
    return TeamAttendancePageOut.model_validate(result)


@router.get(
    "/attendance/timeline",
    response_model=TimelineOut,
    dependencies=[Depends(rate_limit("reports.read"))],
)
async def attendance_timeline(
    actor: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
    team_id: uuid.UUID = Query(...),
    user_id: uuid.UUID = Query(...),
    work_date: date = Query(...),
) -> TimelineOut:
    result = await team_attendance_service.get_timeline(
        db,
        actor_id=actor.id,
        is_admin=actor.is_admin,
        team_id=team_id,
        target_user_id=user_id,
        work_date=work_date,
    )
    return TimelineOut.model_validate(result)