from fastapi import APIRouter

from app.api.v1 import (
    attendance,
    auth,
    projects,
    tasks,
    team,
    teams,
    time_entries,
    team_attendance,
    timesheets,
    reports,
)

from app.api.v1.admin import router as admin_router
from app.api.v1.webhooks import github as github_webhook_router


api_v1_router = APIRouter()

api_v1_router.include_router(auth.router)
api_v1_router.include_router(attendance.router)
api_v1_router.include_router(team.router)
api_v1_router.include_router(teams.router)
api_v1_router.include_router(projects.router)
api_v1_router.include_router(tasks.router)
api_v1_router.include_router(time_entries.router)
api_v1_router.include_router(timesheets.router)

# Complete admin router:
# /api/v1/admin/users
# /api/v1/admin/teams
# /api/v1/admin/github/...
# /api/v1/admin/organization
# /api/v1/admin/sync-logs
# /api/v1/admin/policies
# /api/v1/admin/sso
# /api/v1/admin/work-sites
# etc.
api_v1_router.include_router(admin_router)

api_v1_router.include_router(team_attendance.router)
api_v1_router.include_router(github_webhook_router.router)
api_v1_router.include_router(reports.router)