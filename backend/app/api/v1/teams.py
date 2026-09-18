from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user, require_team_management
from app.core.database import get_db
from app.core.exceptions import NotFound
from app.core.permissions import CurrentUser
from app.models.enums import Role
from app.models.user import AppUser, UserRole
from app.schemas.team import TeamMemberWithUser, TeamOut
from app.services import team_service

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("/mine", response_model=list[TeamOut])
async def my_teams(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TeamOut]:
    teams = await team_service.list_teams_for_user(db, user.id)
    return [TeamOut.model_validate(t) for t in teams]


@router.get("/managed", response_model=list[TeamOut])
async def managed_teams(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TeamOut]:
    if not user.is_manager:
        return []
    teams = await team_service.list_managed_teams(db, user.id)
    return [TeamOut.model_validate(t) for t in teams]


@router.get(
    "/{team_id}/members",
    response_model=list[TeamMemberWithUser],
    dependencies=[Depends(require_team_management("team_id"))],
)
async def team_members(
    team_id: uuid.UUID,
    _: Request,
    db: AsyncSession = Depends(get_db),
) -> list[TeamMemberWithUser]:
    await team_service.get_team_or_404(db, team_id)
    members = await team_service.list_members(db, team_id)
    if not members:
        return []
    user_ids = [m.user_id for m in members]
    users = {
        u.id: u
        for u in (
            await db.execute(select(AppUser).where(AppUser.id.in_(user_ids)))
        ).scalars()
    }
    out: list[TeamMemberWithUser] = []
    for m in members:
        u = users.get(m.user_id)
        if u is None:
            continue
        out.append(
            TeamMemberWithUser(
                id=m.id,
                team_id=m.team_id,
                user_id=m.user_id,
                is_manager=m.is_manager,
                created_at=m.created_at,
                email=u.email,
                full_name=u.full_name,
            )
        )
    return out