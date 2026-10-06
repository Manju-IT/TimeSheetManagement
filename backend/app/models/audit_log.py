from sqlalchemy import ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
import uuid
from app.models.base import Base, TimestampMixin, UUIDPKMixin


class AuditLog(UUIDPKMixin, TimestampMixin, Base):
    """Append-only from the API. No update/delete endpoints exist."""

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_entity", "entity", "entity_id"),
        Index("ix_audit_actor_created", "actor_user_id", "created_at"),
        Index("ix_audit_log_org_created", "org_id", "created_at"),
    )

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="RESTRICT"),
        nullable=True,
    )
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organization.id", ondelete="RESTRICT"),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(Text, nullable=False)
    entity: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip: Mapped[str | None] = mapped_column(INET, nullable=True)