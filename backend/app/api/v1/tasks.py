from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.exceptions import NotFound
from app.core.permissions import CurrentUser
from app.models.enums import TaskSource
from app.models.project import Project
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    project_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    assignee_id: uuid.UUID | None = Query(None),
    _: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TaskOut]:
    stmt = select(Task).where(Task.is_active.is_(True))
    if project_id:
        stmt = stmt.where(Task.project_id == project_id)
    if status_filter:
        stmt = stmt.where(Task.status == status_filter)
    if assignee_id:
        stmt = stmt.where(Task.assignee_user_id == assignee_id)

    stmt = stmt.order_by(Task.created_at.desc())
    tasks = (await db.execute(stmt)).scalars().all()
    return [TaskOut.model_validate(t) for t in tasks]


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    _: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    project = await db.get(Project, payload.project_id)
    if not project:
        raise NotFound(message="Project not found")

    task = Task(
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        assignee_user_id=payload.assignee_user_id,
        source=TaskSource.manual,
        is_active=True,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return TaskOut.model_validate(task)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    _: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    task = await db.get(Task, task_id)
    if not task:
        raise NotFound(message="Task not found")

    if payload.title is not None:
        task.title = payload.title
    if payload.description is not None:
        task.description = payload.description
    if payload.status is not None:
        task.status = payload.status
    if payload.assignee_user_id is not None:
        task.assignee_user_id = payload.assignee_user_id
    if payload.is_active is not None:
        task.is_active = payload.is_active

    await db.commit()
    await db.refresh(task)
    return TaskOut.model_validate(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    _: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    task = await db.get(Task, task_id)
    if not task:
        raise NotFound(message="Task not found")

    task.is_active = False
    await db.commit()
