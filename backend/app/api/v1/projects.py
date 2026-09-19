from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.models.enums import ProjectSource
from app.models.project import Project
from app.models.user import AppUser
from app.schemas.project import ProjectCreate, ProjectOut

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectOut]:
    app_user = await db.get(AppUser, user.id)
    if not app_user:
        return []

    stmt = (
        select(Project)
        .where(Project.org_id == app_user.org_id, Project.is_active.is_(True))
        .order_by(Project.name.asc())
    )
    projects = (await db.execute(stmt)).scalars().all()
    return [ProjectOut.model_validate(p) for p in projects]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectOut:
    if not user.is_manager and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers or administrators can create projects.",
        )

    app_user = await db.get(AppUser, user.id)
    if not app_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    project = Project(
        org_id=app_user.org_id,
        name=payload.name,
        code=payload.code,
        source=ProjectSource.manual,
        is_active=True,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectOut.model_validate(project)
