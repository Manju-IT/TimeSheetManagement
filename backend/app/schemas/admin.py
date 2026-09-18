from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import Role, UserStatus


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    full_name: str
    status: UserStatus
    timezone: str | None
    github_login: str | None
    roles: list[Role]
    created_at: datetime
    updated_at: datetime


class AdminUserPatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    status: UserStatus | None = None
    timezone: str | None = None
    github_login: str | None = None


class RoleChangeRequest(BaseModel):
    role: Role


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    action: str
    entity: str
    entity_id: uuid.UUID | None
    before: dict | None
    after: dict | None
    ip: str | None
    created_at: datetime