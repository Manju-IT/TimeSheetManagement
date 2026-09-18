from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Enum as SAEnum, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import ProjectSource


class Project(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "project"
    __table_args__ = (UniqueConstraint("org_id", "name", name="uq_project_org_name"),)

    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organization.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[ProjectSource] = mapped_column(
        SAEnum(ProjectSource, name="project_source", native_enum=True),
        nullable=False,
        default=ProjectSource.manual,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    organization: Mapped["Organization"] = relationship(back_populates="projects")  # noqa: F821
    github_link: Mapped["GitHubProjectLink | None"] = relationship(  # noqa: F821
        back_populates="project", uselist=False, cascade="all, delete-orphan"
    )
    tasks: Mapped[list["Task"]] = relationship(back_populates="project")  # noqa: F821