"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2025-01-01 00:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---- Enum types ----------------------------------------------------------------
user_status = postgresql.ENUM("active", "disabled", name="user_status")
user_role_enum = postgresql.ENUM("member", "manager", "admin", name="user_role_enum")
logout_reason = postgresql.ENUM("user", "timeout", "forced", "unknown", name="logout_reason")
geo_event_type = postgresql.ENUM("login", "logout", "heartbeat", name="geo_event_type")
geo_permission = postgresql.ENUM("granted", "denied", "unavailable", name="geo_permission")
attendance_status = postgresql.ENUM(
    "open", "closed", "submitted", "approved", "rejected", name="attendance_status"
)
project_source = postgresql.ENUM("github", "manual", name="project_source")
task_source = postgresql.ENUM("github", "manual", name="task_source")
gh_content_type = postgresql.ENUM("issue", "pull_request", "draft", name="gh_content_type")
task_sync_state = postgresql.ENUM(
    "synced", "pending_push", "conflict", "error", name="task_sync_state"
)
time_entry_status = postgresql.ENUM(
    "draft", "submitted", "approved", "rejected", name="time_entry_status"
)
code_link_type = postgresql.ENUM(
    "commit", "pull_request", "branch", "file", "compare", "other", name="code_link_type"
)
timesheet_status = postgresql.ENUM(
    "draft", "submitted", "approved", "rejected", name="timesheet_status"
)
sync_direction = postgresql.ENUM("pull", "push", name="sync_direction")
sync_entity = postgresql.ENUM("project", "task", name="sync_entity")
sync_trigger = postgresql.ENUM("webhook", "schedule", "manual", "user_edit", name="sync_trigger")
sync_status = postgresql.ENUM("success", "failed", "skipped", "conflict", name="sync_status")

ALL_ENUMS = [
    user_status, user_role_enum, logout_reason, geo_event_type, geo_permission,
    attendance_status, project_source, task_source, gh_content_type, task_sync_state,
    time_entry_status, code_link_type, timesheet_status, sync_direction, sync_entity,
    sync_trigger, sync_status,
]


def upgrade() -> None:
    # bind = op.get_bind()
    # for e in ALL_ENUMS:
    #     e.create(bind, checkfirst=True)

    op.create_table(
        "organization",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("default_timezone", sa.Text(), nullable=False, server_default="UTC"),
        sa.Column("workday_cutoff", sa.Time(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "org_policy",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("workday_hours", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("variance_threshold_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("auto_logout_minutes", sa.Integer(), nullable=False, server_default="600"),
        sa.Column("allow_login_without_location", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("location_retention_days", sa.Integer(), nullable=False, server_default="365"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "app_user",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organization.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("ims_user_id", sa.Text(), nullable=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("full_name", sa.Text(), nullable=False),
        sa.Column("github_login", sa.Text(), nullable=True),
        sa.Column("timezone", sa.Text(), nullable=True),
        sa.Column("status", user_status, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("email", name="uq_app_user_email"),
        sa.UniqueConstraint("ims_user_id", name="uq_app_user_ims_user_id"),
    )
    op.create_index("ix_app_user_org_id", "app_user", ["org_id"])
    op.create_index("ix_app_user_github_login", "app_user", ["github_login"])

    op.create_table(
        "user_role",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", user_role_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "role", name="uq_user_role"),
    )
    op.create_index("ix_user_role_user_id", "user_role", ["user_id"])

    op.create_table(
        "ims_identity",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("provider_subject", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("provider", "provider_subject", name="uq_ims_identity_provider_subject"),
    )
    op.create_index("ix_ims_identity_user_id", "ims_identity", ["user_id"])

    op.create_table(
        "team",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "name", name="uq_team_org_name"),
    )
    op.create_index("ix_team_org_id", "team", ["org_id"])

    op.create_table(
        "team_member",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("team_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("team.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_manager", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("team_id", "user_id", name="uq_team_member"),
    )
    op.create_index("ix_team_member_team_id", "team_member", ["team_id"])
    op.create_index("ix_team_member_user_id", "team_member", ["user_id"])

    op.create_table(
        "work_site",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("radius_m", sa.Numeric(10, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_work_site_org_id", "work_site", ["org_id"])

    op.create_table(
        "geo_event",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", geo_event_type, nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("client_reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=True),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=True),
        sa.Column("accuracy_m", sa.Numeric(10, 2), nullable=True),
        sa.Column("geo_permission", geo_permission, nullable=False, server_default="unavailable"),
        sa.Column("place_label", sa.Text(), nullable=True),
        sa.Column("site_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("work_site.id", ondelete="SET NULL"), nullable=True),
        sa.Column("inside_site", sa.Boolean(), nullable=True),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("device_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_geo_event_user_occurred", "geo_event", ["user_id", sa.text("occurred_at DESC")])
    op.create_index("ix_geo_event_type_occurred", "geo_event", ["event_type", "occurred_at"])

    op.create_table(
        "work_session",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("login_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("logout_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("logout_reason", logout_reason, nullable=True),
        sa.Column("login_event_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("geo_event.id", ondelete="SET NULL"), nullable=True),
        sa.Column("logout_event_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("geo_event.id", ondelete="SET NULL"), nullable=True),
        sa.Column("session_seconds", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_work_session_user_login", "work_session", ["user_id", sa.text("login_at DESC")])
    op.create_index(
        "uq_work_session_active",
        "work_session",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("logout_at IS NULL"),
    )

    op.create_table(
        "attendance_day",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("first_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_logout_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_login_event_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("geo_event.id", ondelete="SET NULL"), nullable=True),
        sa.Column("last_logout_event_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("geo_event.id", ondelete="SET NULL"), nullable=True),
        sa.Column("total_session_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("logged_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", attendance_status, nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "work_date", name="uq_attendance_user_date"),
    )
    op.create_index("ix_attendance_user_date_desc", "attendance_day", ["user_id", sa.text("work_date DESC")])
    op.create_index("ix_attendance_work_date", "attendance_day", ["work_date"])

    op.create_table(
        "project",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organization.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("code", sa.Text(), nullable=True),
        sa.Column("source", project_source, nullable=False, server_default="manual"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "name", name="uq_project_org_name"),
    )
    op.create_index("ix_project_org_id", "project", ["org_id"])

    op.create_table(
        "github_project_link",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("project.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("gh_owner", sa.Text(), nullable=False),
        sa.Column("gh_project_number", sa.Integer(), nullable=False),
        sa.Column("gh_project_node_id", sa.Text(), nullable=False, unique=True),
        sa.Column("default_repo", sa.Text(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_cursor", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "task",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("project.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.Text(), nullable=False, server_default="Todo"),
        sa.Column("assignee_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source", task_source, nullable=False, server_default="manual"),
        sa.Column("gh_item_node_id", sa.Text(), nullable=True),
        sa.Column("gh_content_type", gh_content_type, nullable=True),
        sa.Column("gh_issue_number", sa.Integer(), nullable=True),
        sa.Column("gh_repo", sa.Text(), nullable=True),
        sa.Column("gh_url", sa.Text(), nullable=True),
        sa.Column("gh_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("local_updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("sync_state", task_sync_state, nullable=False, server_default="synced"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_task_project_active", "task", ["project_id", "is_active"])
    op.create_index(
        "uq_task_gh_item_node_id",
        "task",
        ["gh_item_node_id"],
        unique=True,
        postgresql_where=sa.text("gh_item_node_id IS NOT NULL"),
    )
    op.create_index("ix_task_sync_state", "task", ["sync_state"])

    op.create_table(
        "time_entry",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("project.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("task.id", ondelete="SET NULL"), nullable=True),
        sa.Column("task_title_snapshot", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("billable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", time_entry_status, nullable=False, server_default="draft"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("client_idempotency_key", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("duration_minutes BETWEEN 1 AND 1440", name="ck_time_entry_duration_range"),
        sa.UniqueConstraint("user_id", "client_idempotency_key", name="uq_time_entry_user_idempotency"),
    )
    op.create_index("ix_time_entry_user_date", "time_entry", ["user_id", "work_date"])
    op.create_index("ix_time_entry_project_date", "time_entry", ["project_id", "work_date"])
    op.create_index("ix_time_entry_task", "time_entry", ["task_id"])

    op.create_table(
        "code_link",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("time_entry_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("time_entry.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("link_type", code_link_type, nullable=False, server_default="other"),
        sa.Column("repo", sa.Text(), nullable=True),
        sa.Column("ref", sa.Text(), nullable=True),
        sa.Column("number", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_code_link_time_entry_id", "code_link", ["time_entry_id"])

    op.create_table(
        "timesheet_period",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("status", timesheet_status, nullable=False, server_default="draft"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "period_start", "period_end", name="uq_timesheet_period"),
    )
    op.create_index("ix_timesheet_user_id", "timesheet_period", ["user_id"])

    op.create_table(
        "sync_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("direction", sync_direction, nullable=False),
        sa.Column("entity", sync_entity, nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("gh_node_id", sa.Text(), nullable=True),
        sa.Column("trigger", sync_trigger, nullable=False),
        sa.Column("request_payload", postgresql.JSONB(), nullable=True),
        sa.Column("response_payload", postgresql.JSONB(), nullable=True),
        sa.Column("status", sync_status, nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("entity", sa.Text(), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("before", postgresql.JSONB(), nullable=True),
        sa.Column("after", postgresql.JSONB(), nullable=True),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_entity", "audit_log", ["entity", "entity_id"])
    op.create_index("ix_audit_actor_created", "audit_log", ["actor_user_id", sa.text("created_at DESC")])

    op.create_table(
        "idempotency_key",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("request_hash", sa.Text(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("response_body", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("scope", "key", name="uq_idempotency_scope_key"),
    )


def downgrade() -> None:
    op.drop_table("idempotency_key")
    op.drop_index("ix_audit_actor_created", table_name="audit_log")
    op.drop_index("ix_audit_entity", table_name="audit_log")
    op.drop_table("audit_log")
    op.drop_table("sync_log")
    op.drop_index("ix_timesheet_user_id", table_name="timesheet_period")
    op.drop_table("timesheet_period")
    op.drop_index("ix_code_link_time_entry_id", table_name="code_link")
    op.drop_table("code_link")
    op.drop_index("ix_time_entry_task", table_name="time_entry")
    op.drop_index("ix_time_entry_project_date", table_name="time_entry")
    op.drop_index("ix_time_entry_user_date", table_name="time_entry")
    op.drop_table("time_entry")
    op.drop_index("ix_task_sync_state", table_name="task")
    op.drop_index("uq_task_gh_item_node_id", table_name="task")
    op.drop_index("ix_task_project_active", table_name="task")
    op.drop_table("task")
    op.drop_table("github_project_link")
    op.drop_index("ix_project_org_id", table_name="project")
    op.drop_table("project")
    op.drop_index("ix_attendance_work_date", table_name="attendance_day")
    op.drop_index("ix_attendance_user_date_desc", table_name="attendance_day")
    op.drop_table("attendance_day")
    op.drop_index("uq_work_session_active", table_name="work_session")
    op.drop_index("ix_work_session_user_login", table_name="work_session")
    op.drop_table("work_session")
    op.drop_index("ix_geo_event_type_occurred", table_name="geo_event")
    op.drop_index("ix_geo_event_user_occurred", table_name="geo_event")
    op.drop_table("geo_event")
    op.drop_index("ix_work_site_org_id", table_name="work_site")
    op.drop_table("work_site")
    op.drop_index("ix_team_member_user_id", table_name="team_member")
    op.drop_index("ix_team_member_team_id", table_name="team_member")
    op.drop_table("team_member")
    op.drop_index("ix_team_org_id", table_name="team")
    op.drop_table("team")
    op.drop_index("ix_ims_identity_user_id", table_name="ims_identity")
    op.drop_table("ims_identity")
    op.drop_index("ix_user_role_user_id", table_name="user_role")
    op.drop_table("user_role")
    op.drop_index("ix_app_user_github_login", table_name="app_user")
    op.drop_index("ix_app_user_org_id", table_name="app_user")
    op.drop_table("app_user")
    op.drop_table("org_policy")
    op.drop_table("organization")

    bind = op.get_bind()
    for e in reversed(ALL_ENUMS):
        e.drop(bind, checkfirst=True)