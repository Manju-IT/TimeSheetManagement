"""Background worker for GitHub pull and push.

Serialization rules:
  - Project pulls take an advisory lock per project (`github_project:<id>`), so
    scheduled, webhook, and manual sync cannot interleave.
  - Pushes claim tasks with `FOR UPDATE SKIP LOCKED` + lease; the row-level
    lock is only held for the claim commit and the final commit; GitHub I/O
    happens outside any open transaction.
  - Stale leases (>5 min) are reclaimable.
  - Tasks with terminal error codes (ITEM_DELETED, ITEM_ARCHIVED) are not
    re-claimed automatically; they require a manual retry from the UI.
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.locks import acquire_advisory_locks
from app.core.logging import get_logger
from app.models.enums import SyncState, SyncTrigger
from app.models.github_project_link import GitHubProjectLink
from app.models.task import Task
from app.services import github_sync_service
from app.models.enums import SyncState, SyncTrigger, TaskSource

log = get_logger("app.worker.github")

_PUSH_TICK_SECONDS = 15
_PULL_TICK_SECONDS = 60
_BATCH = 10
_LEASE_TIMEOUT = timedelta(minutes=5)
_MAX_ATTEMPTS = 5
_TERMINAL_CODES = github_sync_service.TERMINAL_ERROR_CODES


async def _claim_pushable() -> list[str]:
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        stale_cutoff = now - _LEASE_TIMEOUT

        stmt = (
            select(Task)
            .where(
                Task.source == TaskSource.github,
                Task.gh_item_node_id.is_not(None),
                or_(
                    # Normal queue
                    Task.sync_state == SyncState.pending_push,
                    # Retryable errors only, under attempt ceiling
                    and_(
                        Task.sync_state == SyncState.error,
                        Task.sync_attempts < _MAX_ATTEMPTS,
                        or_(
                            Task.sync_last_error_code.is_(None),
                            Task.sync_last_error_code.notin_(_TERMINAL_CODES),
                        ),
                    ),
                    # Stale leases
                    and_(
                        Task.sync_state == SyncState.syncing,
                        or_(
                            Task.sync_last_attempt_at.is_(None),
                            Task.sync_last_attempt_at < stale_cutoff,
                        ),
                    ),
                ),
            )
            .order_by(Task.local_updated_at.asc())
            .limit(_BATCH)
            .with_for_update(skip_locked=True)
        )
        tasks = list((await db.execute(stmt)).scalars())
        for t in tasks:
            t.sync_state = SyncState.syncing
            t.sync_last_attempt_at = now
            t.sync_attempts = (t.sync_attempts or 0) + 1
        ids = [str(t.id) for t in tasks]
        await db.commit()
        return ids


async def _process_push(task_id: str) -> None:
    async with AsyncSessionLocal() as db:
        # Project lock so pulls on the same project serialize.
        project_id = (
            await db.execute(select(Task.project_id).where(Task.id == task_id))
        ).scalar_one_or_none()
        if project_id is None:
            return
        await acquire_advisory_locks(db, f"github_project:{project_id}")

        task = (
            await db.execute(
                select(Task).where(Task.id == task_id).with_for_update()
            )
        ).scalar_one_or_none()
        if task is None or task.sync_state != SyncState.syncing:
            return
        try:
            await github_sync_service.push_task(
                db, task=task, trigger=SyncTrigger.schedule
            )
        except Exception:
            log.exception("push_task_failed", task_id=task_id)
            task.sync_state = SyncState.error
            task.sync_last_attempt_at = datetime.now(timezone.utc)
            task.sync_last_error_code = "WORKER_EXCEPTION"
        await db.commit()


async def _schedule_pulls() -> None:
    async with AsyncSessionLocal() as db:
        cutoff = datetime.now(timezone.utc) - timedelta(
            seconds=settings.GITHUB_SYNC_INTERVAL_SECONDS
        )
        links = list(
            (
                await db.execute(
                    select(GitHubProjectLink)
                    .where(
                        (GitHubProjectLink.last_synced_at.is_(None))
                        | (GitHubProjectLink.last_synced_at < cutoff)
                    )
                    .limit(5)
                )
            ).scalars()
        )
    for link in links:
        asyncio.create_task(_run_pull(link.id))


async def _run_pull(link_id) -> None:  # noqa: ANN001
    async with AsyncSessionLocal() as db:
        await acquire_advisory_locks(db, f"github_project:{link_id}")
        link = (
            await db.execute(
                select(GitHubProjectLink).where(GitHubProjectLink.id == link_id)
            )
        ).scalar_one_or_none()
        if link is None:
            return
        try:
            await github_sync_service.pull_project(
                db, link=link, trigger=SyncTrigger.schedule
            )
            await db.commit()
        except Exception:
            log.exception("pull_project_failed", link_id=str(link_id))
            await db.rollback()


async def run_forever() -> None:
    log.info("github_sync_worker_started")
    push_interval = _PUSH_TICK_SECONDS
    pull_interval = _PULL_TICK_SECONDS
    last_pull = 0.0

    while True:
        try:
            ids = await _claim_pushable()
            for tid in ids:
                asyncio.create_task(_process_push(tid))

            now = time.monotonic()
            if now - last_pull >= pull_interval:
                last_pull = now
                asyncio.create_task(_schedule_pulls())
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("github_worker_tick_failed")
        await asyncio.sleep(push_interval)