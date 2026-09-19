from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TaskSource


class TaskCreate(BaseModel):
    project_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=4000)
    status: str = Field(default="Todo", max_length=50)
    assignee_user_id: uuid.UUID | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    status: str | None = Field(default=None, max_length=50)
    assignee_user_id: uuid.UUID | None = None
    is_active: bool | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str
    status: str
    assignee_user_id: uuid.UUID | None
    source: TaskSource
    is_active: bool
    created_at: datetime
