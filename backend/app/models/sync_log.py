from __future__ import annotations

import uuid

from sqlalchemy import Enum as SAEnum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import SyncDirection, SyncEntity, SyncStatus, SyncTrigger


class SyncLog(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "sync_log"

    direction: Mapped[SyncDirection] = mapped_column(
        SAEnum(SyncDirection, name="sync_direction", native_enum=True), nullable=False
    )
    entity: Mapped[SyncEntity] = mapped_column(
        SAEnum(SyncEntity, name="sync_entity", native_enum=True), nullable=False
    )
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    gh_node_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    trigger: Mapped[SyncTrigger] = mapped_column(
        SAEnum(SyncTrigger, name="sync_trigger", native_enum=True), nullable=False
    )
    request_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    response_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[SyncStatus] = mapped_column(
        SAEnum(SyncStatus, name="sync_status", native_enum=True), nullable=False
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)