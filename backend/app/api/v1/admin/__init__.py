from fastapi import APIRouter

from app.api.v1.admin import (
    audit,
    github,
    organization,
    policies,
    sso,
    sync,
    teams,
    users,
    work_sites,
)

router = APIRouter(prefix="/admin", tags=["admin"])
router.include_router(users.router)
router.include_router(teams.router)
router.include_router(audit.router)
router.include_router(github.router)
router.include_router(work_sites.router)
router.include_router(policies.router)
router.include_router(organization.router)
router.include_router(sso.router)
router.include_router(sync.router)