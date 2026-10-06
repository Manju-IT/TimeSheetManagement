from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.idempotency import prune_expired
from app.core.logging import get_logger
from app.core.state_machines import (
    ATTENDANCE_DAY_TRANSITIONS,
    assert_transition,
)
from app.models.attendance_day import AttendanceDay
from app.models.enums import AttendanceStatus
from app.models.organization import Organization
from app.models.user import AppUser
from app.services import audit_service
from app.utils.timezone import work_date_for

log = get_logger("app.worker.attendance_reconcile")

_TICK_SECONDS = 3600  # hourly; the job is idempotent


async def _tick() -> None:
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)

        # Process days strictly before today's work_date for each user.
        users = list(
            (
                await db.execute(
                    select(AppUser)
                )
            ).scalars()
        )

        orgs = {
            o.id: o
            for o in (
                await db.execute(
                    select(Organization)
                )
            ).scalars()
        }

        for user in users:
            org = orgs.get(user.org_id)

            if org is None:
                continue

            tz = (
                user.timezone
                or org.default_timezone
            )

            today_wd = work_date_for(
                now,
                tz,
                org.workday_cutoff,
            )

            stale = list(
                (
                    await db.execute(
                        select(AttendanceDay)
                        .where(
                            AttendanceDay.user_id == user.id,
                            AttendanceDay.work_date < today_wd,
                            AttendanceDay.status
                            == AttendanceStatus.open,
                        )
                        .with_for_update(
                            skip_locked=True
                        )
                    )
                ).scalars()
            )

            for day in stale:
                assert_transition(
                    ATTENDANCE_DAY_TRANSITIONS,
                    day.status.value,
                    AttendanceStatus.closed.value,
                    entity="attendance_day",
                    details={
                        "reason": "nightly_reconcile"
                    },
                )

                day.status = AttendanceStatus.closed

                await audit_service.record(
                    db,
                    actor_user_id=None,
                    action="attendance.close",
                    entity="attendance_day",
                    entity_id=day.id,
                    after={
                        "status": "closed",
                        "reason": "nightly_reconcile",
                    },
                )

        # ---------------------------------------------------------
        # Prune expired idempotency keys.
        # ---------------------------------------------------------
        try:
            purged = await prune_expired(
                db,
                retention_hours=24,
            )

            if purged:
                log.info(
                    "idempotency_keys_pruned",
                    count=purged,
                )

        except Exception:
            log.exception(
                "idempotency_prune_failed"
            )

        await db.commit()


async def run_forever() -> None:
    log.info(
        "attendance_reconcile_worker_started",
        tick_seconds=_TICK_SECONDS,
    )

    while True:
        try:
            await _tick()

        except asyncio.CancelledError:
            raise

        except Exception:
            log.exception(
                "attendance_reconcile_tick_failed"
            )

        await asyncio.sleep(
            _TICK_SECONDS
        )