from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import CodeLinkType, TimeEntryStatus


class CodeLinkIn(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    note: str | None = Field(default=None, max_length=500)


class CodeLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    url: str
    link_type: CodeLinkType
    repo: str | None
    ref: str | None
    number: str | None
    note: str | None


class CodeLinkPreviewOut(BaseModel):
    url: str
    link_type: CodeLinkType
    repo: str | None
    ref: str | None
    number: str | None
    is_github: bool


class TimeEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    work_date: date
    project_id: uuid.UUID
    task_id: uuid.UUID | None
    task_title_snapshot: str | None
    description: str
    started_at: datetime | None
    ended_at: datetime | None
    duration_minutes: int
    billable: bool
    status: TimeEntryStatus
    version: int
    code_links: list[CodeLinkOut] = []
    created_at: datetime
    updated_at: datetime


class TimeEntryCreate(BaseModel):
    project_id: uuid.UUID
    task_id: uuid.UUID | None = None
    description: str = Field(default="", max_length=10_000)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    billable: bool = False
    work_date: date | None = None
    code_links: list[CodeLinkIn] = Field(default_factory=list)
    client_idempotency_key: str | None = Field(default=None, max_length=80)
    also_update_github: bool = False

    @model_validator(mode="after")
    def _require_duration_or_times(self) -> "TimeEntryCreate":
        if self.duration_minutes is None and (self.started_at is None or self.ended_at is None):
            raise ValueError("Provide either duration_minutes or both started_at and ended_at")
        return self


class TimeEntryUpdate(BaseModel):
    expected_version: int = Field(ge=1)
    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    clear_task: bool = False
    description: str | None = Field(default=None, max_length=10_000)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    billable: bool | None = None
    work_date: date | None = None
    code_links: list[CodeLinkIn] | None = None


class TimeEntryTransitionIn(BaseModel):
    expected_version: int = Field(ge=1)
    comment: str | None = Field(default=None, max_length=2000)


class TimeEntryListFilters(BaseModel):
    from_date: date | None = None
    to_date: date | None = None
    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    status: TimeEntryStatus | None = None
    billable: bool | None = None