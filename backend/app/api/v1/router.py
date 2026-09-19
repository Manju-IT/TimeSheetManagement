from __future__ import annotations
from fastapi import APIRouter

from app.api.v1 import (
    admin,
    approvals,
    attendance,
    auth,
    projects,
    tasks,
    teams,
    time_entries,
)

api_v1_router = APIRouter()
api_v1_router.include_router(auth.router)
api_v1_router.include_router(attendance.router)
api_v1_router.include_router(time_entries.router)
api_v1_router.include_router(tasks.router)
api_v1_router.include_router(projects.router)
api_v1_router.include_router(approvals.router)
api_v1_router.include_router(teams.router)
api_v1_router.include_router(admin.router.router)