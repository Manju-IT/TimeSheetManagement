"""data integrity hardening

Revision ID: 0007_data_integrity
Revises: 0006_sso_config
Create Date: 2025-03-01 00:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_data_integrity"
down_revision: Union[str, None] = "0006_sso_config"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_RESTRICT_TABLES = [
    ("geo_event", "user_id"),
    ("work_session", "user_id"),
    ("attendance_day", "user_id"),
    ("time_entry", "user_id"),
    ("timesheet_period", "user_id"),
]


def upgrade() -> None:
    # ---- 1. Historical user FKs: CASCADE -> RESTRICT ------------------- #
    for table, col in _RESTRICT_TABLES:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {table}_{col}_fkey")
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT {table}_{col}_fkey "
            f"FOREIGN KEY ({col}) REFERENCES app_user(id) ON DELETE RESTRICT"
        )

    # ---- 2. audit_log.actor_user_id: SET NULL -> RESTRICT ------------- #
    op.execute(
        "ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_user_id_fkey"
    )
    op.execute(
        "ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_user_id_fkey "
        "FOREIGN KEY (actor_user_id) REFERENCES app_user(id) ON DELETE RESTRICT"
    )

    # ---- 3. org_id on audit_log and sync_log ------------------------- #
    op.add_column(
        "audit_log",
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "audit_log_org_id_fkey",
        "audit_log",
        "organization",
        ["org_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_audit_log_org_created",
        "audit_log",
        ["org_id", sa.text("created_at DESC")],
    )

    op.add_column(
        "sync_log",
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "sync_log_org_id_fkey",
        "sync_log",
        "organization",
        ["org_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_sync_log_org_created",
        "sync_log",
        ["org_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_sync_log_created_at",
        "sync_log",
        [sa.text("created_at DESC")],
    )
    op.create_index("ix_sync_log_status", "sync_log", ["status"])

    # ---- 4. Time-entry time consistency ----------------------------- #
    op.execute(
        "ALTER TABLE time_entry ADD CONSTRAINT ck_time_entry_ended_after_started "
        "CHECK (started_at IS NULL OR ended_at IS NULL OR ended_at > started_at)"
    )
    op.execute(
        "ALTER TABLE time_entry ADD CONSTRAINT ck_time_entry_times_consistent "
        "CHECK ((started_at IS NULL AND ended_at IS NULL) "
        "   OR (started_at IS NOT NULL AND ended_at IS NOT NULL))"
    )

    # ---- 5. Timesheet status index ---------------------------------- #
    op.create_index(
        "ix_timesheet_period_status", "timesheet_period", ["status"]
    )


def downgrade() -> None:
    op.drop_index("ix_timesheet_period_status", table_name="timesheet_period")

    op.execute("ALTER TABLE time_entry DROP CONSTRAINT IF EXISTS ck_time_entry_times_consistent")
    op.execute("ALTER TABLE time_entry DROP CONSTRAINT IF EXISTS ck_time_entry_ended_after_started")

    op.drop_index("ix_sync_log_status", table_name="sync_log")
    op.drop_index("ix_sync_log_created_at", table_name="sync_log")
    op.drop_index("ix_sync_log_org_created", table_name="sync_log")
    op.drop_constraint("sync_log_org_id_fkey", "sync_log", type_="foreignkey")
    op.drop_column("sync_log", "org_id")

    op.drop_index("ix_audit_log_org_created", table_name="audit_log")
    op.drop_constraint("audit_log_org_id_fkey", "audit_log", type_="foreignkey")
    op.drop_column("audit_log", "org_id")

    op.execute(
        "ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_user_id_fkey"
    )
    op.execute(
        "ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_user_id_fkey "
        "FOREIGN KEY (actor_user_id) REFERENCES app_user(id) ON DELETE SET NULL"
    )

    for table, col in reversed(_RESTRICT_TABLES):
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {table}_{col}_fkey")
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT {table}_{col}_fkey "
            f"FOREIGN KEY ({col}) REFERENCES app_user(id) ON DELETE CASCADE"
        )