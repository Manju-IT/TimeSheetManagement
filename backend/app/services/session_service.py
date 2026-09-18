from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import LogoutReason
from app.models.work_session import WorkSession


async def get_active_session(
    db: AsyncSession, user_id: uuid.UUID, *, for_update: bool = False
) -> WorkSession | None:
    stmt = select(WorkSession).where(
        WorkSession.user_id == user_id, WorkSession.logout_at.is_(None)
    )
    if for_update:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


async def close_session(
    db: AsyncSession,
    session: WorkSession,
    *,
    logout_at: datetime,
    reason: LogoutReason,
    logout_event_id: uuid.UUID | None,
) -> WorkSession:
    """Close a session. Idempotent: already-closed sessions are returned untouched."""
    if session.logout_at is not None:
        return session
    if logout_at < session.login_at:
        # Defensive: never produce a negative duration.
        logout_at = session.login_at
    session.logout_at = logout_at
    session.logout_reason = reason
    session.logout_event_id = logout_event_id
    session.session_seconds = int((logout_at - session.login_at).total_seconds())
    await db.flush()
    return session


async def last_seen_at_for_user(db: AsyncSession, user_id: uuid.UUID) -> datetime | None:
    """Activity heartbeat: latest last_seen_at across the user's sessions."""
    from app.models.user_session import UserSession

    row = (
        await db.execute(
            select(UserSession.last_seen_at)
            .where(UserSession.user_id == user_id)
            .order_by(UserSession.last_seen_at.desc().nullslast())
            .limit(1)
        )
    ).first()
    return row[0] if row else None