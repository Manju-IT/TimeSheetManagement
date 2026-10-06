from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# ============================================================
# Declarative Base
# ============================================================

class Base(DeclarativeBase):
    """
    Base class for all SQLAlchemy ORM models.
    """


# ============================================================
# UUID Primary Key
# ============================================================

class UUIDPKMixin:
    """
    Provides a UUID primary key named `id`.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )


# ============================================================
# Timestamp Fields
# ============================================================

class TimestampMixin:
    """
    Provides timezone-aware creation and modification timestamps.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )