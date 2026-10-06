from __future__ import annotations

import uuid
from datetime import datetime, time

from pydantic import BaseModel, ConfigDict, Field, field_serializer


# ---- Work sites -----------------------------------------------------------

class WorkSiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    latitude: float
    longitude: float
    radius_m: float
    is_active: bool
    created_at: datetime
    updated_at: datetime


class WorkSiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    radius_m: float = Field(gt=0, le=100_000)
    is_active: bool = True


class WorkSiteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    radius_m: float | None = Field(default=None, gt=0, le=100_000)
    is_active: bool | None = None


# ---- Policies -------------------------------------------------------------

class PolicyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    org_id: uuid.UUID
    workday_hours: int
    variance_threshold_minutes: int
    auto_logout_minutes: int
    allow_login_without_location: bool
    location_retention_days: int
    updated_at: datetime


class PolicyUpdate(BaseModel):
    workday_hours: int | None = Field(default=None, ge=1, le=24)
    variance_threshold_minutes: int | None = Field(default=None, ge=0, le=1440)
    auto_logout_minutes: int | None = Field(default=None, ge=15, le=4320)
    allow_login_without_location: bool | None = None
    location_retention_days: int | None = Field(default=None, ge=1, le=3650)


# ---- Organization ---------------------------------------------------------


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    default_timezone: str
    workday_cutoff: time | None
    created_at: datetime
    updated_at: datetime

    @field_serializer("workday_cutoff")
    def _ser_cutoff(self, v: time | None) -> str | None:
        return v.strftime("%H:%M") if v else None


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    default_timezone: str | None = Field(default=None, max_length=64)
    workday_cutoff: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    clear_workday_cutoff: bool = False
# ---- SSO ------------------------------------------------------------------

class SSOConfigOut(BaseModel):
    enabled: bool
    group_claim: str
    group_to_role_admin: str | None
    group_to_role_manager: str | None
    group_to_role_member: str | None
    allowed_embed_origins: list[str]
    effective_frame_ancestors: list[str]
    # Env-derived (read-only)
    env_oidc_enabled: bool
    env_issuer: str | None
    env_client_id: str | None
    env_redirect_uri: str | None
    env_scopes: str


class SSOConfigUpdate(BaseModel):
    enabled: bool | None = None
    group_claim: str | None = Field(default=None, min_length=1, max_length=64)
    group_to_role_admin: str | None = Field(default=None, max_length=200)
    group_to_role_manager: str | None = Field(default=None, max_length=200)
    group_to_role_member: str | None = Field(default=None, max_length=200)
    allowed_embed_origins: list[str] | None = None


# ---- Sync retry -----------------------------------------------------------

class SyncRetryOut(BaseModel):
    task_id: uuid.UUID
    queued: bool
    previous_state: str