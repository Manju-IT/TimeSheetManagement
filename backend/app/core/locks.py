from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def acquire_advisory_locks(db: AsyncSession, *keys: str) -> None:
    """Transaction-scoped advisory locks, keyed by stable strings.

    Released automatically at COMMIT/ROLLBACK. Safe to call repeatedly; ordering
    by sorted key name prevents deadlocks between callers.
    """
    for key in sorted(set(keys)):
        await db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:k)::bigint)"),
            {"k": key},
        )