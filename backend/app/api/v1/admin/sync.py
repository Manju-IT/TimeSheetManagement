from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_admin
from app.api.dependencies.pagination import Pagination, pagination_params
from app.api.dependencies.rate_limit import rate_limit
from app.core.database import get_db
from app.core.exceptions import Conflict, NotFound
from app.core.permissions import CurrentUser
from app.models.enums import SyncDirection, SyncEntity, SyncState, SyncStatus, SyncTrigger
from app.models.sync_log import SyncLog
from app.models.task import Task
from app.schemas.admin_ops import SyncRetryOut
from app.schemas.common import PaginatedResponse, PaginationMeta
from app.schemas.github import SyncLogOut
from app.services import audit_service

router = APIRouter(prefix="/sync-logs", tags=["admin:sync"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("", response_model=PaginatedResponse[SyncLogOut])
async def list_sync_logs(
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    pagination: Pagination = Depends(pagination_params),
    direction: SyncDirection | None = Query(default=None),
    entity: SyncEntity | None = Query(default=None),
    trigger: SyncTrigger | None = Query(default=None),
    status: SyncStatus | None = Query(default=None),
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
) -> PaginatedResponse[SyncLogOut]:
    base = select(SyncLog).where(SyncLog.org_id == actor.org_id)
    count = select(func.count(SyncLog.id)).where(SyncLog.org_id == actor.org_id)
    if direction is not None:
        base = base.where(SyncLog.direction == direction)
        count = count.where(SyncLog.direction == direction)
    if entity is not None:
        base = base.where(SyncLog.entity == entity)
        count = count.where(SyncLog.entity == entity)
    if trigger is not None:
        base = base.where(SyncLog.trigger == trigger)
        count = count.where(SyncLog.trigger == trigger)
    if status is not None:
        base = base.where(SyncLog.status == status)
        count = count.where(SyncLog.status == status)
    if since is not None:
        base = base.where(SyncLog.created_at >= since)
        count = count.where(SyncLog.created_at >= since)
    if until is not None:
        base = base.where(SyncLog.created_at <= until)
        count = count.where(SyncLog.created_at <= until)

    total = (await db.execute(count)).scalar_one()
    rows = list(
        (
            await db.execute(
                base.order_by(SyncLog.created_at.desc())
                .offset(pagination.offset)
                .limit(pagination.limit)
            )
        ).scalars()
    )
    return PaginatedResponse[SyncLogOut](
        data=[SyncLogOut.model_validate(r) for r in rows],
        pagination=PaginationMeta(
            page=pagination.page,
            page_size=pagination.page_size,
            total=total,
            has_next=pagination.offset + len(rows) < total,
        ),
    )


@router.post(
    "/retry/{task_id}",
    response_model=SyncRetryOut,
    dependencies=[Depends(rate_limit("github.manual_sync"))],
)
async def retry_task(
    task_id: uuid.UUID,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SyncRetryOut:
    task = (
        await db.execute(select(Task).where(Task.id == task_id).with_for_update())
    ).scalar_one_or_none()
    if task is None:
        raise NotFound("Task not found")
    if task.gh_item_node_id is None:
        raise Conflict("Task is not linked to GitHub")

    previous = task.sync_state.value
    task.sync_state = SyncState.pending_push
    task.sync_attempts = 0
    task.sync_last_error_code = None
    await db.flush()

    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="admin.sync.retry",
        entity="task",
        entity_id=task.id,
        before={"sync_state": previous},
        after={"sync_state": "pending_push"},
        ip=_ip(request),
    )
    return SyncRetryOut(task_id=task.id, queued=True, previous_state=previous)