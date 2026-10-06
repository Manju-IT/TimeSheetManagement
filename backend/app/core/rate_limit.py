"""Redis-backed sliding-window rate limiter.

Design:
  - One sorted set per (scope, identity). Members are unique per request.
  - Lua script performs the remove-expired / count / decide / add atomically.
  - Window is a rolling window, not a fixed bucket — no burst at boundaries.
  - Identity is resolved WITHOUT a DB query: signature-verified session cookie
    for authenticated requests, IP hash for anonymous. This keeps the limiter
    cheap enough to run on every request.

No business logic lives here. Callers choose scope / limit / window.
"""
from __future__ import annotations

import hashlib
import time
import uuid
from dataclasses import dataclass
from typing import Final

from redis.asyncio import Redis

from app.core.config import settings

_SLIDING_WINDOW_LUA: Final[str] = """
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now_ms - window_ms)
local count = redis.call('ZCARD', key)

if count >= limit then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    if #oldest >= 2 then
        local oldest_ms = tonumber(oldest[2])
        local retry_after_ms = (oldest_ms + window_ms) - now_ms
        if retry_after_ms < 1 then retry_after_ms = 1 end
        return {0, retry_after_ms}
    end
    return {0, window_ms}
end

redis.call('ZADD', key, now_ms, member)
redis.call('PEXPIRE', key, window_ms + 1000)
return {1, limit - count - 1}
"""


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    remaining: int
    retry_after_seconds: int
    limit: int
    window_seconds: int


class RateLimiter:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        self._script = redis.register_script(_SLIDING_WINDOW_LUA)

    async def check(
        self,
        *,
        scope: str,
        identity: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        key = f"rl:{scope}:{identity}"
        now_ms = int(time.time() * 1000)
        window_ms = window_seconds * 1000
        member = f"{now_ms}:{uuid.uuid4().hex[:8]}"

        try:
            allowed_raw, value = await self._script(
                keys=[key],
                args=[now_ms, window_ms, limit, member],
            )
        except Exception:
            # Fail-open: if Redis is down, do not block the app.
            return RateLimitDecision(
                allowed=True,
                remaining=limit,
                retry_after_seconds=0,
                limit=limit,
                window_seconds=window_seconds,
            )

        allowed = bool(int(allowed_raw))
        if allowed:
            return RateLimitDecision(
                allowed=True,
                remaining=int(value),
                retry_after_seconds=0,
                limit=limit,
                window_seconds=window_seconds,
            )
        retry_after = max(1, int(int(value) / 1000))
        return RateLimitDecision(
            allowed=False,
            remaining=0,
            retry_after_seconds=retry_after,
            limit=limit,
            window_seconds=window_seconds,
        )


# ---- identity resolution --------------------------------------------------- #

def identity_from_request(request) -> tuple[str, str]:  # noqa: ANN001
    """Returns (kind, identity). kind ∈ {'user', 'anon'}.

    Uses the signature-verified session cookie. No DB query, no dependency on
    the auth chain — the limiter runs even for unauthenticated requests.
    """
    from app.core.security import decode_session_token
    from app.core.exceptions import Unauthenticated

    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if token:
        try:
            claims = decode_session_token(token)
            return "user", f"u:{claims.user_id}"
        except Unauthenticated:
            pass
    ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(ip.encode("utf-8")).hexdigest()[:16]
    return "anon", f"a:{ip_hash}"


# ---- limiter singleton ----------------------------------------------------- #

_limiter: RateLimiter | None = None


def get_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        from app.core.redis import get_redis
        _limiter = RateLimiter(get_redis())
    return _limiter


# ---- named policies -------------------------------------------------------- #

POLICIES: Final[dict[str, tuple[int, int]]] = {
    # name                              limit, window_seconds
    "auth.start_login":                 (10, 60),
    "auth.callback":                    (20, 60),
    "auth.dev_login":                   (10, 60),
    "auth.logout":                      (30, 60),

    "attendance.check_in":              (30, 60),
    "attendance.check_out":             (30, 60),
    "attendance.read":                  (300, 60),

    "time_entry.create":                (60, 60),
    "time_entry.update":                (120, 60),
    "time_entry.delete":                (60, 60),
    "time_entry.transition":            (30, 60),

    "timesheet.submit":                 (10, 60),
    "timesheet.review":                 (30, 60),
    "timesheet.reopen":                 (10, 60),

    "task.sync":                        (20, 60),
    "task.conflict_resolve":            (20, 60),

    "github.manual_sync":               (10, 60),
    "github.full_resync":               (2, 3600),

    "reports.read":                     (30, 60),
    "admin.read":                       (300, 60),
    "admin.write":                      (60, 60),

    "global.api":                       (1200, 60),
    "global.anon":                      (120, 60),
}


def policy(name: str) -> tuple[int, int]:
    try:
        return POLICIES[name]
    except KeyError as e:
        raise RuntimeError(f"Unknown rate-limit policy: {name}") from e