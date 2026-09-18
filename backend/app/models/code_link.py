from __future__ import annotations

import uuid

from sqlalchemy import Enum as SAEnum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import CodeLinkType


class CodeLink(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "code_link"

    time_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("time_entry.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    link_type: Mapped[CodeLinkType] = mapped_column(
        SAEnum(CodeLinkType, name="code_link_type", native_enum=True),
        nullable=False,
        default=CodeLinkType.other,
    )
    repo: Mapped[str | None] = mapped_column(Text, nullable=True)
    ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    number: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    time_entry: Mapped["TimeEntry"] = relationship(back_populates="code_links")  # noqa: F821