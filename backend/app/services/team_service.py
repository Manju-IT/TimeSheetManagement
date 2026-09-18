from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import Conflict, NotFound
from app.models.team import Team, TeamMember


async def get_team(db: AsyncSession, team_id: uuid.UUID) -> Team | None:
    return (
        await db.execute(select(Team).where(Team.id == team_id))
    ).scalar_one_or_none()


async def get_team_or_404(db: AsyncSession, team_id: uuid.UUID) -> Team:
    team = await get_team(db, team_id)
    if team is None:
        raise NotFound("Team not found")
    return team


async def list_all_teams(db: AsyncSession, org_id: uuid.UUID) -> list[Team]:
    return list(
        (
            await db.execute(
                select(Team).where(Team.org_id == org_id).order_by(Team.name.asc())
            )
        ).scalars()
    )


async def list_teams_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[Team]:
    stmt = (
        select(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.user_id == user_id)
        .order_by(Team.name.asc())
    )
    return list((await db.execute(stmt)).scalars())


async def list_managed_teams(db: AsyncSession, user_id: uuid.UUID) -> list[Team]:
    stmt = (
        select(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.user_id == user_id, TeamMember.is_manager.is_(True))
        .order_by(Team.name.asc())
    )
    return list((await db.execute(stmt)).scalars())


async def create_team(db: AsyncSession, *, org_id: uuid.UUID, name: str) -> Team:
    existing = (
        await db.execute(select(Team).where(Team.org_id == org_id, Team.name == name))
    ).scalar_one_or_none()
    if existing is not None:
        raise Conflict(f"A team named '{name}' already exists")
    team = Team(org_id=org_id, name=name)
    db.add(team)
    await db.flush()
    return team


async def rename_team(db: AsyncSession, team_id: uuid.UUID, name: str) -> Team:
    team = await get_team_or_404(db, team_id)
    team.name = name
    await db.flush()
    return team


async def delete_team(db: AsyncSession, team_id: uuid.UUID) -> None:
    await get_team_or_404(db, team_id)
    await db.execute(delete(Team).where(Team.id == team_id))


async def list_members(db: AsyncSession, team_id: uuid.UUID) -> list[TeamMember]:
    return list(
        (
            await db.execute(
                select(TeamMember)
                .where(TeamMember.team_id == team_id)
                .order_by(TeamMember.created_at.asc())
            )
        ).scalars()
    )


async def add_member(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    is_manager: bool = False,
) -> TeamMember:
    await get_team_or_404(db, team_id)
    existing = (
        await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id, TeamMember.user_id == user_id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        # idempotent promote/demote
        existing.is_manager = is_manager
        await db.flush()
        return existing
    row = TeamMember(team_id=team_id, user_id=user_id, is_manager=is_manager)
    db.add(row)
    await db.flush()
    return row


async def remove_member(db: AsyncSession, *, team_id: uuid.UUID, user_id: uuid.UUID) -> None:
    result = await db.execute(
        delete(TeamMember).where(
            TeamMember.team_id == team_id, TeamMember.user_id == user_id
        )
    )
    if result.rowcount == 0:
        raise NotFound("Team member not found")


async def get_manager_user_ids(db: AsyncSession, manager_user_id: uuid.UUID) -> set[uuid.UUID]:
    """All distinct user_ids across teams the given user manages."""
    stmt = (
        select(TeamMember.user_id)
        .join(Team, Team.id == TeamMember.team_id)
        .join(
            TeamMember.__table__.alias("mgr"),
            TeamMember.__table__.alias("mgr").c.team_id == Team.id,
        )
        .where(
            TeamMember.__table__.alias("mgr").c.user_id == manager_user_id,
            TeamMember.__table__.alias("mgr").c.is_manager.is_(True),
        )
    )
    rows = await db.execute(stmt)
    return {uid for (uid,) in rows.all()}