from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from app.models.enums import Role


# replace the CurrentUser dataclass with:
@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    org_id: uuid.UUID
    email: str
    full_name: str
    roles: frozenset[Role]
    timezone: str | None
    github_login: str | None = None
    managed_team_ids: frozenset[uuid.UUID] = frozenset()
    member_team_ids: frozenset[uuid.UUID] = frozenset()

    @property
    def is_admin(self) -> bool:
        return Role.admin in self.roles

    @property
    def is_manager(self) -> bool:
        return Role.manager in self.roles or self.is_admin

    @property
    def is_member(self) -> bool:
        return Role.member in self.roles

    def manages_team(self, team_id: uuid.UUID) -> bool:
        return self.is_admin or team_id in self.managed_team_ids

    def belongs_to_team(self, team_id: uuid.UUID) -> bool:
        return self.is_admin or team_id in self.member_team_ids


# Permission catalogue. Expanded in Phase 3 for object-level checks.
class Perm:
    # self
    PROFILE_READ = "profile:read"
    ATTENDANCE_READ_SELF = "attendance:read_self"
    ATTENDANCE_WRITE_SELF = "attendance:write_self"
    TIME_ENTRY_WRITE_SELF = "time_entry:write_self"
    TIMESHEET_SUBMIT_SELF = "timesheet:submit_self"
    # team
    ATTENDANCE_READ_TEAM = "attendance:read_team"
    TIMESHEET_APPROVE = "timesheet:approve"
    REPORTS_READ_TEAM = "reports:read_team"
    # admin
    USERS_MANAGE = "users:manage"
    ROLES_MANAGE = "roles:manage"
    WORK_SITES_MANAGE = "work_sites:manage"
    POLICIES_MANAGE = "policies:manage"
    GITHUB_MANAGE = "github:manage"
    AUDIT_READ = "audit:read"
    SYNC_LOG_READ = "sync_log:read"


_MEMBER = frozenset({
    Perm.PROFILE_READ,
    Perm.ATTENDANCE_READ_SELF,
    Perm.ATTENDANCE_WRITE_SELF,
    Perm.TIME_ENTRY_WRITE_SELF,
    Perm.TIMESHEET_SUBMIT_SELF,
})

_MANAGER = _MEMBER | frozenset({
    Perm.ATTENDANCE_READ_TEAM,
    Perm.TIMESHEET_APPROVE,
    Perm.REPORTS_READ_TEAM,
})

_ADMIN = _MANAGER | frozenset({
    Perm.USERS_MANAGE,
    Perm.ROLES_MANAGE,
    Perm.WORK_SITES_MANAGE,
    Perm.POLICIES_MANAGE,
    Perm.GITHUB_MANAGE,
    Perm.AUDIT_READ,
    Perm.SYNC_LOG_READ,
})

ROLE_PERMISSIONS: dict[Role, frozenset[str]] = {
    Role.member: _MEMBER,
    Role.manager: _MANAGER,
    Role.admin: _ADMIN,
}


def permissions_for(roles: frozenset[Role]) -> frozenset[str]:
    result: set[str] = set()
    for r in roles:
        result |= ROLE_PERMISSIONS.get(r, frozenset())
    return frozenset(result)


def has_permission(user: CurrentUser, permission: str) -> bool:
    return permission in permissions_for(user.roles)