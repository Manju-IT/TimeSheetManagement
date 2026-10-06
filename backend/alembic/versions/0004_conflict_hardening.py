"""github conflict hardening

Revision ID: 0004_conflict_hardening
Revises: 0003_github_sync
Create Date: 2025-01-20 00:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_conflict_hardening"
down_revision: Union[str, None] = "0003_github_sync"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "task",
        sa.Column("sync_last_error_code", sa.Text(), nullable=True),
    )
    op.add_column(
        "task",
        sa.Column("conflict_remote_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "task",
        sa.Column("conflict_detected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "task",
        sa.Column("conflict_local_snapshot", postgresql.JSONB(), nullable=True),
    )
    op.create_index(
        "ix_task_conflict_pending",
        "task",
        ["sync_state", "conflict_detected_at"],
        postgresql_where=sa.text("sync_state = 'conflict'"),
    )


def downgrade() -> None:
    op.drop_index("ix_task_conflict_pending", table_name="task")
    op.drop_column("task", "conflict_local_snapshot")
    op.drop_column("task", "conflict_detected_at")
    op.drop_column("task", "conflict_remote_updated_at")
    op.drop_column("task", "sync_last_error_code")