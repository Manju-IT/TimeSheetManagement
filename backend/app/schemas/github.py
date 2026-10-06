from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import SyncDirection, SyncEntity, SyncStatus, SyncTrigger


class LinkProjectRequest(BaseModel):
    project_id: uuid.UUID
    gh_owner: str = Field(min_length=1, max_length=200)
    gh_project_number: int = Field(ge=1)
    default_repo: str | None = Field(default=None, max_length=200)
    owner_type: str = Field(default="organization", pattern="^(organization|user)$")


class ProjectLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    gh_owner: str
    gh_project_number: int
    gh_project_node_id: str
    default_repo: str | None
    last_synced_at: datetime | None


class SyncLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    direction: SyncDirection
    entity: SyncEntity
    entity_id: uuid.UUID | None
    gh_node_id: str | None
    trigger: SyncTrigger
    status: SyncStatus
    error_message: str | None
    created_at: datetime


class ManualSyncRequest(BaseModel):
    project_link_id: uuid.UUID | None = None


class ConflictResolution(str):
    pass


class ConflictResolveRequest(BaseModel):
    strategy: str = Field(pattern="^(keep_mine|use_github)$")


class TaskSyncStatusOut(BaseModel):
    task_id: uuid.UUID
    sync_state: str
    gh_updated_at: datetime | None
    last_synced_at: datetime | None
    local_updated_at: datetime
    attempts: int
    last_error: str | None
    last_error_code: str | None = None
    conflict_detected_at: datetime | None = None


class ConnectionTestOut(BaseModel):
    ok: bool
    viewer_login: str | None
    mode: str
    error: str | None = None