from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Team(UUIDPKMixin, TimestampMixin, Base):
    """Manager scope. A manager may own many teams; a member may belong to many."""

    __tablename__ = "team"
    __table_args__ = (UniqueConstraint("org_id", "name", name="uq_team_org_name"),)

    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organization.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)

    members: Mapped[list["TeamMember"]] = relationship(
        back_populates="team", cascade="all, delete-orphan"
    )


class TeamMember(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "team_member"
    __table_args__ = (UniqueConstraint("team_id", "user_id", name="uq_team_member"),)

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Distinguish "assigned manager of this team" vs regular member for authz.
    is_manager: Mapped[bool] = mapped_column(nullable=False, default=False)

    team: Mapped[Team] = relationship(back_populates="members")
    user: Mapped["AppUser"] = relationship(back_populates="teams")  # noqa: F821