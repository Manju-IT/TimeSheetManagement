"""idempotency hardening

Revision ID: 0005_idempotency_hardening
Revises: 0004_conflict_hardening
Create Date: 2025-02-01 00:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_idempotency_hardening"
down_revision: Union[str, None] = "0004_conflict_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "idempotency_key",
        sa.Column("state", sa.Text(), nullable=False, server_default="complete"),
    )
    op.add_column(
        "idempotency_key",
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "idempotency_key",
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_idempotency_state_locked",
        "idempotency_key",
        ["state", "locked_until"],
        postgresql_where=sa.text("state = 'pending'"),
    )
    op.create_index(
        "ix_idempotency_created_at",
        "idempotency_key",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_idempotency_created_at", table_name="idempotency_key")
    op.drop_index("ix_idempotency_state_locked", table_name="idempotency_key")
    op.drop_column("idempotency_key", "resource_id")
    op.drop_column("idempotency_key", "locked_until")
    op.drop_column("idempotency_key", "state")