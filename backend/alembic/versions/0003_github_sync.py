"""github sync hardening

Revision ID: 0003_github_sync
Revises: 0002_user_session
Create Date: 2025-01-15 00:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_github_sync"
down_revision: Union[str, None] = "0002_user_session"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---------------------------------------------------------
    # 1. Add 'syncing' to the native PostgreSQL enum.
    #
    # PostgreSQL requires the new enum value to be committed
    # before it can be referenced by another statement.
    # ---------------------------------------------------------
    op.execute("COMMIT")

    op.execute(
        "ALTER TYPE task_sync_state "
        "ADD VALUE IF NOT EXISTS 'syncing'"
    )

    op.execute("BEGIN")

    # ---------------------------------------------------------
    # 2. New synchronization columns on task.
    # ---------------------------------------------------------
    op.add_column(
        "task",
        sa.Column(
            "sync_attempts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    op.add_column(
        "task",
        sa.Column(
            "sync_last_attempt_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # ---------------------------------------------------------
    # 3. Index for pending/error/syncing tasks.
    # ---------------------------------------------------------
    op.create_index(
        "ix_task_sync_pending",
        "task",
        ["sync_state", "local_updated_at"],
        postgresql_where=sa.text(
            "sync_state IN ('pending_push', 'error', 'syncing')"
        ),
    )

    # ---------------------------------------------------------
    # 4. GitHub project field cache.
    # ---------------------------------------------------------
    op.add_column(
        "github_project_link",
        sa.Column(
            "field_cache",
            postgresql.JSONB(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    # Remove GitHub project field cache.
    op.drop_column(
        "github_project_link",
        "field_cache",
    )

    # Remove synchronization index.
    op.drop_index(
        "ix_task_sync_pending",
        table_name="task",
    )

    # Remove synchronization columns.
    op.drop_column(
        "task",
        "sync_last_attempt_at",
    )

    op.drop_column(
        "task",
        "sync_attempts",
    )

    # PostgreSQL does not support removing an individual enum value
    # safely through a simple ALTER TYPE statement.
    # Therefore 'syncing' intentionally remains in task_sync_state.