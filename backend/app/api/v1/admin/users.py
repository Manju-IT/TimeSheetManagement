from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_admin
from app.api.dependencies.pagination import Pagination, pagination_params
from app.core.database import get_db
from app.core.exceptions import Conflict, NotFound
from app.core.permissions import CurrentUser
from app.models.enums import Role, UserStatus
from app.models.user import AppUser, UserRole
from app.schemas.admin import AdminUserOut, AdminUserPatch, RoleChangeRequest
from app.schemas.common import OkResponse, PaginatedResponse, PaginationMeta
from app.services import audit_service

router = APIRouter(prefix="/users", tags=["admin:users"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


async def _load_roles(db: AsyncSession, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[Role]]:
    if not user_ids:
        return {}
    rows = (
        await db.execute(
            select(UserRole.user_id, UserRole.role).where(UserRole.user_id.in_(user_ids))
        )
    ).all()
    result: dict[uuid.UUID, list[Role]] = {uid: [] for uid in user_ids}
    for uid, role in rows:
        result.setdefault(uid, []).append(role)
    return result


def _to_out(user: AppUser, roles: list[Role]) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        status=user.status,
        timezone=user.timezone,
        github_login=user.github_login,
        roles=sorted(set(roles), key=lambda r: r.value),
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("", response_model=PaginatedResponse[AdminUserOut])
async def list_users(
    _: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    pagination: Pagination = Depends(pagination_params),
    q: str | None = Query(default=None, max_length=200),
    status: UserStatus | None = Query(default=None),
) -> PaginatedResponse[AdminUserOut]:
    base = select(AppUser)
    count_stmt = select(func.count(AppUser.id))
    if q:
        like = f"%{q.lower()}%"
        base = base.where(
            func.lower(AppUser.email).like(like) | func.lower(AppUser.full_name).like(like)
        )
        count_stmt = count_stmt.where(
            func.lower(AppUser.email).like(like) | func.lower(AppUser.full_name).like(like)
        )
    if status is not None:
        base = base.where(AppUser.status == status)
        count_stmt = count_stmt.where(AppUser.status == status)

    total = (await db.execute(count_stmt)).scalar_one()
    users = list(
        (
            await db.execute(
                base.order_by(AppUser.email.asc())
                .offset(pagination.offset)
                .limit(pagination.limit)
            )
        ).scalars()
    )
    roles_map = await _load_roles(db, [u.id for u in users])
    return PaginatedResponse[AdminUserOut](
        data=[_to_out(u, roles_map.get(u.id, [])) for u in users],
        pagination=PaginationMeta(
            page=pagination.page,
            page_size=pagination.page_size,
            total=total,
            has_next=pagination.offset + len(users) < total,
        ),
    )


@router.get("/{user_id}", response_model=AdminUserOut)
async def get_user(
    user_id: uuid.UUID,
    _: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserOut:
    user = (await db.execute(select(AppUser).where(AppUser.id == user_id))).scalar_one_or_none()
    if user is None:
        raise NotFound("User not found")
    roles_map = await _load_roles(db, [user.id])
    return _to_out(user, roles_map.get(user.id, []))


@router.patch("/{user_id}", response_model=AdminUserOut)
async def patch_user(
    user_id: uuid.UUID,
    payload: AdminUserPatch,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserOut:
    user = (await db.execute(select(AppUser).where(AppUser.id == user_id))).scalar_one_or_none()
    if user is None:
        raise NotFound("User not found")

    before = {
        "full_name": user.full_name,
        "status": user.status.value,
        "timezone": user.timezone,
        "github_login": user.github_login,
    }
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.status is not None:
        user.status = payload.status
    if payload.timezone is not None:
        user.timezone = payload.timezone
    if payload.github_login is not None:
        user.github_login = payload.github_login
    await db.flush()

    after = {
        "full_name": user.full_name,
        "status": user.status.value,
        "timezone": user.timezone,
        "github_login": user.github_login,
    }
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="admin.user.update",
        entity="app_user",
        entity_id=user.id,
        before=before,
        after=after,
        ip=_client_ip(request),
    )
    roles_map = await _load_roles(db, [user.id])
    return _to_out(user, roles_map.get(user.id, []))


@router.post("/{user_id}/roles", response_model=OkResponse)
async def grant_role(
    user_id: uuid.UUID,
    payload: RoleChangeRequest,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    user = (await db.execute(select(AppUser).where(AppUser.id == user_id))).scalar_one_or_none()
    if user is None:
        raise NotFound("User not found")
    existing = (
        await db.execute(
            select(UserRole).where(UserRole.user_id == user_id, UserRole.role == payload.role)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return OkResponse(ok=True)  # idempotent

    db.add(UserRole(user_id=user_id, role=payload.role))
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="role.grant",
        entity="user_role",
        entity_id=user_id,
        before=None,
        after={"role": payload.role.value},
        ip=_client_ip(request),
    )
    return OkResponse(ok=True)


@router.delete("/{user_id}/roles/{role}", response_model=OkResponse)
async def revoke_role(
    user_id: uuid.UUID,
    role: Role,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    user = (await db.execute(select(AppUser).where(AppUser.id == user_id))).scalar_one_or_none()
    if user is None:
        raise NotFound("User not found")

    # Guard against locking the last admin out of the org.
    if role == Role.admin:
        admin_count = (
            await db.execute(
                select(func.count(UserRole.id)).where(UserRole.role == Role.admin)
            )
        ).scalar_one()
        if admin_count <= 1:
            raise Conflict("Cannot revoke the last admin role in the organization")

    row = (
        await db.execute(
            select(UserRole).where(UserRole.user_id == user_id, UserRole.role == role)
        )
    ).scalar_one_or_none()
    if row is None:
        return OkResponse(ok=True)  # idempotent

    await db.delete(row)
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="role.revoke",
        entity="user_role",
        entity_id=user_id,
        before={"role": role.value},
        after=None,
        ip=_client_ip(request),
    )
    return OkResponse(ok=True)