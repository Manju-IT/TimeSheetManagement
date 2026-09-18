from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.core.permissions import CurrentUser
from app.models.enums import Role, UserStatus
from app.models.organization import Organization
from app.models.user import AppUser, ImsIdentity, UserRole

log = get_logger("app.user_service")


@dataclass
class ProvisionedUser:
    user: AppUser
    is_new: bool
    roles_added: set[Role]


def _roles_from_ims_groups(groups: list[str]) -> set[Role]:
    result: set[Role] = set()
    gset = {g.strip() for g in groups if g and isinstance(g, str)}
    if settings.OIDC_GROUP_TO_ROLE_ADMIN and settings.OIDC_GROUP_TO_ROLE_ADMIN in gset:
        result.add(Role.admin)
    if settings.OIDC_GROUP_TO_ROLE_MANAGER and settings.OIDC_GROUP_TO_ROLE_MANAGER in gset:
        result.add(Role.manager)
    if settings.OIDC_GROUP_TO_ROLE_MEMBER and settings.OIDC_GROUP_TO_ROLE_MEMBER in gset:
        result.add(Role.member)
    if not result:
        result.add(Role.member)
    return result


async def _default_org_id(db: AsyncSession) -> uuid.UUID:
    org = (await db.execute(select(Organization).limit(1))).scalar_one_or_none()
    if org is None:
        raise RuntimeError(
            "No organization exists. Run `alembic upgrade head` (0002 seeds a default org) "
            "or the seed script."
        )
    return org.id


async def ensure_user_roles(db: AsyncSession, user: AppUser, roles: set[Role]) -> set[Role]:
    existing = {
        r.role
        for r in (await db.execute(select(UserRole).where(UserRole.user_id == user.id))).scalars()
    }
    added: set[Role] = set()
    for role in roles - existing:
        db.add(UserRole(user_id=user.id, role=role))
        added.add(role)
    return added


async def provision_from_ims(db: AsyncSession, claims: dict[str, Any]) -> ProvisionedUser:
    """JIT user creation/update from a validated ID token claim set."""
    subject = claims.get("sub")
    if not subject or not isinstance(subject, str):
        raise ValueError("IMS claim `sub` is required")
    email = claims.get("email")
    if not email or not isinstance(email, str):
        raise ValueError("IMS claim `email` is required")
    full_name = claims.get("name") or claims.get("preferred_username") or email

    groups_claim = settings.OIDC_GROUP_CLAIM
    raw_groups = claims.get(groups_claim) or []
    if isinstance(raw_groups, str):
        groups = [g.strip() for g in raw_groups.split(",") if g.strip()]
    elif isinstance(raw_groups, list):
        groups = [g for g in raw_groups if isinstance(g, str)]
    else:
        groups = []
    target_roles = _roles_from_ims_groups(groups)

    is_new = False
    user: AppUser | None = None

    # Prefer provider subject match, then email fallback.
    identity = (
        await db.execute(
            select(ImsIdentity).where(
                ImsIdentity.provider == "ims",
                ImsIdentity.provider_subject == subject,
            )
        )
    ).scalar_one_or_none()

    if identity is not None:
        user = (
            await db.execute(select(AppUser).where(AppUser.id == identity.user_id))
        ).scalar_one()
    else:
        user = (
            await db.execute(select(AppUser).where(AppUser.email == email))
        ).scalar_one_or_none()

    org_id = await _default_org_id(db)

    if user is None:
        user = AppUser(
            org_id=org_id,
            ims_user_id=subject,
            email=email,
            full_name=full_name,
            timezone=None,
            status=UserStatus.active,
        )
        db.add(user)
        await db.flush()
        is_new = True

    # Update mutable profile fields.
    user.full_name = full_name or user.full_name
    if not user.ims_user_id:
        user.ims_user_id = subject

    if user.status != UserStatus.active:
        # Disabled users may authenticate against IMS but cannot create a session.
        # Handled by the caller (AuthService) after role assignment.
        pass

    if identity is None:
        db.add(
            ImsIdentity(user_id=user.id, provider="ims", provider_subject=subject)
        )

    roles_added = await ensure_user_roles(db, user, target_roles)

    log.info(
        "ims_provisioned",
        user_id=str(user.id),
        is_new=is_new,
        roles_added=[r.value for r in roles_added],
    )
    return ProvisionedUser(user=user, is_new=is_new, roles_added=roles_added)


async def load_current_user(db: AsyncSession, user_id: uuid.UUID) -> CurrentUser | None:
    from app.models.team import TeamMember  # local import to avoid cycles

    user = (
        await db.execute(select(AppUser).where(AppUser.id == user_id))
    ).scalar_one_or_none()
    if user is None or user.status != UserStatus.active:
        return None

    role_rows = (
        await db.execute(select(UserRole.role).where(UserRole.user_id == user.id))
    ).scalars().all()

    team_rows = (
        await db.execute(
            select(TeamMember.team_id, TeamMember.is_manager).where(
                TeamMember.user_id == user.id
            )
        )
    ).all()

    managed = frozenset(tid for tid, is_mgr in team_rows if is_mgr)
    all_teams = frozenset(tid for tid, _ in team_rows)

    return CurrentUser(
        id=user.id,
        org_id=user.org_id,
        email=user.email,
        full_name=user.full_name,
        roles=frozenset(role_rows),
        timezone=user.timezone,
        github_login=user.github_login,
        managed_team_ids=managed,
        member_team_ids=all_teams,
    )