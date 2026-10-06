"""Conflict resolution with revalidation.

Rules:
  - `keep_mine` MUST revalidate. The remote value of `updatedAt` at conflict
    time is stored in `task.conflict_remote_updated_at`. If remote has moved
    since then, we refuse and force the user to reopen the diff.
  - `use_github` fetches authoritative remote state and overwrites local.
  - Both paths acquire the project advisory lock so concurrent scheduled /
    webhook / manual sync cannot interleave with resolution.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import Conflict, NotFound
from app.core.locks import acquire_advisory_locks
from app.core.logging import get_logger
from app.integrations.github.client import get_client
from app.integrations.github.errors import GitHubError, GitHubNotFound
from app.integrations.github.queries import GET_PROJECT_ITEM_BY_ID
from app.integrations.github.types import parse_item
from app.models.enums import (
    SyncDirection,
    SyncEntity,
    SyncState,
    SyncStatus,
    SyncTrigger,
)
from app.models.sync_log import SyncLog
from app.models.task import Task
from app.services import audit_service, github_sync_service

log = get_logger("app.github_conflict")

_LEASE_TIMEOUT = timedelta(minutes=5)


@dataclass
class ConflictPreview:
    task_id: uuid.UUID
    detected_at: datetime | None
    conflict_remote_updated_at: datetime | None
    remote_updated_at_now: datetime | None
    local_title: str
    local_description: str
    local_status: str
    remote_title: str
    remote_description: str
    remote_status: str
    remote_deleted: bool


async def preview(db: AsyncSession, *, task_id: uuid.UUID) -> ConflictPreview:
    task = (
        await db.execute(select(Task).where(Task.id == task_id))
    ).scalar_one_or_none()
    if task is None or task.gh_item_node_id is None:
        raise NotFound("Task not found or not linked to GitHub")

    remote_title = remote_desc = remote_status = ""
    remote_updated_at_now: datetime | None = None
    remote_deleted = False

    client = get_client()
    try:
        resp = await client.execute(
            GET_PROJECT_ITEM_BY_ID, {"itemId": task.gh_item_node_id}
        )
        item = parse_item(resp.data.get("node") or {})
        if item is None:
            remote_deleted = True
        else:
            remote_title = item.content.title or ""
            remote_desc = github_sync_service._extract_local_from_remote(item.content.body)
            remote_status = item.status_name or ""
            remote_updated_at_now = item.content.updated_at
    except GitHubNotFound:
        remote_deleted = True
    except GitHubError as e:
        log.warning("conflict_preview_remote_fetch_failed", error=str(e))

    snapshot = task.conflict_local_snapshot or {}
    return ConflictPreview(
        task_id=task.id,
        detected_at=task.conflict_detected_at,
        conflict_remote_updated_at=task.conflict_remote_updated_at,
        remote_updated_at_now=remote_updated_at_now,
        local_title=snapshot.get("title", task.title),
        local_description=snapshot.get("description", task.description),
        local_status=snapshot.get("status", task.status),
        remote_title=remote_title,
        remote_description=remote_desc,
        remote_status=remote_status,
        remote_deleted=remote_deleted,
    )


async def resolve(
    db: AsyncSession,
    *,
    task_id: uuid.UUID,
    strategy: str,
    actor_id: uuid.UUID,
    ip: str | None,
) -> Task:
    # Peek at the task to learn the project id, then take the project lock.
    peek = (
        await db.execute(select(Task.project_id).where(Task.id == task_id))
    ).scalar_one_or_none()
    if peek is None:
        raise NotFound("Task not found")
    await acquire_advisory_locks(db, f"github_project:{peek}")

    task = (
        await db.execute(
            select(Task).where(Task.id == task_id).with_for_update()
        )
    ).scalar_one_or_none()
    if task is None:
        raise NotFound("Task not found")
    if task.gh_item_node_id is None:
        raise Conflict("Task is not linked to GitHub")

    # Reject if a sync is in flight and the lease is fresh.
    if task.sync_state == SyncState.syncing:
        if task.sync_last_attempt_at is None or (
            datetime.now(timezone.utc) - task.sync_last_attempt_at < _LEASE_TIMEOUT
        ):
            raise Conflict(
                "A sync is currently running for this task. Try again shortly.",
                details={"code": "SYNC_IN_FLIGHT"},
            )

    if task.sync_state != SyncState.conflict:
        raise Conflict("Task is not in a conflicted state",
                       details={"code": "NOT_CONFLICTED", "state": task.sync_state.value})

    if strategy == "keep_mine":
        return await _keep_mine(db, task=task, actor_id=actor_id, ip=ip)
    if strategy == "use_github":
        return await _use_github(db, task=task, actor_id=actor_id, ip=ip)
    raise Conflict(f"Unknown strategy: {strategy}")


async def _keep_mine(
    db: AsyncSession, *, task: Task, actor_id: uuid.UUID, ip: str | None
) -> Task:
    client = get_client()

    # Revalidate remote against the value stored at conflict time.
    try:
        resp = await client.execute(
            GET_PROJECT_ITEM_BY_ID, {"itemId": task.gh_item_node_id}
        )
    except GitHubNotFound:
        raise Conflict(
            "The GitHub item no longer exists. Use 'Use GitHub' to abandon the local edit.",
            details={"code": "ITEM_DELETED"},
        )
    except GitHubError as e:
        raise Conflict(f"Could not revalidate remote state: {e}",
                       details={"code": "REVALIDATE_FAILED"}) from e

    item = parse_item(resp.data.get("node") or {})
    if item is None:
        raise Conflict("GitHub item no longer exists",
                       details={"code": "ITEM_DELETED"})
    if item.item_is_archived:
        raise Conflict("The GitHub item is archived. It cannot be updated.",
                       details={"code": "ITEM_ARCHIVED"})

    remote_now = item.content.updated_at
    if (
        task.conflict_remote_updated_at is not None
        and remote_now > task.conflict_remote_updated_at
    ):
        raise Conflict(
            "Remote changed again since the conflict was detected. Reopen the diff.",
            details={
                "code": "REMOTE_STILL_CHANGING",
                "conflict_at": task.conflict_remote_updated_at.isoformat(),
                "remote_now": remote_now.isoformat(),
            },
        )

    # Validation passed. Lease and force-push.
    task.sync_state = SyncState.syncing
    task.sync_last_attempt_at = datetime.now(timezone.utc)
    task.sync_attempts = (task.sync_attempts or 0) + 1
    await db.flush()

    # Snapshot the pre-resolution snapshot for audit (in case push_task clears it).
    pre_snapshot = task.conflict_local_snapshot

    result = await github_sync_service.push_task(
        db, task=task, trigger=SyncTrigger.user_edit, force=True
    )

    # If push_task requeued for a mid-flight edit, leave it pending and don't
    # declare resolution complete.
    resolved = result.status == SyncStatus.success and not result.requeued_for_edit

    await audit_service.record(
        db,
        actor_user_id=actor_id,
        action="github.conflict.resolve",
        entity="task",
        entity_id=task.id,
        before={"snapshot": pre_snapshot, "remote_at_conflict": (
            task.conflict_remote_updated_at.isoformat()
            if task.conflict_remote_updated_at else None
        )},
        after={
            "strategy": "keep_mine",
            "push_status": result.status.value,
            "resolved": resolved,
        },
        ip=ip,
    )
    db.add(
        SyncLog(
            direction=SyncDirection.push,
            entity=SyncEntity.task,
            entity_id=task.id,
            gh_node_id=task.gh_item_node_id,
            trigger=SyncTrigger.user_edit,
            status=SyncStatus.success if resolved else SyncStatus.skipped,
            response_payload={"resolution": "keep_mine", "push_status": result.status.value},
        )
    )
    return task


async def _use_github(
    db: AsyncSession, *, task: Task, actor_id: uuid.UUID, ip: str | None
) -> Task:
    client = get_client()
    try:
        resp = await client.execute(
            GET_PROJECT_ITEM_BY_ID, {"itemId": task.gh_item_node_id}
        )
    except GitHubNotFound:
        raise Conflict(
            "The GitHub item no longer exists. Mark it inactive manually.",
            details={"code": "ITEM_DELETED"},
        )
    except GitHubError as e:
        raise Conflict(f"Could not fetch remote state: {e}",
                       details={"code": "FETCH_FAILED"}) from e

    item = parse_item(resp.data.get("node") or {})
    if item is None:
        raise Conflict("GitHub item not found", details={"code": "ITEM_DELETED"})

    before = {
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "sync_state": task.sync_state.value,
    }
    task.title = item.content.title or task.title
    task.description = github_sync_service._extract_local_from_remote(item.content.body)
    task.status = item.status_name or task.status
    task.gh_updated_at = item.content.updated_at
    task.sync_state = SyncState.synced
    task.sync_attempts = 0
    task.local_updated_at = datetime.now(timezone.utc)
    github_sync_service._clear_conflict(task)
    await db.flush()

    await audit_service.record(
        db,
        actor_user_id=actor_id,
        action="github.conflict.resolve",
        entity="task",
        entity_id=task.id,
        before=before,
        after={
            "title": task.title,
            "description": task.description,
            "status": task.status,
            "strategy": "use_github",
        },
        ip=ip,
    )
    db.add(
        SyncLog(
            direction=SyncDirection.pull,
            entity=SyncEntity.task,
            entity_id=task.id,
            gh_node_id=task.gh_item_node_id,
            trigger=SyncTrigger.user_edit,
            status=SyncStatus.success,
            response_payload={"resolution": "use_github"},
        )
    )
    return task