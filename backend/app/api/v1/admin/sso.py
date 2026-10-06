from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_admin
from app.api.dependencies.rate_limit import rate_limit
from app.core import embed
from app.core.config import settings
from app.core.database import get_db
from app.core.embed import get_allowed_frame_ancestors
from app.core.permissions import CurrentUser
from app.schemas.admin_ops import SSOConfigOut, SSOConfigUpdate
from app.services import admin_service, audit_service


router = APIRouter(
    prefix="/sso",
    tags=["admin:sso"],
)


# ============================================================================
# Request helpers
# ============================================================================


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


# ============================================================================
# Response mapping
# ============================================================================


def _to_out(c) -> SSOConfigOut:  # noqa: ANN001
    """
    Convert the database SSO configuration into the admin API response.

    effective_frame_ancestors is intentionally initialized as an empty list
    here because resolving the effective values requires async access to the
    embed configuration/cache.

    The endpoint populates it after calling this function.
    """

    return SSOConfigOut(
        enabled=c.enabled,
        group_claim=c.group_claim,
        group_to_role_admin=c.group_to_role_admin,
        group_to_role_manager=c.group_to_role_manager,
        group_to_role_member=c.group_to_role_member,
        allowed_embed_origins=list(
            c.allowed_embed_origins or []
        ),
        effective_frame_ancestors=[],
        env_oidc_enabled=settings.OIDC_ENABLED,
        env_client_id=settings.OIDC_CLIENT_ID,
        env_scopes=settings.OIDC_SCOPES,
        env_issuer=(
            str(settings.OIDC_ISSUER)
            if settings.OIDC_ISSUER is not None
            else None
        ),
        env_redirect_uri=(
            str(settings.OIDC_REDIRECT_URI)
            if settings.OIDC_REDIRECT_URI is not None
            else None
        ),
    )


# ============================================================================
# Audit snapshot
# ============================================================================


def _snapshot(c) -> dict:  # noqa: ANN001
    return {
        "enabled": c.enabled,
        "group_claim": c.group_claim,
        "group_to_role_admin": c.group_to_role_admin,
        "group_to_role_manager": c.group_to_role_manager,
        "group_to_role_member": c.group_to_role_member,
        "allowed_embed_origins": list(
            c.allowed_embed_origins or []
        ),
    }


# ============================================================================
# GET /admin/sso
# ============================================================================


@router.get(
    "",
    response_model=SSOConfigOut,
)
async def get_config(
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SSOConfigOut:
    """
    Return the organization SSO configuration.

    In addition to the database configuration, expose the effective
    frame-ancestors values currently used by the embedding middleware.
    """

    cfg = await admin_service.get_or_create_sso(
        db,
        actor.org_id,
    )

    out = _to_out(cfg)

    out.effective_frame_ancestors = (
        await get_allowed_frame_ancestors()
    )

    return out


# ============================================================================
# PATCH /admin/sso
# ============================================================================


@router.patch(
    "",
    response_model=SSOConfigOut,
    dependencies=[Depends(rate_limit("admin.write"))],
)
async def update_config(
    payload: SSOConfigUpdate,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SSOConfigOut:
    """
    Update organization SSO configuration.

    The embedding configuration cache is invalidated immediately after the
    database update so subsequent requests use the new allowed origins.
    """

    cfg = await admin_service.get_or_create_sso(
        db,
        actor.org_id,
    )

    before = _snapshot(cfg)

    cfg = await admin_service.update_sso(
        db,
        cfg=cfg,
        fields=payload.model_dump(
            exclude_unset=True,
        ),
    )

    # The SSO configuration may contain allowed embed origins. Invalidate the
    # effective embedding-policy cache immediately after the update.
    embed.invalidate_cache()

    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="admin.sso.update",
        entity="sso_config",
        entity_id=cfg.id,
        before=before,
        after=_snapshot(cfg),
        ip=_ip(request),
    )

    out = _to_out(cfg)

    out.effective_frame_ancestors = (
        await get_allowed_frame_ancestors()
    )

    return out