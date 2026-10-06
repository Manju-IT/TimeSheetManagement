from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_admin
from app.api.dependencies.rate_limit import rate_limit
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.schemas.admin_ops import (
    WorkSiteCreate,
    WorkSiteOut,
    WorkSiteUpdate,
)
from app.schemas.common import OkResponse
from app.services import admin_service, audit_service

router = APIRouter(prefix="/work-sites", tags=["admin:work-sites"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _snapshot(site) -> dict:  # noqa: ANN001
    return {
        "name": site.name,
        "latitude": float(site.latitude),
        "longitude": float(site.longitude),
        "radius_m": float(site.radius_m),
        "is_active": site.is_active,
    }


@router.get("", response_model=list[WorkSiteOut])
async def list_sites(
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[WorkSiteOut]:
    sites = await admin_service.list_work_sites(db, actor.org_id)
    return [WorkSiteOut.model_validate(s) for s in sites]


@router.post(
    "",
    response_model=WorkSiteOut,
    dependencies=[Depends(rate_limit("admin.write"))],
)
async def create_site(
    payload: WorkSiteCreate,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> WorkSiteOut:
    site = await admin_service.create_work_site(
        db,
        org_id=actor.org_id,
        name=payload.name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        radius_m=payload.radius_m,
        is_active=payload.is_active,
    )
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="admin.work_site.create",
        entity="work_site",
        entity_id=site.id,
        after=_snapshot(site),
        ip=_ip(request),
    )
    return WorkSiteOut.model_validate(site)


@router.patch(
    "/{site_id}",
    response_model=WorkSiteOut,
    dependencies=[Depends(rate_limit("admin.write"))],
)
async def update_site(
    site_id: uuid.UUID,
    payload: WorkSiteUpdate,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> WorkSiteOut:
    site = await admin_service.get_work_site_or_404(
        db, org_id=actor.org_id, site_id=site_id
    )
    before = _snapshot(site)
    site = await admin_service.update_work_site(
        db, site=site, fields=payload.model_dump(exclude_unset=True)
    )
   
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="admin.work_site.update",
        entity="work_site",
        entity_id=site.id,
        before=before,
        after=_snapshot(site),
        ip=_ip(request),
    )
    await db.commit()
    await db.refresh(site)
    return WorkSiteOut.model_validate(site)

@router.delete(
    "/{site_id}",
    response_model=OkResponse,
    dependencies=[Depends(rate_limit("admin.write"))],
)
async def deactivate_site(
    site_id: uuid.UUID,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    site = await admin_service.get_work_site_or_404(
        db, org_id=actor.org_id, site_id=site_id
    )
    before = _snapshot(site)
    site = await admin_service.deactivate_work_site(db, site=site)
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="admin.work_site.deactivate",
        entity="work_site",
        entity_id=site.id,
        before=before,
        after=_snapshot(site),
        ip=_ip(request),
    )
    return OkResponse(ok=True)