"""sso configuration overrides

Revision ID: 0006_sso_config
Revises: 0005_idempotency_hardening
Create Date: 2025-02-15 00:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_sso_config"
down_revision: Union[str, None] = "0005_idempotency_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sso_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organization.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("group_claim", sa.Text(), nullable=False, server_default="groups"),
        sa.Column("group_to_role_admin", sa.Text(), nullable=True),
        sa.Column("group_to_role_manager", sa.Text(), nullable=True),
        sa.Column("group_to_role_member", sa.Text(), nullable=True),
        sa.Column(
            "allowed_embed_origins",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )


def downgrade() -> None:
    op.drop_table("sso_config")