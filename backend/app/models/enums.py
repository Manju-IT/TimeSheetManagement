from __future__ import annotations

import enum


class UserStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"


class Role(str, enum.Enum):
    member = "member"
    manager = "manager"
    admin = "admin"


class LogoutReason(str, enum.Enum):
    user = "user"
    timeout = "timeout"
    forced = "forced"
    unknown = "unknown"


class GeoEventType(str, enum.Enum):
    login = "login"
    logout = "logout"
    heartbeat = "heartbeat"


class GeoPermission(str, enum.Enum):
    granted = "granted"
    denied = "denied"
    unavailable = "unavailable"


class AttendanceStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"


class ProjectSource(str, enum.Enum):
    github = "github"
    manual = "manual"


class TaskSource(str, enum.Enum):
    github = "github"
    manual = "manual"


class GhContentType(str, enum.Enum):
    issue = "issue"
    pull_request = "pull_request"
    draft = "draft"


class SyncState(str, enum.Enum):
    synced = "synced"
    pending_push = "pending_push"
    conflict = "conflict"
    error = "error"


class TimeEntryStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"


class CodeLinkType(str, enum.Enum):
    commit = "commit"
    pull_request = "pull_request"
    branch = "branch"
    file = "file"
    compare = "compare"
    other = "other"


class TimesheetStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"


class SyncDirection(str, enum.Enum):
    pull = "pull"
    push = "push"


class SyncEntity(str, enum.Enum):
    project = "project"
    task = "task"


class SyncTrigger(str, enum.Enum):
    webhook = "webhook"
    schedule = "schedule"
    manual = "manual"
    user_edit = "user_edit"


class SyncStatus(str, enum.Enum):
    success = "success"
    failed = "failed"
    skipped = "skipped"
    conflict = "conflict"