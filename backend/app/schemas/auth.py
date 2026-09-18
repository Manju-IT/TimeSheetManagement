from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str


class MeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    timezone: str | None
    org_id: uuid.UUID
    github_login: str | None
    roles: list[str]
    permissions: list[str]


class AuthConfigResponse(BaseModel):
    oidc_enabled: bool
    local_dev_auth: bool
    app_name: str


class StartLoginResponse(BaseModel):
    authorize_url: str
    state: str


class DevLoginRequest(BaseModel):
    email: EmailStr


class LogoutResponse(BaseModel):
    ok: bool
    ims_end_session_url: str | None = None