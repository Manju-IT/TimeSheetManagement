"""Concurrency-safe, HTTP-level idempotency store.

Pattern (see `idempotent_call`):
  1. Compute a hash of the request body and a per-identity scope.
  2. INSERT (scope, key) with state='pending' and a 60-second lease.
     - If INSERT succeeds → we own the row; run the handler.
     - If IntegrityError → someone else is (or was) processing:
         a. state='complete' → return the stored response.
         b. state='pending' + fresh lease → 409 IDEMPOTENCY_CONFLICT.
         c. state='pending' + stale lease → atomically steal the lease,
            then run the handler.
  3. On success: state='complete', store the JSON response, release the lease.
  4. On failure: delete the pending row so the client can retry cleanly.

This is not "check then insert". The uniqueness constraint on (scope, key) is
the source of truth, and the lease row-lock makes the steal atomic.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

from fastapi import Request
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    IdempotencyConflict,
    IdempotencyKeyReused,
)
from app.core.logging import get_logger
from app.core.rate_limit import identity_from_request
from app.models.idempotency import IdempotencyKey

log = get_logger("app.idempotency")

_LEASE_SECONDS = 60
_MAX_KEY_LENGTH = 200
_MIN_KEY_LENGTH = 8


def _canonicalize_body(raw: bytes) -> str:
    """Stable hash of the request body. Whitespace-insensitive for JSON is a
    nice-to-have; SHA-256 of the raw bytes is enough here because every client
    serializes the same way across retries."""
    return hashlib.sha256(raw).hexdigest()


def _extract_key(request: Request) -> str | None:
    key = request.headers.get("idempotency-key") or request.headers.get("Idempotency-Key")
    if key is None:
        return None
    key = key.strip()
    if len(key) < _MIN_KEY_LENGTH or len(key) > _MAX_KEY_LENGTH:
        raise IdempotencyConflict("Idempotency-Key must be 8–200 characters")
    return key


async def idempotent_call(
    db: AsyncSession,
    *,
    request: Request,
    scope: str,
    handler: Callable[[], Awaitable[Any]],
    required: bool = False,
) -> Any:
    """Run `handler` at most once per (scope, identity, Idempotency-Key).

    On cache hit, returns the previously stored response (as a dict — FastAPI's
    response_model re-validates it, so the wire format is identical).

    On concurrent call, either blocks on the unique index (winner) or returns
    409 IDEMPOTENCY_CONFLICT (loser with a fresh lease).
    """
    key = _extract_key(request)
    if key is None:
        if required:
            from app.core.exceptions import IdempotencyKeyRequired
            raise IdempotencyKeyRequired()
        return await handler()

    kind, identity = identity_from_request(request)
    full_scope = f"{scope}:{identity}"

    raw_body = await request.body()
    request_hash = _canonicalize_body(raw_body)

    now = datetime.now(timezone.utc)
    locked_until = now + timedelta(seconds=_LEASE_SECONDS)

    # ---- Step 1: try to claim the row ---------------------------------- #
    owns_row = False
    try:
        db.add(
            IdempotencyKey(
                scope=full_scope,
                key=key,
                request_hash=request_hash,
                status_code=0,
                response_body={},
                state="pending",
                locked_until=locked_until,
            )
        )
        await db.flush()
        await db.commit()
        owns_row = True
    except IntegrityError:
        # Concurrent insert (winner holds the row, or a prior attempt exists).
        await db.rollback()

    # ---- Step 2: if we don't own it, resolve the existing row ---------- #
    if not owns_row:
        existing = (
            await db.execute(
                select(IdempotencyKey).where(
                    IdempotencyKey.scope == full_scope,
                    IdempotencyKey.key == key,
                )
            )
        ).scalar_one()

        if existing.request_hash != request_hash:
            raise IdempotencyKeyReused(
                details={"scope": scope}
            )

        if existing.state == "complete":
            return existing.response_body

        # state == 'pending'
        if not existing.is_pending_stale(now=now):
            raise IdempotencyConflict(
                details={
                    "scope": scope,
                    "locked_until": existing.locked_until.isoformat()
                    if existing.locked_until
                    else None,
                }
            )

        # Stale lease. Try to steal it atomically.
        steal = await db.execute(
            update(IdempotencyKey)
            .where(
                IdempotencyKey.id == existing.id,
                IdempotencyKey.state == "pending",
                IdempotencyKey.locked_until <= now,
            )
            .values(locked_until=locked_until)
        )
        await db.commit()
        if steal.rowcount == 0:
            # Someone else stole it in the interim.
            raise IdempotencyConflict(details={"scope": scope})
        owns_row = True

    # ---- Step 3: run handler, persist the response --------------------- #
    try:
        result = await handler()
    except Exception:
        # Free the key so the client can retry cleanly with a corrected body.
        await db.rollback()
        await db.execute(
            delete(IdempotencyKey).where(
                IdempotencyKey.scope == full_scope,
                IdempotencyKey.key == key,
                IdempotencyKey.state == "pending",
            )
        )
        await db.commit()
        raise

    if hasattr(result, "model_dump"):
        response_data = result.model_dump(mode="json")
    elif isinstance(result, dict):
        response_data = result
    else:
        response_data = {"value": result}

    await db.execute(
        update(IdempotencyKey)
        .where(
            IdempotencyKey.scope == full_scope,
            IdempotencyKey.key == key,
        )
        .values(
            state="complete",
            status_code=200,
            response_body=response_data,
            locked_until=None,
        )
    )
    await db.commit()
    return result


# ---- retention ------------------------------------------------------------- #

async def prune_expired(db: AsyncSession, *, retention_hours: int = 24) -> int:
    """Delete keys older than `retention_hours`. Called by the reconcile worker."""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=retention_hours)
    result = await db.execute(
        delete(IdempotencyKey).where(IdempotencyKey.created_at < cutoff)
    )
    return result.rowcount or 0