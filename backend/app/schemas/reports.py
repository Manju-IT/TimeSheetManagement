from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict


class ReportFilterUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    full_name: str


class HoursByProjectOut(BaseModel):
    project_id: uuid.UUID
    name: str
    code: str | None
    minutes: int
    entries: int


class HoursByMemberOut(BaseModel):
    user_id: uuid.UUID
    full_name: str
    email: str
    minutes: int
    entries: int


class DailyTrendOut(BaseModel):
    work_date: date
    minutes: int
    entries: int


class AttendanceSummaryOut(BaseModel):
    user_id: uuid.UUID
    full_name: str
    email: str
    days: int
    session_seconds: int
    logged_seconds: int
    variance_seconds: int


class ReportSummaryOut(BaseModel):
    from_date: date
    to_date: date
    total_minutes: int
    total_entries: int
    hours_by_project: list[HoursByProjectOut]
    hours_by_member: list[HoursByMemberOut]
    daily_trend: list[DailyTrendOut]
    attendance_summary: list[AttendanceSummaryOut]