from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user, require_manager
from app.api.dependencies.pagination import Pagination, pagination_params
from app.core.database import get_db
from app.core.exceptions import Forbidden
from app.core.permissions import CurrentUser
from app.schemas.common import OkResponse, PaginatedResponse, PaginationMeta
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate
from app.services import audit_service, project_service

router = APIRouter(prefix="/projects", tags=["projects"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("", response_model=PaginatedResponse[ProjectOut])
async def list_projects(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    pagination: Pagination = Depends(pagination_params),
    active_only: bool = Query(default=True),
) -> PaginatedResponse[ProjectOut]:
    rows, total = await project_service.list_projects(
        db,
        org_id=user.org_id,
        active_only=active_only,
        offset=pagination.offset,
        limit=pagination.limit,
    )
    return PaginatedResponse[ProjectOut](
        data=[ProjectOut.model_validate(p) for p in rows],
        pagination=PaginationMeta(
            page=pagination.page,
            page_size=pagination.page_size,
            total=total,
            has_next=pagination.offset + len(rows) < total,
        ),
    )


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectOut:
    project = await project_service.get_project_or_404(db, project_id)
    if project.org_id != user.org_id:
        raise Forbidden("Project belongs to a different organization")
    return ProjectOut.model_validate(project)


@router.post("", response_model=ProjectOut)
async def create_project(
    payload: ProjectCreate,
    request: Request,
    actor: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
) -> ProjectOut:
    project = await project_service.create_project(
        db, org_id=actor.org_id, name=payload.name, code=payload.code
    )
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="project.create",
        entity="project",
        entity_id=project.id,
        after={"name": project.name, "code": project.code},
        ip=_ip(request),
    )
    return ProjectOut.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    request: Request,
    actor: CurrentUser = Depends(require_manager),
    db: AsyncSession = Depends(get_db),
) -> ProjectOut:
    project = await project_service.get_project_or_404(db, project_id)
    if project.org_id != actor.org_id:
        raise Forbidden("Project belongs to a different organization")
    before = {"name": project.name, "code": project.code, "is_active": project.is_active}
    project = await project_service.update_project(
        db,
        project,
        name=payload.name,
        code=payload.code,
        is_active=payload.is_active,
    )
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="project.update",
        entity="project",
        entity_id=project.id,
        before=before,
        after={"name": project.name, "code": project.code, "is_active": project.is_active},
        ip=_ip(request),
    )
    return ProjectOut.model_validate(project)