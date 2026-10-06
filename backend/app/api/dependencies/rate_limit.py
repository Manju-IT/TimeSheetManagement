from __future__ import annotations

from fastapi import Depends, Request

from app.core.exceptions import RateLimited
from app.core.rate_limit import get_limiter, identity_from_request, policy


def rate_limit(policy_name: str):
    """FastAPI dependency factory. Usage:

        @router.post("/check-in", dependencies=[Depends(rate_limit("attendance.check_in"))])
    """

    async def _dep(request: Request) -> None:
        limit, window = policy(policy_name)
        _, identity = identity_from_request(request)
        decision = await get_limiter().check(
            scope=policy_name, identity=identity, limit=limit, window_seconds=window
        )
        if not decision.allowed:
            raise RateLimited(
                "Too many requests",
                details={
                    "scope": policy_name,
                    "limit": decision.limit,
                    "window_seconds": decision.window_seconds,
                    "retry_after_seconds": decision.retry_after_seconds,
                },
            )

    return _dep