from fastapi import APIRouter

from app.api.v1.admin import audit, teams, users

router = APIRouter(prefix="/admin", tags=["admin"])
router.include_router(users.router)
router.include_router(teams.router)
router.include_router(audit.router)