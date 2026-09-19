from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TimeEntryStatus, TimesheetStatus


class TimeEntryCreate(BaseModel):
    work_date: date
    project_id: uuid.UUID
    task_id: uuid.UUID | None = None
    task_title_snapshot: str | None = None
    description: str = Field(default="", max_length=2000)
    duration_minutes: int = Field(ge=1, le=1440)
    billable: bool = False
    started_at: datetime | None = None
    ended_at: datetime | None = None


class TimeEntryUpdate(BaseModel):
    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    task_title_snapshot: str | None = None
    description: str | None = Field(default=None, max_length=2000)
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    billable: bool | None = None
    work_date: date | None = None


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
    created_at: datetime


class TimesheetPeriodSubmit(BaseModel):
    period_start: date
    period_end: date


class TimesheetPeriodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    period_start: date
    period_end: date
    status: TimesheetStatus
    submitted_at: datetime | None
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    comment: str | None
    version: int


class ApprovalAction(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")
    comment: str | None = Field(default=None, max_length=1000)
