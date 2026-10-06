from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_admin
from app.api.dependencies.pagination import Pagination, pagination_params
from app.api.dependencies.rate_limit import rate_limit
from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import Conflict
from app.core.idempotency import idempotent_call
from app.core.locks import acquire_advisory_locks
from app.core.permissions import CurrentUser
from app.core.redis import get_redis
from app.models.enums import SyncStatus, SyncTrigger
from app.models.sync_log import SyncLog
from app.schemas.common import OkResponse, PaginatedResponse, PaginationMeta
from app.schemas.github import (
    ConnectionTestOut,
    LinkProjectRequest,
    ProjectLinkOut,
    SyncLogOut,
)
from app.services import audit_service, github_service, github_sync_service

router = APIRouter(
    prefix="/github",
    tags=["admin:github"],
)


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get(
    "/connection",
    response_model=ConnectionTestOut,
    dependencies=[Depends(rate_limit("admin.read"))],
)
async def connection(
    _: CurrentUser = Depends(require_admin),
) -> ConnectionTestOut:
    ok, viewer, err = await github_service.test_connection()

    return ConnectionTestOut(
        ok=ok,
        viewer_login=viewer,
        mode=settings.GITHUB_AUTH_MODE,
        error=err,
    )


@router.get(
    "/links",
    response_model=list[ProjectLinkOut],
    dependencies=[Depends(rate_limit("admin.read"))],
)
async def list_links(
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectLinkOut]:
    links = await github_service.list_links(
        db,
        actor.org_id,
    )

    return [
        ProjectLinkOut.model_validate(link)
        for link in links
    ]


@router.post(
    "/links",
    response_model=ProjectLinkOut,
    dependencies=[Depends(rate_limit("admin.write"))],
)
async def link_project(
    payload: LinkProjectRequest,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ProjectLinkOut:
    link = await github_service.link_project(
        db,
        org_id=actor.org_id,
        project_id=payload.project_id,
        gh_owner=payload.gh_owner,
        gh_project_number=payload.gh_project_number,
        default_repo=payload.default_repo,
        owner_type=payload.owner_type,
    )

    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="github.link.create",
        entity="github_project_link",
        entity_id=link.id,
        after={
            "gh_owner": link.gh_owner,
            "gh_project_number": link.gh_project_number,
            "project_id": str(link.project_id),
        },
        ip=_ip(request),
    )

    return ProjectLinkOut.model_validate(link)


@router.delete(
    "/links/{link_id}",
    response_model=OkResponse,
    dependencies=[Depends(rate_limit("admin.write"))],
)
async def unlink_project(
    link_id: uuid.UUID,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    await github_service.unlink_project(
        db,
        org_id=actor.org_id,
        link_id=link_id,
    )

    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="github.link.delete",
        entity="github_project_link",
        entity_id=link_id,
        ip=_ip(request),
    )

    return OkResponse(ok=True)


@router.post(
    "/links/{link_id}/sync",
    response_model=OkResponse,
    dependencies=[Depends(rate_limit("github.manual_sync"))],
)
async def manual_sync(
    link_id: uuid.UUID,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    async def _do() -> OkResponse:
        link = await github_service.get_link_or_404(
            db,
            link_id,
        )

        await acquire_advisory_locks(
            db,
            f"github_project:{link.id}",
        )

        await github_sync_service.pull_project(
            db,
            link=link,
            trigger=SyncTrigger.manual,
        )

        await audit_service.record(
            db,
            actor_user_id=actor.id,
            action="github.sync.manual",
            entity="github_project_link",
            entity_id=link.id,
            ip=_ip(request),
        )

        return OkResponse(ok=True)

    return await idempotent_call(
        db,
        request=request,
        scope="github.manual_sync",
        handler=_do,
    )


@router.post(
    "/full-resync",
    response_model=OkResponse,
    dependencies=[Depends(rate_limit("github.full_resync"))],
)
async def full_resync(
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    async def _do() -> OkResponse:
        redis = get_redis()

        got = await redis.set(
            "github:full_resync",
            str(actor.id),
            nx=True,
            ex=900,
        )

        if not got:
            raise Conflict(
                "A full resync is already in progress"
            )

        try:
            links = await github_service.list_links(
                db,
                actor.org_id,
            )

            for link in links:
                await acquire_advisory_locks(
                    db,
                    f"github_project:{link.id}",
                )

                await github_sync_service.pull_project(
                    db,
                    link=link,
                    trigger=SyncTrigger.manual,
                )

            await audit_service.record(
                db,
                actor_user_id=actor.id,
                action="github.full_resync",
                entity="organization",
                entity_id=actor.org_id,
                after={"links": len(links)},
                ip=_ip(request),
            )

        finally:
            await redis.delete("github:full_resync")

        return OkResponse(ok=True)

    return await idempotent_call(
        db,
        request=request,
        scope="github.full_resync",
        handler=_do,
    )


@router.get(
    "/sync-logs",
    response_model=PaginatedResponse[SyncLogOut],
    dependencies=[Depends(rate_limit("admin.read"))],
)
async def sync_logs(
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    pagination: Pagination = Depends(pagination_params),
    status: SyncStatus | None = Query(default=None),
) -> PaginatedResponse[SyncLogOut]:
    base = select(SyncLog)
    count_stmt = select(SyncLog.id)

    if status is not None:
        base = base.where(
            SyncLog.status == status
        )
        count_stmt = count_stmt.where(
            SyncLog.status == status
        )

    total = (
        await db.execute(
            select(func.count()).select_from(
                count_stmt.subquery()
            )
        )
    ).scalar_one()

    rows = list(
        (
            await db.execute(
                base.order_by(
                    desc(SyncLog.created_at)
                )
                .offset(pagination.offset)
                .limit(pagination.limit)
            )
        ).scalars()
    )

    return PaginatedResponse[SyncLogOut](
        data=[
            SyncLogOut.model_validate(row)
            for row in rows
        ],
        pagination=PaginationMeta(
            page=pagination.page,
            page_size=pagination.page_size,
            total=total,
            has_next=(
                pagination.offset + len(rows)
                < total
            ),
        ),
    )