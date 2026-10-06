from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.pagination import Pagination, pagination_params
from app.api.dependencies.rate_limit import rate_limit
from app.core.database import get_db
from app.core.exceptions import Forbidden
from app.core.idempotency import idempotent_call
from app.core.permissions import CurrentUser
from app.models.enums import TimeEntryStatus
from app.schemas.common import OkResponse, PaginatedResponse, PaginationMeta
from app.schemas.time_entry import (
    CodeLinkPreviewOut,
    TimeEntryCreate,
    TimeEntryOut,
    TimeEntryTransitionIn,
    TimeEntryUpdate,
)
from app.services import (
    authorization_service,
    code_link_service,
    time_entry_service,
)
from app.utils.github_url_parser import looks_like_github, parse_github_url

router = APIRouter(prefix="/time-entries", tags=["time-entries"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


async def _authorize_view(
    db: AsyncSession,
    actor: CurrentUser,
    entry_id: uuid.UUID,
):
    entry = await time_entry_service.get_entry_or_404(db, entry_id)
    await authorization_service.require_resource_owner(
        db,
        actor,
        owner_id=entry.user_id,
    )
    return entry


@router.get("/preview-link", response_model=CodeLinkPreviewOut)
async def preview_link(
    url: str = Query(min_length=1, max_length=2000),
    _: CurrentUser = Depends(get_current_user),
) -> CodeLinkPreviewOut:
    is_gh = looks_like_github(url)
    parsed = parse_github_url(url) if is_gh else None

    return CodeLinkPreviewOut(
        url=url,
        link_type=(parsed.link_type if parsed else "other"),
        repo=(parsed.repo if parsed else None),
        ref=(parsed.ref if parsed else None),
        number=(parsed.number if parsed else None),
        is_github=is_gh,
    )


@router.get("", response_model=PaginatedResponse[TimeEntryOut])
async def list_my_entries(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    pagination: Pagination = Depends(pagination_params),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    task_id: uuid.UUID | None = Query(default=None),
    status: TimeEntryStatus | None = Query(default=None),
    billable: bool | None = Query(default=None),
) -> PaginatedResponse[TimeEntryOut]:
    rows, total = await time_entry_service.list_entries(
        db,
        user_id=user.id,
        from_date=from_date,
        to_date=to_date,
        project_id=project_id,
        task_id=task_id,
        status=status,
        billable=billable,
        offset=pagination.offset,
        limit=pagination.limit,
    )

    return PaginatedResponse[TimeEntryOut](
        data=[TimeEntryOut.model_validate(r) for r in rows],
        pagination=PaginationMeta(
            page=pagination.page,
            page_size=pagination.page_size,
            total=total,
            has_next=pagination.offset + len(rows) < total,
        ),
    )


@router.get("/{entry_id}", response_model=TimeEntryOut)
async def get_entry(
    entry_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryOut:
    entry = await _authorize_view(db, user, entry_id)
    return TimeEntryOut.model_validate(entry)


@router.post(
    "",
    response_model=TimeEntryOut,
    dependencies=[Depends(rate_limit("time_entry.create"))],
)
async def create_entry(
    payload: TimeEntryCreate,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryOut:

    async def _do() -> TimeEntryOut:
        result = await time_entry_service.create_entry(
            db,
            actor_id=user.id,
            project_id=payload.project_id,
            task_id=payload.task_id,
            description=payload.description,
            started_at=payload.started_at,
            ended_at=payload.ended_at,
            duration_minutes=payload.duration_minutes,
            billable=payload.billable,
            work_date=payload.work_date,
            code_links=[
                link.model_dump()
                for link in payload.code_links
            ],
            client_idempotency_key=payload.client_idempotency_key,
            ip=_ip(request),
        )

        return TimeEntryOut.model_validate(result.entry)

    return await idempotent_call(
        db,
        request=request,
        scope="time_entry.create",
        handler=_do,
    )


@router.patch(
    "/{entry_id}",
    response_model=TimeEntryOut,
    dependencies=[Depends(rate_limit("time_entry.update"))],
)
async def update_entry(
    entry_id: uuid.UUID,
    payload: TimeEntryUpdate,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryOut:
    fields = payload.model_dump(
        exclude_unset=True,
        exclude={"expected_version"},
    )

    if fields.get("code_links") is not None:
        fields["code_links"] = [
            {
                "url": link["url"],
                "note": link.get("note"),
            }
            for link in fields["code_links"]
        ]

    entry = await time_entry_service.update_entry(
        db,
        entry_id=entry_id,
        actor_id=user.id,
        is_admin=user.is_admin,
        expected_version=payload.expected_version,
        fields=fields,
        ip=_ip(request),
    )

    return TimeEntryOut.model_validate(entry)


@router.delete(
    "/{entry_id}",
    response_model=OkResponse,
    dependencies=[Depends(rate_limit("time_entry.delete"))],
)
async def delete_entry(
    entry_id: uuid.UUID,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    await time_entry_service.delete_entry(
        db,
        entry_id=entry_id,
        actor_id=user.id,
        is_admin=user.is_admin,
        ip=_ip(request),
    )

    return OkResponse(ok=True)


@router.post(
    "/{entry_id}/submit",
    response_model=TimeEntryOut,
    dependencies=[Depends(rate_limit("time_entry.transition"))],
)
async def submit_entry(
    entry_id: uuid.UUID,
    payload: TimeEntryTransitionIn,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryOut:
    entry = await time_entry_service.transition_entry(
        db,
        entry_id=entry_id,
        actor_id=user.id,
        is_manager=user.is_manager,
        is_admin=user.is_admin,
        target=TimeEntryStatus.submitted,
        expected_version=payload.expected_version,
        comment=payload.comment,
        ip=_ip(request),
    )

    return TimeEntryOut.model_validate(entry)


@router.post(
    "/{entry_id}/approve",
    response_model=TimeEntryOut,
    dependencies=[Depends(rate_limit("time_entry.transition"))],
)
async def approve_entry(
    entry_id: uuid.UUID,
    payload: TimeEntryTransitionIn,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryOut:
    if not user.is_manager:
        raise Forbidden("Only managers can approve time entries")

    entry = await time_entry_service.transition_entry(
        db,
        entry_id=entry_id,
        actor_id=user.id,
        is_manager=True,
        is_admin=user.is_admin,
        target=TimeEntryStatus.approved,
        expected_version=payload.expected_version,
        comment=payload.comment,
        ip=_ip(request),
    )

    return TimeEntryOut.model_validate(entry)


@router.post(
    "/{entry_id}/reject",
    response_model=TimeEntryOut,
    dependencies=[Depends(rate_limit("time_entry.transition"))],
)
async def reject_entry(
    entry_id: uuid.UUID,
    payload: TimeEntryTransitionIn,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryOut:
    if not user.is_manager:
        raise Forbidden("Only managers can reject time entries")

    entry = await time_entry_service.transition_entry(
        db,
        entry_id=entry_id,
        actor_id=user.id,
        is_manager=True,
        is_admin=user.is_admin,
        target=TimeEntryStatus.rejected,
        expected_version=payload.expected_version,
        comment=payload.comment,
        ip=_ip(request),
    )

    return TimeEntryOut.model_validate(entry)


@router.post(
    "/{entry_id}/reopen",
    response_model=TimeEntryOut,
    dependencies=[Depends(rate_limit("time_entry.transition"))],
)
async def reopen_entry(
    entry_id: uuid.UUID,
    payload: TimeEntryTransitionIn,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryOut:
    entry = await time_entry_service.transition_entry(
        db,
        entry_id=entry_id,
        actor_id=user.id,
        is_manager=user.is_manager,
        is_admin=user.is_admin,
        target=TimeEntryStatus.draft,
        expected_version=payload.expected_version,
        comment=payload.comment,
        ip=_ip(request),
    )

    return TimeEntryOut.model_validate(entry)