from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import GhContentType, SyncState, TaskSource


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str
    status: str
    assignee_user_id: uuid.UUID | None
    source: TaskSource
    gh_item_node_id: str | None
    gh_content_type: GhContentType | None
    gh_issue_number: int | None
    gh_repo: str | None
    gh_url: str | None
    gh_updated_at: datetime | None
    local_updated_at: datetime
    sync_state: SyncState
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TaskCreate(BaseModel):
    project_id: uuid.UUID
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(default="", max_length=20_000)
    status: str = Field(default="Todo", max_length=80)
    assignee_user_id: uuid.UUID | None = None


class TaskUpdate(BaseModel):
    expected_updated_at: datetime | None = None
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=20_000)
    status: str | None = Field(default=None, max_length=80)
    assignee_user_id: uuid.UUID | None = None
    is_active: bool | None = None