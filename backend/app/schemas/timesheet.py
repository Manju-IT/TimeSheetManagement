from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TimesheetStatus


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


class WeekCellOut(BaseModel):
    minutes: int
    entry_ids: list[uuid.UUID]


class WeekRowOut(BaseModel):
    project_id: uuid.UUID
    project_name: str
    project_code: str | None
    task_id: uuid.UUID | None
    task_title: str | None
    cells: dict[str, WeekCellOut]  # key = ISO date
    total_minutes: int


class WeekDayOut(BaseModel):
    work_date: date
    weekday: str  # 'Mon' … 'Sun'
    is_future: bool
    first_login_at: datetime | None
    last_logout_at: datetime | None
    total_session_seconds: int
    logged_seconds: int
    attendance_status: str | None  # None when no attendance row exists
    has_open_session: bool
    missing_attendance: bool  # entries exist but no attendance_day row
    variance_seconds: int  # session − logged
    variance_exceeds_threshold: bool


class TimesheetWeekOut(BaseModel):
    period: TimesheetPeriodOut
    days: list[WeekDayOut]
    rows: list[WeekRowOut]
    daily_totals: dict[str, int]  # ISO date → minutes
    weekly_total_minutes: int
    variance_threshold_minutes: int


class ReviewUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    full_name: str


class ReviewItemOut(BaseModel):
    period: TimesheetPeriodOut
    user: ReviewUserOut


class ReviewDetailOut(BaseModel):
    period: TimesheetPeriodOut
    user: ReviewUserOut
    week: TimesheetWeekOut


class TimesheetSubmitIn(BaseModel):
    expected_version: int = Field(ge=1)


class TimesheetReviewIn(BaseModel):
    expected_version: int = Field(ge=1)
    comment: str | None = Field(default=None, max_length=2000)