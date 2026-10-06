from __future__ import annotations

import uuid

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import audit_service
from app.api.dependencies.auth import get_current_user, require_manager
from app.api.dependencies.pagination import Pagination, pagination_params
from app.api.dependencies.rate_limit import rate_limit
from app.core.database import get_db
from app.core.exceptions import Conflict, Forbidden
from app.core.idempotency import idempotent_call
from app.core.locks import acquire_advisory_locks
from app.core.permissions import CurrentUser
from app.models.enums import SyncState, SyncTrigger
from app.models.project import Project
from app.models.sync_log import SyncLog
from app.models.task import Task
from app.schemas.common import PaginatedResponse, PaginationMeta
from app.schemas.task import (
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from app.services import task_service
from app.schemas.github import (
    ConflictResolveRequest,
    TaskSyncStatusOut,
    SyncTrigger,
    SyncLogOut,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


async def _ensure_project_in_org(db, project_id, org_id):
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project is None or project.org_id != org_id:
        raise Forbidden("Project belongs to a different organization")

def select_project(project_id):
    return select(Project).where(Project.id == project_id)


@router.get("", response_model=PaginatedResponse[TaskOut])
async def list_tasks(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    pagination: Pagination = Depends(pagination_params),
    project_id: uuid.UUID | None = Query(default=None),
    assignee_user_id: uuid.UUID | None = Query(default=None),
    status: str | None = Query(default=None, max_length=80),
    sync_state: SyncState | None = Query(default=None),
    include_inactive: bool = Query(default=False),
) -> PaginatedResponse[TaskOut]:
    rows, total = await task_service.list_tasks(
        db,
        org_id=user.org_id,
        project_id=project_id,
        assignee_user_id=assignee_user_id,
        status=status,
        sync_state=sync_state,
        include_inactive=include_inactive,
        offset=pagination.offset,
        limit=pagination.limit,
    )
    return PaginatedResponse[TaskOut](
        data=[TaskOut.model_validate(t) for t in rows],
        pagination=PaginationMeta(
            page=pagination.page,
            page_size=pagination.page_size,
            total=total,
            has_next=pagination.offset + len(rows) < total,
        ),
    )


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    task = await task_service.get_task_or_404(db, task_id)
    project = (await db.execute(select_project(task.project_id))).scalar_one()
    if project.org_id != user.org_id:
        raise Forbidden("Task belongs to a different organization")
    return TaskOut.model_validate(task)


@router.post("", response_model=TaskOut)
async def create_task(
    payload: TaskCreate,
    request: Request,
    actor: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    await _ensure_project_in_org(db, payload.project_id, actor.org_id)
    task = await task_service.create_task(
        db,
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        assignee_user_id=payload.assignee_user_id,
    )
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="task.create",
        entity="task",
        entity_id=task.id,
        after={"title": task.title, "project_id": str(task.project_id)},
        ip=_ip(request),
    )
    return TaskOut.model_validate(task)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    request: Request,
    actor: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    task = await task_service.get_task_or_404(db, task_id)
    project = (await db.execute(select_project(task.project_id))).scalar_one()
    if project.org_id != actor.org_id:
        raise Forbidden("Task belongs to a different organization")

    before = {
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "assignee_user_id": str(task.assignee_user_id) if task.assignee_user_id else None,
        "is_active": task.is_active,
        "sync_state": task.sync_state.value,
    }
    task = await task_service.update_task(
        db,
        task,
        expected_updated_at=payload.expected_updated_at,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        assignee_user_id=payload.assignee_user_id,
        set_assignee="assignee_user_id" in payload.model_fields_set,
        is_active=payload.is_active,
    )
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="task.update",
        entity="task",
        entity_id=task.id,
        before=before,
        after={
            "title": task.title,
            "description": task.description,
            "status": task.status,
            "assignee_user_id": str(task.assignee_user_id) if task.assignee_user_id else None,
            "is_active": task.is_active,
            "sync_state": task.sync_state.value,
        },
        ip=_ip(request),
    )
    return TaskOut.model_validate(task)



@router.post(
    "/{task_id}/sync",
    response_model=TaskOut,
    dependencies=[Depends(rate_limit("task.sync"))],
)
async def sync_now(
    task_id: uuid.UUID,
    request: Request,
    actor: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:

    async def _do() -> TaskOut:
        task = await task_service.get_task_or_404(
            db,
            task_id,
        )

        project = (
            await db.execute(
                select_project(task.project_id)
            )
        ).scalar_one()

        if project.org_id != actor.org_id:
            raise Forbidden(
                "Task belongs to a different organization"
            )

        if task.gh_item_node_id is None:
            raise Conflict(
                "Task is not linked to GitHub"
            )

        if task.sync_state == "syncing":
            raise Conflict(
                "A sync is currently running for this task",
                details={
                    "code": "SYNC_IN_FLIGHT"
                },
            )

        await acquire_advisory_locks(
            db,
            f"github_project:{task.project_id}",
        )

        task = (
            await db.execute(
                select(Task)
                .where(Task.id == task_id)
                .with_for_update()
            )
        ).scalar_one()

        task.sync_state = "syncing"
        task.sync_last_attempt_at = datetime.now(
            timezone.utc
        )
        task.sync_attempts = (
            task.sync_attempts or 0
        ) + 1
        task.sync_last_error_code = None

        await db.flush()

        await github_sync_service.push_task(
            db,
            task=task,
            trigger=SyncTrigger.user_edit,
        )

        return TaskOut.model_validate(task)

    return await idempotent_call(
        db,
        request=request,
        scope="task.sync",
        handler=_do,
    )


@router.get("/{task_id}/sync-status", response_model=TaskSyncStatusOut)
async def sync_status(
    task_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskSyncStatusOut:
    task = await task_service.get_task_or_404(db, task_id)
    project = (await db.execute(select_project(task.project_id))).scalar_one()
    if project.org_id != user.org_id:
        raise Forbidden("Task belongs to a different organization")
    last_log = (
        await db.execute(
            select(SyncLog).where(SyncLog.entity_id == task.id)
            .order_by(desc(SyncLog.created_at)).limit(1)
        )
    ).scalar_one_or_none()
    return TaskSyncStatusOut(
        task_id=task.id,
        sync_state=task.sync_state.value,
        gh_updated_at=task.gh_updated_at,
        last_synced_at=task.gh_updated_at,
        local_updated_at=task.local_updated_at,
        attempts=task.sync_attempts or 0,
        last_error=last_log.error_message if last_log else None,
        last_error_code=task.sync_last_error_code,
        conflict_detected_at=task.conflict_detected_at,
    )


@router.get("/{task_id}/conflict")
async def conflict_preview(
    task_id: uuid.UUID,
    user: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task_or_404(db, task_id)
    project = (await db.execute(select_project(task.project_id))).scalar_one()
    if project.org_id != user.org_id:
        raise Forbidden("Task belongs to a different organization")
    preview = await github_conflict_service.preview(db, task_id=task_id)
    return {
        "task_id": str(preview.task_id),
        "detected_at": preview.detected_at.isoformat() if preview.detected_at else None,
        "conflict_remote_updated_at": (
            preview.conflict_remote_updated_at.isoformat()
            if preview.conflict_remote_updated_at else None
        ),
        "remote_updated_at_now": (
            preview.remote_updated_at_now.isoformat()
            if preview.remote_updated_at_now else None
        ),
        "remote_deleted": preview.remote_deleted,
        "local": {
            "title": preview.local_title,
            "description": preview.local_description,
            "status": preview.local_status,
        },
        "remote": {
            "title": preview.remote_title,
            "description": preview.remote_description,
            "status": preview.remote_status,
        },
    }


@router.post(
    "/{task_id}/conflict/resolve",
    response_model=TaskOut,
    dependencies=[Depends(rate_limit("task.conflict_resolve"))],
)
async def resolve_conflict(
    task_id: uuid.UUID,
    payload: ConflictResolveRequest,
    request: Request,
    user: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:

    async def _do() -> TaskOut:
        resolved = await github_conflict_service.resolve(
            db,
            task_id=task_id,
            strategy=payload.strategy,
            actor_id=user.id,
            ip=(
                request.client.host
                if request.client
                else None
            ),
        )

        return TaskOut.model_validate(resolved)

    return await idempotent_call(
        db,
        request=request,
        scope="task.conflict_resolve",
        handler=_do,
    )