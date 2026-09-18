"""Centralised object-level authorization.

Every endpoint that returns or mutates a resource MUST funnel through one of these
functions before touching the resource. Do not inline these checks elsewhere.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import Forbidden
from app.core.permissions import CurrentUser
from app.models.team import TeamMember


async def can_view_user(
    db: AsyncSession, actor: CurrentUser, target_user_id: uuid.UUID
) -> bool:
    """Can `actor` read `target_user_id`'s private data (attendance, timesheets...)?

    Rules:
      - Self: yes.
      - Admin: yes (org-wide).
      - Manager: only if target is a member of a team the manager manages.
      - Everyone else: no.
    """
    if actor.id == target_user_id:
        return True
    if actor.is_admin:
        return True
    if not actor.managed_team_ids:
        return False
    stmt = (
        select(1)
        .select_from(TeamMember)
        .where(
            TeamMember.user_id == target_user_id,
            TeamMember.team_id.in_(actor.managed_team_ids),
        )
        .limit(1)
    )
    return (await db.execute(stmt)).first() is not None


async def require_view_user(
    db: AsyncSession, actor: CurrentUser, target_user_id: uuid.UUID
) -> None:
    if not await can_view_user(db, actor, target_user_id):
        raise Forbidden("You do not have access to this user's data")


async def require_resource_owner(
    db: AsyncSession, actor: CurrentUser, *, owner_id: uuid.UUID
) -> None:
    """Ownership check for a concrete resource.

    Services call this AFTER loading the resource to learn its owner. The
    frontend must never tell us who the owner is.
    """
    if actor.id == owner_id:
        return
    if actor.is_admin:
        return
    if await can_view_user(db, actor, owner_id):
        return
    raise Forbidden("You do not have access to this resource")


async def require_resource_owner_strict(
    db: AsyncSession, actor: CurrentUser, *, owner_id: uuid.UUID
) -> None:
    """Same as above but forbids managers. Use for resources that are strictly
    private to their owner (e.g. profile edits).
    """
    if actor.id == owner_id or actor.is_admin:
        return
    raise Forbidden("You can only modify your own resources")


def require_admin(actor: CurrentUser) -> None:
    if not actor.is_admin:
        raise Forbidden("Admin role required")


def require_manager(actor: CurrentUser) -> None:
    if not actor.is_manager:
        raise Forbidden("Manager role required")