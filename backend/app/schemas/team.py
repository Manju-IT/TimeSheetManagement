from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    org_id: uuid.UUID


class TeamMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    team_id: uuid.UUID
    user_id: uuid.UUID
    is_manager: bool
    created_at: datetime


class TeamMemberWithUser(TeamMemberOut):
    email: str
    full_name: str


class TeamCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class TeamAddMemberRequest(BaseModel):
    user_id: uuid.UUID
    is_manager: bool = False