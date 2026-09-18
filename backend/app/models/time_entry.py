from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import TimeEntryStatus


class TimeEntry(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "time_entry"
    __table_args__ = (
        CheckConstraint(
            "duration_minutes BETWEEN 1 AND 1440", name="ck_time_entry_duration_range"
        ),
        UniqueConstraint(
            "user_id", "client_idempotency_key", name="uq_time_entry_user_idempotency"
        ),
        Index("ix_time_entry_user_date", "user_id", "work_date"),
        Index("ix_time_entry_project_date", "project_id", "work_date"),
        Index("ix_time_entry_task", "task_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project.id", ondelete="RESTRICT"),
        nullable=False,
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("task.id", ondelete="SET NULL"), nullable=True
    )
    task_title_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    billable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[TimeEntryStatus] = mapped_column(
        SAEnum(TimeEntryStatus, name="time_entry_status", native_enum=True),
        nullable=False,
        default=TimeEntryStatus.draft,
    )
    # Bumped on every write so clients can detect conflicting edits.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    client_idempotency_key: Mapped[str | None] = mapped_column(Text, nullable=True)

    code_links: Mapped[list["CodeLink"]] = relationship(  # noqa: F821
        back_populates="time_entry", cascade="all, delete-orphan", lazy="selectin"
    )