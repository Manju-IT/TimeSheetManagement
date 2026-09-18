from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import GeoEventType, GeoPermission


class GeoEvent(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "geo_event"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_type: Mapped[GeoEventType] = mapped_column(
        SAEnum(GeoEventType, name="geo_event_type", native_enum=True), nullable=False
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    client_reported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    accuracy_m: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    geo_permission: Mapped[GeoPermission] = mapped_column(
        SAEnum(GeoPermission, name="geo_permission", native_enum=True),
        nullable=False,
        default=GeoPermission.unavailable,
    )
    place_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_site.id", ondelete="SET NULL"), nullable=True
    )
    inside_site: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    device_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    