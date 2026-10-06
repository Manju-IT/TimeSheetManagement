from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import Conflict, NotFound
from app.models.enums import ProjectSource
from app.models.project import Project


async def get_project(db: AsyncSession, project_id: uuid.UUID) -> Project | None:
    return (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()


async def get_project_or_404(db: AsyncSession, project_id: uuid.UUID) -> Project:
    p = await get_project(db, project_id)
    if p is None:
        raise NotFound("Project not found")
    return p


async def list_projects(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    active_only: bool = True,
    offset: int = 0,
    limit: int = 25,
) -> tuple[list[Project], int]:
    base = select(Project).where(Project.org_id == org_id)
    count = select(func.count(Project.id)).where(Project.org_id == org_id)
    if active_only:
        base = base.where(Project.is_active.is_(True))
        count = count.where(Project.is_active.is_(True))
    total = (await db.execute(count)).scalar_one()
    rows = list(
        (
            await db.execute(
                base.order_by(Project.is_active.desc(), Project.name.asc())
                .offset(offset)
                .limit(limit)
            )
        ).scalars()
    )
    return rows, total


async def create_project(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    name: str,
    code: str | None,
    source: ProjectSource = ProjectSource.manual,
) -> Project:
    existing = (
        await db.execute(select(Project).where(Project.org_id == org_id, Project.name == name))
    ).scalar_one_or_none()
    if existing is not None:
        raise Conflict(f"A project named '{name}' already exists in this organization")
    project = Project(org_id=org_id, name=name, code=code, source=source, is_active=True)
    db.add(project)
    await db.flush()
    return project


async def update_project(
    db: AsyncSession,
    project: Project,
    *,
    name: str | None = None,
    code: str | None = None,
    is_active: bool | None = None,
) -> Project:
    if name is not None and name != project.name:
        dup = (
            await db.execute(
                select(Project).where(
                    Project.org_id == project.org_id,
                    Project.name == name,
                    Project.id != project.id,
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise Conflict(f"A project named '{name}' already exists in this organization")
        project.name = name
    if code is not None:
        project.code = code
    if is_active is not None:
        project.is_active = is_active
    await db.flush()
    return project