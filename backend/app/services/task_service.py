from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


from app.core.exceptions import Conflict, NotFound, OptimisticConcurrencyError
from app.models.enums import SyncState, TaskSource
from app.models.project import Project
from app.models.task import Task
from app.models.user import AppUser


async def get_task(db: AsyncSession, task_id: uuid.UUID) -> Task | None:
    return (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()


async def get_task_or_404(db: AsyncSession, task_id: uuid.UUID) -> Task:
    t = await get_task(db, task_id)
    if t is None:
        raise NotFound("Task not found")
    return t


async def list_tasks(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    project_id: uuid.UUID | None = None,
    assignee_user_id: uuid.UUID | None = None,
    status: str | None = None,
    sync_state: SyncState | None = None,
    include_inactive: bool = False,
    offset: int = 0,
    limit: int = 25,
) -> tuple[list[Task], int]:
    base = select(Task).join(Project, Project.id == Task.project_id).where(Project.org_id == org_id)
    count = (
        select(func.count(Task.id))
        .join(Project, Project.id == Task.project_id)
        .where(Project.org_id == org_id)
    )
    if project_id is not None:
        base = base.where(Task.project_id == project_id)
        count = count.where(Task.project_id == project_id)
    if assignee_user_id is not None:
        base = base.where(Task.assignee_user_id == assignee_user_id)
        count = count.where(Task.assignee_user_id == assignee_user_id)
    if status is not None:
        base = base.where(Task.status == status)
        count = count.where(Task.status == status)
    if sync_state is not None:
        base = base.where(Task.sync_state == sync_state)
        count = count.where(Task.sync_state == sync_state)
    if not include_inactive:
        base = base.where(Task.is_active.is_(True))
        count = count.where(Task.is_active.is_(True))
    total = (await db.execute(count)).scalar_one()
    rows = list(
        (
            await db.execute(
                base.order_by(Task.updated_at.desc()).offset(offset).limit(limit)
            )
        ).scalars()
    )
    return rows, total


async def create_task(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    title: str,
    description: str,
    status: str,
    assignee_user_id: uuid.UUID | None,
) -> Task:
    project = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if project is None:
        raise NotFound("Project not found")
    if assignee_user_id is not None:
        assignee = (
            await db.execute(select(AppUser).where(AppUser.id == assignee_user_id))
        ).scalar_one_or_none()
        if assignee is None or assignee.org_id != project.org_id:
            raise Conflict("Assignee is not a member of this organization")
    now = datetime.now(timezone.utc)
    task = Task(
        project_id=project_id,
        title=title,
        description=description,
        status=status,
        assignee_user_id=assignee_user_id,
        source=TaskSource.manual,
        local_updated_at=now,
        sync_state=SyncState.synced,
        is_active=True,
    )
    db.add(task)
    await db.flush()
    return task

async def update_task(
    db: AsyncSession,
    task: Task,
    *,
    expected_updated_at: datetime | None,
    title: str | None,
    description: str | None,
    status: str | None,
    assignee_user_id: uuid.UUID | None,
    set_assignee: bool,
    is_active: bool | None,
) -> Task:
    # Re-read under a write lock so two concurrent editors serialize.
    locked = (
        await db.execute(select(Task).where(Task.id == task.id).with_for_update())
    ).scalar_one()

    if expected_updated_at is not None and locked.updated_at != expected_updated_at:
        raise OptimisticConcurrencyError(
            "This task was modified by another session",
            details={
                "expected": expected_updated_at.isoformat(),
                "actual": locked.updated_at.isoformat(),
            },
        )

    if title is not None:
        locked.title = title
    if description is not None:
        locked.description = description
        if locked.source.value == "github":
            locked.sync_state = SyncState.pending_push
    if status is not None:
        locked.status = status
    if set_assignee:
        if assignee_user_id is not None:
            project = (
                await db.execute(select(Project).where(Project.id == locked.project_id))
            ).scalar_one()
            assignee = (
                await db.execute(select(AppUser).where(AppUser.id == assignee_user_id))
            ).scalar_one_or_none()
            if assignee is None or assignee.org_id != project.org_id:
                raise Conflict("Assignee is not a member of this organization")
        locked.assignee_user_id = assignee_user_id
    if is_active is not None:
        locked.is_active = is_active

    locked.local_updated_at = datetime.now(timezone.utc)
    await db.flush()
    return locked


async def claim_for_sync(
    db: AsyncSession, *, task_ids: list[uuid.UUID] | None = None, batch: int = 20
) -> list[Task]:
    """Claim up to `batch` tasks for GitHub push.

    Phase 7's worker calls this. `FOR UPDATE SKIP LOCKED` guarantees two workers
    never process the same task. The transaction that calls this must set the
    claimed tasks' `sync_state = pending_push` (or remove them from the queue)
    before committing, otherwise the lock is released on commit and another
    worker can grab them. The pattern is:
        1. BEGIN
        2. SELECT ... FOR UPDATE SKIP LOCKED    (this function)
        3. UPDATE tasks SET sync_state = 'pending_push' WHERE id IN (...)
        4. COMMIT
        5. Do the GitHub I/O outside the transaction, in a separate transaction
           set sync_state to 'synced' | 'conflict' | 'error'.
    """
    stmt = (
        select(Task)
        .where(
            Task.source == TaskSource.github,
            Task.gh_item_node_id.is_not(None),
            Task.sync_state.in_([SyncState.pending_push, SyncState.error]),
        )
        .order_by(Task.local_updated_at.asc())
        .limit(batch)
        .with_for_update(skip_locked=True)
    )
    if task_ids is not None:
        stmt = stmt.where(Task.id.in_(task_ids))
    return list((await db.execute(stmt)).scalars())