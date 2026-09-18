from __future__ import annotations

import uuid
from datetime import time

from sqlalchemy import ForeignKey, Text, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Organization(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "organization"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    default_timezone: Mapped[str] = mapped_column(Text, nullable=False, default="UTC")
    workday_cutoff: Mapped[time | None] = mapped_column(Time, nullable=True)

    users: Mapped[list["AppUser"]] = relationship(  # noqa: F821
        back_populates="organization", cascade="all, delete-orphan"
    )
    sites: Mapped[list["WorkSite"]] = relationship(  # noqa: F821
        back_populates="organization", cascade="all, delete-orphan"
    )
    projects: Mapped[list["Project"]] = relationship(  # noqa: F821
        back_populates="organization", cascade="all, delete-orphan"
    )


class OrgPolicy(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "org_policy"

    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organization.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    workday_hours: Mapped[int] = mapped_column(nullable=False, default=8)
    variance_threshold_minutes: Mapped[int] = mapped_column(nullable=False, default=60)
    auto_logout_minutes: Mapped[int] = mapped_column(nullable=False, default=600)
    allow_login_without_location: Mapped[bool] = mapped_column(nullable=False, default=True)
    location_retention_days: Mapped[int] = mapped_column(nullable=False, default=365)