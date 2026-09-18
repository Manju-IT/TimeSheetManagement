from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_admin
from app.core.database import get_db
from app.core.exceptions import Conflict, NotFound
from app.core.permissions import CurrentUser
from app.models.team import TeamMember
from app.models.user import AppUser
from app.schemas.common import OkResponse
from app.schemas.team import (
    TeamAddMemberRequest,
    TeamCreateRequest,
    TeamMemberOut,
    TeamOut,
)
from app.services import audit_service, team_service

router = APIRouter(prefix="/teams", tags=["admin:teams"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("", response_model=list[TeamOut])
async def list_teams(
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[TeamOut]:
    teams = await team_service.list_all_teams(db, actor.org_id)
    return [TeamOut.model_validate(t) for t in teams]


@router.post("", response_model=TeamOut)
async def create_team(
    payload: TeamCreateRequest,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TeamOut:
    team = await team_service.create_team(db, org_id=actor.org_id, name=payload.name)
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="team.create",
        entity="team",
        entity_id=team.id,
        after={"name": team.name},
        ip=_ip(request),
    )
    return TeamOut.model_validate(team)


@router.patch("/{team_id}", response_model=TeamOut)
async def rename_team(
    team_id: uuid.UUID,
    payload: TeamCreateRequest,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TeamOut:
    before = await team_service.get_team_or_404(db, team_id)
    before_name = before.name
    team = await team_service.rename_team(db, team_id, payload.name)
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="team.rename",
        entity="team",
        entity_id=team.id,
        before={"name": before_name},
        after={"name": team.name},
        ip=_ip(request),
    )
    return TeamOut.model_validate(team)


@router.delete("/{team_id}", response_model=OkResponse)
async def delete_team(
    team_id: uuid.UUID,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    await team_service.get_team_or_404(db, team_id)
    await team_service.delete_team(db, team_id)
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="team.delete",
        entity="team",
        entity_id=team_id,
        ip=_ip(request),
    )
    return OkResponse(ok=True)


@router.post("/{team_id}/members", response_model=TeamMemberOut)
async def add_member(
    team_id: uuid.UUID,
    payload: TeamAddMemberRequest,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TeamMemberOut:
    user = (
        await db.execute(select(AppUser).where(AppUser.id == payload.user_id))
    ).scalar_one_or_none()
    if user is None:
        raise NotFound("User not found")
    if user.org_id != actor.org_id:
        raise Conflict("User belongs to a different organization")

    row = await team_service.add_member(
        db, team_id=team_id, user_id=payload.user_id, is_manager=payload.is_manager
    )
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="team.member.add",
        entity="team_member",
        entity_id=row.id,
        after={"team_id": str(team_id), "user_id": str(payload.user_id), "is_manager": payload.is_manager},
        ip=_ip(request),
    )
    return TeamMemberOut.model_validate(row)


@router.delete("/{team_id}/members/{user_id}", response_model=OkResponse)
async def remove_member(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    await team_service.remove_member(db, team_id=team_id, user_id=user_id)
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="team.member.remove",
        entity="team_member",
        entity_id=None,
        before={"team_id": str(team_id), "user_id": str(user_id)},
        ip=_ip(request),
    )
    return OkResponse(ok=True)