from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class GitHubProjectLink(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "github_project_link"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    gh_owner: Mapped[str] = mapped_column(Text, nullable=False)
    gh_project_number: Mapped[int] = mapped_column(Integer, nullable=False)
    gh_project_node_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    default_repo: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sync_cursor: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="github_link")  # noqa: F821