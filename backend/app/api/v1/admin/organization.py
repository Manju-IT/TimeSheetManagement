from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_admin
from app.api.dependencies.rate_limit import rate_limit
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.schemas.admin_ops import OrganizationOut, OrganizationUpdate
from app.services import admin_service, audit_service


router = APIRouter(
    prefix="/organization",
    tags=["admin:organization"],
)


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _snapshot(o) -> dict:  # noqa: ANN001
    return {
        "name": o.name,
        "default_timezone": o.default_timezone,
        "workday_cutoff": (
            o.workday_cutoff.strftime("%H:%M")
            if o.workday_cutoff
            else None
        ),
    }


def _to_out(o) -> OrganizationOut:  # noqa: ANN001
    return OrganizationOut(
        id=o.id,
        name=o.name,
        default_timezone=o.default_timezone,
        workday_cutoff=(
            o.workday_cutoff.strftime("%H:%M")
            if o.workday_cutoff
            else None
        ),
        created_at=o.created_at,
        updated_at=o.updated_at,
    )


@router.get(
    "",
    response_model=OrganizationOut,
)
async def get_org(
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OrganizationOut:
    org = await admin_service.get_organization_or_404(
        db,
        actor.org_id,
    )

    # Explicitly materialize the fields while we are inside
    # the async SQLAlchemy context.
    return _to_out(org)


@router.patch(
    "",
    response_model=OrganizationOut,
    dependencies=[Depends(rate_limit("admin.write"))],
)
async def update_org(
    payload: OrganizationUpdate,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OrganizationOut:
    org = await admin_service.get_organization_or_404(
        db,
        actor.org_id,
    )

    before = _snapshot(org)

    org = await admin_service.update_organization(
        db,
        org=org,
        name=payload.name,
        default_timezone=payload.default_timezone,
        workday_cutoff=payload.workday_cutoff,
        clear_workday_cutoff=payload.clear_workday_cutoff,
    )

    # Flush any pending changes before reading generated fields.
    await db.flush()

    # Explicitly refresh server-generated / expired attributes.
    # This is important for AsyncSession because accessing an
    # expired attribute can otherwise trigger implicit IO and cause
    # MissingGreenlet.
    await db.refresh(org)

    after = _snapshot(org)

    await audit_service.record(
        db,
        actor_user_id=actor.id,
        org_id=actor.org_id,
        action="admin.organization.update",
        entity="organization",
        entity_id=org.id,
        before=before,
        after=after,
        ip=_ip(request),
    )

    # Do not let Pydantic trigger lazy loading.
    return _to_out(org)