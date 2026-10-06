"""Iframe embedding policy.

`frame-ancestors` in the Content-Security-Policy response header is the modern
replacement for X-Frame-Options. It lists the origins permitted to embed the
app in an <iframe>. We combine:

    1. EMBED_ALLOWED_ORIGINS env var (deployment baseline)
    2. sso_config.allowed_embed_origins rows (per-org, admin-managed)

and cache the union for a short window so the middleware does not hit Redis or
PostgreSQL on every request. The admin SSO update endpoint invalidates the
cache immediately.
"""
from __future__ import annotations

import time

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("app.embed")

_INPROC_TTL_SECONDS = 30
_cache: tuple[float, list[str]] | None = None


def _env_origins() -> list[str]:
    return list(settings.embed_origins_env)


async def _load_db_origins() -> list[str]:
    """Read per-org embed origins. Returns [] on any failure."""
    try:
        from sqlalchemy import select
        from app.core.database import AsyncSessionLocal
        from app.models.organization import SSOConfig

        async with AsyncSessionLocal() as db:
            rows = list((await db.execute(select(SSOConfig))).scalars())
    except Exception:
        log.warning("embed_db_read_failed", exc_info=True)
        return []

    seen: list[str] = []
    for row in rows:
        for origin in row.allowed_embed_origins or []:
            origin = (origin or "").strip()
            if not origin:
                continue
            if origin not in seen:
                seen.append(origin)
    return seen


async def get_allowed_frame_ancestors() -> list[str]:
    """Union of env baseline and DB-configured embed origins, cached."""
    global _cache
    now = time.monotonic()
    if _cache is not None and _cache[0] > now:
        return _cache[1]

    origins = _env_origins()
    for o in await _load_db_origins():
        if o not in origins:
            origins.append(o)

    _cache = (now + _INPROC_TTL_SECONDS, origins)
    return origins


def invalidate_cache() -> None:
    """Called by the admin SSO update endpoint after persisting new origins."""
    global _cache
    _cache = None