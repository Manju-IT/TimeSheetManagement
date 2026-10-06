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


async def _default_org_id(db: AsyncSession) -> uuid.UUID:
    """
    Resolve the default organization.

    The organization must be resolved before any DB-backed SSO
    configuration, role mapping, or user provisioning can occur.
    """
    org = (
        await db.execute(
            select(Organization).limit(1)
        )
    ).scalar_one_or_none()

    if org is None:
        raise RuntimeError(
            "No organization exists. Run `alembic upgrade head` "
            "(0002 seeds a default org) or the seed script."
        )

    return org.id


async def _roles_from_ims_groups(
    db: AsyncSession,
    org_id: uuid.UUID,
    groups: list[str],
) -> set[Role]:
    """
    Map IdP group memberships to application roles.

    DB-backed SSO configuration takes precedence over environment
    configuration. Environment variables are used only as fallback.
    """
    from app.models.organization import SSOConfig

    cfg = (
        await db.execute(
            select(SSOConfig).where(
                SSOConfig.org_id == org_id
            )
        )
    ).scalar_one_or_none()

    admin_group = (
        (cfg.group_to_role_admin if cfg else None)
        or settings.OIDC_GROUP_TO_ROLE_ADMIN
    )

    manager_group = (
        (cfg.group_to_role_manager if cfg else None)
        or settings.OIDC_GROUP_TO_ROLE_MANAGER
    )

    member_group = (
        (cfg.group_to_role_member if cfg else None)
        or settings.OIDC_GROUP_TO_ROLE_MEMBER
    )

    gset = {
        g.strip()
        for g in groups
        if g and isinstance(g, str)
    }

    result: set[Role] = set()

    if admin_group and admin_group in gset:
        result.add(Role.admin)

    if manager_group and manager_group in gset:
        result.add(Role.manager)

    if member_group and member_group in gset:
        result.add(Role.member)

    # Every successfully provisioned IMS user receives at least
    # the member role when no configured group mapping matches.
    if not result:
        result.add(Role.member)

    return result


async def ensure_user_roles(
    db: AsyncSession,
    user: AppUser,
    roles: set[Role],
) -> set[Role]:
    """
    Ensure the requested roles exist for the user.

    Returns only roles that were newly added.
    """
    existing = {
        r.role
        for r in (
            await db.execute(
                select(UserRole).where(
                    UserRole.user_id == user.id
                )
            )
        ).scalars()
    }

    added: set[Role] = set()

    for role in roles - existing:
        db.add(
            UserRole(
                user_id=user.id,
                role=role,
            )
        )
        added.add(role)

    return added


async def provision_from_ims(
    db: AsyncSession,
    claims: dict[str, Any],
) -> ProvisionedUser:
    """
    JIT user creation/update from a validated ID token claim set.

    Organization resolution happens first because DB-backed SSO
    configuration, group-claim selection, and role mapping all
    depend on the organization.
    """
    subject = claims.get("sub")

    if not subject or not isinstance(subject, str):
        raise ValueError(
            "IMS claim `sub` is required"
        )

    email = claims.get("email")

    if not email or not isinstance(email, str):
        raise ValueError(
            "IMS claim `email` is required"
        )

    full_name = (
        claims.get("name")
        or claims.get("preferred_username")
        or email
    )

    # ---------------------------------------------------------
    # 1. Resolve organization FIRST.
    # ---------------------------------------------------------
    org_id = await _default_org_id(db)

    # ---------------------------------------------------------
    # 2. Load DB-backed SSO configuration.
    #    DB configuration wins over environment variables.
    # ---------------------------------------------------------
    from app.models.organization import SSOConfig

    sso_cfg = (
        await db.execute(
            select(SSOConfig).where(
                SSOConfig.org_id == org_id
            )
        )
    ).scalar_one_or_none()

    # ---------------------------------------------------------
    # 3. Resolve the group claim name.
    # ---------------------------------------------------------
    claim_name = (
        (sso_cfg.group_claim if sso_cfg else None)
        or settings.OIDC_GROUP_CLAIM
    )

    # ---------------------------------------------------------
    # 4. Extract groups from the validated ID-token claims.
    #
    #    Supported forms:
    #      - "group1,group2"
    #      - ["group1", "group2"]
    # ---------------------------------------------------------
    raw_groups = claims.get(claim_name) or []

    if isinstance(raw_groups, str):
        groups = [
            group.strip()
            for group in raw_groups.split(",")
            if group.strip()
        ]

    elif isinstance(raw_groups, list):
        groups = [
            group
            for group in raw_groups
            if isinstance(group, str)
        ]

    else:
        groups = []

    # ---------------------------------------------------------
    # 5. Resolve application roles.
    #
    #    DB-backed mappings take precedence over env mappings.
    # ---------------------------------------------------------
    target_roles = await _roles_from_ims_groups(
        db,
        org_id,
        groups,
    )

    is_new = False
    user: AppUser | None = None

    # ---------------------------------------------------------
    # 6. Find an existing IMS identity by provider subject.
    # ---------------------------------------------------------
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
            await db.execute(
                select(AppUser).where(
                    AppUser.id == identity.user_id
                )
            )
        ).scalar_one()

    else:
        # -----------------------------------------------------
        # 7. Fallback to email matching.
        # -----------------------------------------------------
        user = (
            await db.execute(
                select(AppUser).where(
                    AppUser.email == email
                )
            )
        ).scalar_one_or_none()

    # ---------------------------------------------------------
    # 8. Create the user if this is the first login.
    # ---------------------------------------------------------
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

    # ---------------------------------------------------------
    # 9. Update mutable profile fields.
    # ---------------------------------------------------------
    user.full_name = full_name or user.full_name

    if not user.ims_user_id:
        user.ims_user_id = subject

    # Disabled users may authenticate against IMS, but they
    # cannot create a session. The caller/AuthService handles
    # the final status check.
    if user.status != UserStatus.active:
        pass

    # ---------------------------------------------------------
    # 10. Create IMS identity if it does not already exist.
    # ---------------------------------------------------------
    if identity is None:
        db.add(
            ImsIdentity(
                user_id=user.id,
                provider="ims",
                provider_subject=subject,
            )
        )

    # ---------------------------------------------------------
    # 11. Ensure the mapped roles exist.
    # ---------------------------------------------------------
    roles_added = await ensure_user_roles(
        db,
        user,
        target_roles,
    )

    log.info(
        "ims_provisioned",
        user_id=str(user.id),
        is_new=is_new,
        roles_added=[
            role.value
            for role in roles_added
        ],
    )

    return ProvisionedUser(
        user=user,
        is_new=is_new,
        roles_added=roles_added,
    )


async def load_current_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> CurrentUser | None:
    """
    Load the currently authenticated application user,
    including roles and team memberships.
    """
    from app.models.team import TeamMember

    user = (
        await db.execute(
            select(AppUser).where(
                AppUser.id == user_id
            )
        )
    ).scalar_one_or_none()

    if user is None or user.status != UserStatus.active:
        return None

    # ---------------------------------------------------------
    # Load application roles.
    # ---------------------------------------------------------
    role_rows = (
        await db.execute(
            select(UserRole.role).where(
                UserRole.user_id == user.id
            )
        )
    ).scalars().all()

    # ---------------------------------------------------------
    # Load team memberships.
    # ---------------------------------------------------------
    team_rows = (
        await db.execute(
            select(
                TeamMember.team_id,
                TeamMember.is_manager,
            ).where(
                TeamMember.user_id == user.id
            )
        )
    ).all()

    managed = frozenset(
        team_id
        for team_id, is_manager in team_rows
        if is_manager
    )

    all_teams = frozenset(
        team_id
        for team_id, _ in team_rows
    )

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