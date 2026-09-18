from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import LogoutReason


class WorkSession(UUIDPKMixin, TimestampMixin, Base):
    """One row per login. Active sessions have logout_at NULL (partial index enforces one per user)."""

    __tablename__ = "work_session"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    logout_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    logout_reason: Mapped[LogoutReason | None] = mapped_column(
        SAEnum(LogoutReason, name="logout_reason", native_enum=True), nullable=True
    )
    login_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("geo_event.id", ondelete="SET NULL"), nullable=True
    )
    logout_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("geo_event.id", ondelete="SET NULL"), nullable=True
    )
    # Kept as a plain column; recomputed by service on close.
    session_seconds: Mapped[int | None] = mapped_column(nullable=True)