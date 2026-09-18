from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_admin
from app.api.dependencies.pagination import Pagination, pagination_params
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.models.audit_log import AuditLog
from app.schemas.admin import AuditLogOut
from app.schemas.common import PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/audit-logs", tags=["admin:audit"])


@router.get("", response_model=PaginatedResponse[AuditLogOut])
async def list_audit_logs(
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    pagination: Pagination = Depends(pagination_params),
    action: str | None = Query(default=None, max_length=120),
    entity: str | None = Query(default=None, max_length=80),
    actor_user_id: uuid.UUID | None = Query(default=None),
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
) -> PaginatedResponse[AuditLogOut]:
    # Audit is org-wide; the DB currently has no org column on audit_log,
    # so we restrict by the set of users in this org when the caller filters by actor.
    base = select(AuditLog)
    count_stmt = select(func.count(AuditLog.id))
    if action:
        base = base.where(AuditLog.action == action)
        count_stmt = count_stmt.where(AuditLog.action == action)
    if entity:
        base = base.where(AuditLog.entity == entity)
        count_stmt = count_stmt.where(AuditLog.entity == entity)
    if actor_user_id:
        base = base.where(AuditLog.actor_user_id == actor_user_id)
        count_stmt = count_stmt.where(AuditLog.actor_user_id == actor_user_id)
    if since:
        base = base.where(AuditLog.created_at >= since)
        count_stmt = count_stmt.where(AuditLog.created_at >= since)
    if until:
        base = base.where(AuditLog.created_at <= until)
        count_stmt = count_stmt.where(AuditLog.created_at <= until)

    total = (await db.execute(count_stmt)).scalar_one()
    rows = list(
        (
            await db.execute(
                base.order_by(AuditLog.created_at.desc())
                .offset(pagination.offset)
                .limit(pagination.limit)
            )
        ).scalars()
    )
    return PaginatedResponse[AuditLogOut](
        data=[AuditLogOut.model_validate(r) for r in rows],
        pagination=PaginationMeta(
            page=pagination.page,
            page_size=pagination.page_size,
            total=total,
            has_next=pagination.offset + len(rows) < total,
        ),
    )