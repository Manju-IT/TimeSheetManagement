from __future__ import annotations

import uuid

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import Role, UserStatus


class AppUser(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "app_user"
    __table_args__ = (
        UniqueConstraint("email", name="uq_app_user_email"),
        UniqueConstraint("ims_user_id", name="uq_app_user_ims_user_id"),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organization.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    ims_user_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    github_login: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    timezone: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[UserStatus] = mapped_column(
        SAEnum(UserStatus, name="user_status", native_enum=True),
        nullable=False,
        default=UserStatus.active,
    )

    organization: Mapped["Organization"] = relationship(back_populates="users")  # noqa: F821
    roles: Mapped[list["UserRole"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    identities: Mapped[list["ImsIdentity"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )
    teams: Mapped[list["TeamMember"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )


class UserRole(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "user_role"
    __table_args__ = (UniqueConstraint("user_id", "role", name="uq_user_role"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[Role] = mapped_column(
        SAEnum(Role, name="user_role_enum", native_enum=True),
        nullable=False,
    )

    user: Mapped[AppUser] = relationship(back_populates="roles")


class ImsIdentity(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "ims_identity"
    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_ims_identity_provider_subject"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    provider_subject: Mapped[str] = mapped_column(Text, nullable=False)

    user: Mapped[AppUser] = relationship(back_populates="identities")