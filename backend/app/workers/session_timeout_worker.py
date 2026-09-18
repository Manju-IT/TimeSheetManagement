from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.models.enums import LogoutReason
from app.models.organization import Organization
from app.models.user import AppUser
from app.models.user_session import UserSession
from app.models.work_session import WorkSession
from app.services import attendance_service, session_service
from app.utils.timezone import work_date_for

log = get_logger("app.worker.session_timeout")

_TICK_SECONDS = 60
_BATCH = 50


async def _tick() -> None:
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=settings.AUTO_LOGOUT_MINUTES)

        stale = list(
            (
                await db.execute(
                    select(WorkSession)
                    .where(WorkSession.logout_at.is_(None), WorkSession.login_at < cutoff)
                    .with_for_update(skip_locked=True)
                    .limit(_BATCH)
                )
            ).scalars()
        )
        if not stale:
            return

        for ws in stale:
            last_seen = (
                await db.execute(
                    select(UserSession.last_seen_at)
                    .where(UserSession.user_id == ws.user_id)
                    .order_by(UserSession.last_seen_at.desc().nullslast())
                    .limit(1)
                )
            ).scalar_one_or_none()

            activity = last_seen or ws.login_at
            if activity > cutoff:
                continue  # user is still active; leave the session open

            await session_service.close_session(
                db,
                ws,
                logout_at=activity,
                reason=LogoutReason.timeout,
                logout_event_id=None,
            )

            # Recompute attendance for the day the session was bucketed into.
            try:
                app_user = (
                    await db.execute(select(AppUser).where(AppUser.id == ws.user_id))
                ).scalar_one()
                org = (
                    await db.execute(
                        select(Organization).where(Organization.id == app_user.org_id)
                    )
                ).scalar_one()
                tz = app_user.timezone or org.default_timezone
                wd = work_date_for(ws.login_at, tz, org.workday_cutoff)
                await attendance_service.recompute_day(db, ws.user_id, wd)
            except Exception:
                log.exception("timeout_recompute_failed", work_session_id=str(ws.id))

            log.info(
                "session_timed_out",
                work_session_id=str(ws.id),
                user_id=str(ws.user_id),
                closed_at=activity.isoformat(),
            )

        await db.commit()


async def run_forever() -> None:
    log.info("session_timeout_worker_started", tick_seconds=_TICK_SECONDS)
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("session_timeout_worker_tick_failed")
        await asyncio.sleep(_TICK_SECONDS)