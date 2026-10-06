"""Administrative operations: work sites, policies, org profile, SSO overrides."""
from __future__ import annotations

import uuid
from datetime import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import Conflict, NotFound
from app.models.organization import Organization, OrgPolicy, SSOConfig
from app.models.work_site import WorkSite


# ---- Work sites -----------------------------------------------------------

async def list_work_sites(db: AsyncSession, org_id: uuid.UUID) -> list[WorkSite]:
    return list(
        (
            await db.execute(
                select(WorkSite)
                .where(WorkSite.org_id == org_id)
                .order_by(WorkSite.is_active.desc(), WorkSite.name.asc())
            )
        ).scalars()
    )


async def get_work_site_or_404(
    db: AsyncSession, *, org_id: uuid.UUID, site_id: uuid.UUID
) -> WorkSite:
    site = (
        await db.execute(select(WorkSite).where(WorkSite.id == site_id))
    ).scalar_one_or_none()
    if site is None or site.org_id != org_id:
        raise NotFound("Work site not found")
    return site


async def create_work_site(
    db: AsyncSession, *, org_id: uuid.UUID, **fields
) -> WorkSite:
    site = WorkSite(org_id=org_id, **fields)
    db.add(site)
    await db.flush()
    return site


async def update_work_site(
    db: AsyncSession, *, site: WorkSite, fields: dict
) -> WorkSite:
    for k, v in fields.items():
        if v is not None:
            setattr(site, k, v)
    await db.flush()
    return site


async def deactivate_work_site(db: AsyncSession, *, site: WorkSite) -> WorkSite:
    site.is_active = False
    await db.flush()
    return site


# ---- Policies -------------------------------------------------------------

async def get_or_create_policy(db: AsyncSession, org_id: uuid.UUID) -> OrgPolicy:
    policy = (
        await db.execute(select(OrgPolicy).where(OrgPolicy.org_id == org_id))
    ).scalar_one_or_none()
    if policy is None:
        policy = OrgPolicy(
            org_id=org_id,
            workday_hours=settings.DEFAULT_WORKDAY_HOURS,
            variance_threshold_minutes=settings.VARIANCE_THRESHOLD_MINUTES,
            auto_logout_minutes=settings.AUTO_LOGOUT_MINUTES,
            allow_login_without_location=True,
            location_retention_days=settings.LOCATION_RETENTION_DAYS,
        )
        db.add(policy)
        await db.flush()
    return policy


async def update_policy(
    db: AsyncSession, *, policy: OrgPolicy, fields: dict
) -> OrgPolicy:
    for k, v in fields.items():
        if v is not None:
            setattr(policy, k, v)
    await db.flush()
    return policy


# ---- Organization ---------------------------------------------------------

async def get_organization_or_404(
    db: AsyncSession, org_id: uuid.UUID
) -> Organization:
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if org is None:
        raise NotFound("Organization not found")
    return org


async def update_organization(
    db: AsyncSession,
    *,
    org: Organization,
    name: str | None,
    default_timezone: str | None,
    workday_cutoff: str | None,
    clear_workday_cutoff: bool,
) -> Organization:
    if name is not None:
        org.name = name
    if default_timezone is not None:
        # Validate via zoneinfo
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            ZoneInfo(default_timezone)
        except ZoneInfoNotFoundError as e:
            raise Conflict(
                f"Unknown timezone: {default_timezone}",
                details={"code": "INVALID_TIMEZONE"},
            ) from e
        org.default_timezone = default_timezone
    if clear_workday_cutoff:
        org.workday_cutoff = None
    elif workday_cutoff is not None:
        hh, mm = workday_cutoff.split(":")
        org.workday_cutoff = time(int(hh), int(mm))
    await db.flush()
    return org


# ---- SSO ------------------------------------------------------------------

async def get_or_create_sso(
    db: AsyncSession, org_id: uuid.UUID
) -> SSOConfig:
    cfg = (
        await db.execute(select(SSOConfig).where(SSOConfig.org_id == org_id))
    ).scalar_one_or_none()
    if cfg is None:
        cfg = SSOConfig(
            org_id=org_id,
            enabled=settings.OIDC_ENABLED,
            group_claim=settings.OIDC_GROUP_CLAIM,
            group_to_role_admin=settings.OIDC_GROUP_TO_ROLE_ADMIN,
            group_to_role_manager=settings.OIDC_GROUP_TO_ROLE_MANAGER,
            group_to_role_member=settings.OIDC_GROUP_TO_ROLE_MEMBER,
            allowed_embed_origins=[],
        )
        db.add(cfg)
        await db.flush()
    return cfg


async def update_sso(
    db: AsyncSession, *, cfg: SSOConfig, fields: dict
) -> SSOConfig:
    if fields.get("allowed_embed_origins") is not None:
        origins = fields["allowed_embed_origins"]
        # Basic validation: absolute http(s) origins, no trailing slash.
        cleaned: list[str] = []
        for o in origins:
            o = (o or "").strip()
            if not o:
                continue
            if not (o.startswith("http://") or o.startswith("https://")):
                raise Conflict(
                    f"Embed origin must be an absolute http(s) URL: {o}",
                    details={"code": "INVALID_ORIGIN"},
                )
            cleaned.append(o.rstrip("/"))
        cfg.allowed_embed_origins = cleaned
    for k in ("enabled", "group_claim", "group_to_role_admin",
              "group_to_role_manager", "group_to_role_member"):
        if fields.get(k) is not None:
            setattr(cfg, k, fields[k])
    await db.flush()
    return cfg