from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_admin
from app.api.dependencies.rate_limit import rate_limit
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.schemas.admin_ops import PolicyOut, PolicyUpdate
from app.services import admin_service, audit_service

router = APIRouter(prefix="/policies", tags=["admin:policies"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _snapshot(p) -> dict:  # noqa: ANN001
    return {
        "workday_hours": p.workday_hours,
        "variance_threshold_minutes": p.variance_threshold_minutes,
        "auto_logout_minutes": p.auto_logout_minutes,
        "allow_login_without_location": p.allow_login_without_location,
        "location_retention_days": p.location_retention_days,
    }


@router.get("", response_model=PolicyOut)
async def get_policy(
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PolicyOut:
    p = await admin_service.get_or_create_policy(db, actor.org_id)
    return PolicyOut.model_validate(p)


@router.patch(
    "",
    response_model=PolicyOut,
    dependencies=[Depends(rate_limit("admin.write"))],
)
async def update_policy(
    payload: PolicyUpdate,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PolicyOut:
    p = await admin_service.get_or_create_policy(db, actor.org_id)
    before = _snapshot(p)
    p = await admin_service.update_policy(
        db, policy=p, fields=payload.model_dump(exclude_unset=True)
    )
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="admin.policy.update",
        entity="org_policy",
        entity_id=p.id,
        before=before,
        after=_snapshot(p),
        ip=_ip(request),
    )
    return PolicyOut.model_validate(p)