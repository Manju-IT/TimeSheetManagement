from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class TeamAttendanceMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: uuid.UUID
    email: str
    full_name: str
    timezone: str | None

class TeamOptionOut(BaseModel):
    id: uuid.UUID
    name: str

class GeoEventSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_type: str
    occurred_at: datetime
    latitude: float | None
    longitude: float | None
    accuracy_m: float | None
    place_label: str | None
    inside_site: bool | None
    geo_permission: str
    site_id: uuid.UUID | None


class WorkSessionSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    login_at: datetime
    logout_at: datetime | None
    logout_reason: str | None
    session_seconds: int | None


class TeamAttendanceRowOut(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    timezone: str | None
    work_date: date
    first_login_at: datetime | None
    last_logout_at: datetime | None
    first_login_event: GeoEventSummaryOut | None
    last_logout_event: GeoEventSummaryOut | None
    active_session: WorkSessionSummaryOut | None
    total_session_seconds: int
    logged_seconds: int
    entry_count: int
    billable_minutes: int
    attendance_status: str | None
    flags: list[str]


class TeamAttendancePageOut(BaseModel):
    team_id: uuid.UUID
    team_name: str
    work_date: date
    variance_threshold_minutes: int
    rows: list[TeamAttendanceRowOut]


class TimelineEntryOut(BaseModel):
    kind: str  # 'login' | 'logout'
    occurred_at: datetime
    latitude: float | None
    longitude: float | None
    accuracy_m: float | None
    place_label: str | None
    inside_site: bool | None
    geo_permission: str
    ip: str | None
    device_id: str | None
    session_id: uuid.UUID | None


class TimelineOut(BaseModel):
    user: TeamAttendanceMemberOut
    work_date: date
    attendance_day_id: uuid.UUID | None
    attendance_status: str | None
    first_login_at: datetime | None
    last_logout_at: datetime | None
    total_session_seconds: int
    logged_seconds: int
    events: list[TimelineEntryOut]
    sessions: list[WorkSessionSummaryOut]