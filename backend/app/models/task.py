from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import GhContentType, SyncState, TaskSource


class Task(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "task"
    __table_args__ = (
        Index("ix_task_project_active", "project_id", "is_active"),
        Index(
            "uq_task_gh_item_node_id",
            "gh_item_node_id",
            unique=True,
            postgresql_where=text("gh_item_node_id IS NOT NULL"),
        ),
        Index("ix_task_sync_state", "sync_state"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(Text, nullable=False, default="Todo")
    assignee_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    source: Mapped[TaskSource] = mapped_column(
        SAEnum(TaskSource, name="task_source", native_enum=True),
        nullable=False,
        default=TaskSource.manual,
    )
    gh_item_node_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    gh_content_type: Mapped[GhContentType | None] = mapped_column(
        SAEnum(GhContentType, name="gh_content_type", native_enum=True), nullable=True
    )
    gh_issue_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gh_repo: Mapped[str | None] = mapped_column(Text, nullable=True)
    gh_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    gh_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    local_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    sync_state: Mapped[SyncState] = mapped_column(
        SAEnum(SyncState, name="task_sync_state", native_enum=True),
        nullable=False,
        default=SyncState.synced,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    project: Mapped["Project"] = relationship(back_populates="tasks")  # noqa: F821