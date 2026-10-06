from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
import uuid
from app.models.base import Base, TimestampMixin, UUIDPKMixin


class IdempotencyKey(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "idempotency_key"
    __table_args__ = (UniqueConstraint("scope", "key", name="uq_idempotency_scope_key"),)

    scope: Mapped[str] = mapped_column(Text, nullable=False)
    key: Mapped[str] = mapped_column(Text, nullable=False)
    request_hash: Mapped[str] = mapped_column(Text, nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    response_body: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    state: Mapped[str] = mapped_column(Text, nullable=False, default="complete")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    def is_pending_stale(self, *, now: datetime | None = None) -> bool:
        if self.state != "pending":
            return False
        if self.locked_until is None:
            return True
        now = now or datetime.now(timezone.utc)
        return self.locked_until <= now