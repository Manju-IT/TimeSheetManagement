from __future__ import annotations

import asyncio
import contextlib
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.exceptions import AppError
from app.core.logging import configure_logging, get_logger, request_id_var
from app.core.redis import close_redis
from app.workers import (
    attendance_reconcile_worker,
    github_sync_worker,
    session_timeout_worker,
)
from app.core.embed import get_allowed_frame_ancestors

configure_logging(settings.LOG_LEVEL)
log = get_logger("app.main")

_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}




@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN001, ARG001
    log.info(
        "startup",
        env=settings.APP_ENV,
        local_dev_auth=settings.LOCAL_DEV_AUTH,
    )

    timeout_task = asyncio.create_task(
        session_timeout_worker.run_forever()
    )

    reconcile_task = asyncio.create_task(
        attendance_reconcile_worker.run_forever()
    )

    github_task = asyncio.create_task(
        github_sync_worker.run_forever()
    )

    try:
        yield
    finally:
        for task in (timeout_task, reconcile_task, github_task):
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

        await close_redis()
        log.info("shutdown")


app = FastAPI(
    title=settings.APP_NAME,
    version="0.4.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_strings,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-request-id"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):  # noqa: ANN001
    rid = request.headers.get("x-request-id") or str(uuid.uuid4())
    token = request_id_var.set(rid)
    try:
        response = await call_next(request)
    finally:
        request_id_var.reset(token)
    response.headers["x-request-id"] = rid
    return response


    
@app.middleware("http")
async def security_headers(request: Request, call_next):  # noqa: ANN001
    """Emits CSP + a small set of hardened response headers.

    `frame-ancestors` is the modern, spec-compliant way to control embedding.
    `X-Frame-Options` is intentionally NOT set: on some browsers a stale
    X-Frame-Options value overrides CSP, and we want a single source of truth.
    """
    response = await call_next(request)

    ancestors = await get_allowed_frame_ancestors()
    if ancestors:
        response.headers["Content-Security-Policy"] = (
            "frame-ancestors 'self' " + " ".join(sorted(ancestors))
        )
    else:
        response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Declare geolocation usage (informational; the iframe parent must still
    # allow it via allow="geolocation").
    response.headers["Permissions-Policy"] = "geolocation=(self), camera=(), microphone=()"
    return response


@app.middleware("http")
async def csrf_origin_guard(request: Request, call_next):  # noqa: ANN001
    if request.method not in _CSRF_SAFE_METHODS:
        origin = request.headers.get("origin") or request.headers.get("referer")
        if origin:
            # allowed = settings.cors_origins
            allowed = settings.cors_origin_strings
            if not any(origin.startswith(o) for o in allowed):
                return ORJSONResponse(
                    status_code=403,
                    content={
                        "error": {
                            "code": "CSRF_ORIGIN_REJECTED",
                            "message": "Request origin is not allowed",
                            "details": {"origin": origin},
                        }
                    },
                )
    return await call_next(request)


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError):  # noqa: ANN001
    headers: dict[str, str] = {}
    if exc.http_status == 429:
        ra = exc.details.get("retry_after_seconds")
        if isinstance(ra, (int, float)) and ra > 0:
            headers["Retry-After"] = str(max(1, int(ra)))
        headers["X-RateLimit-Scope"] = str(exc.details.get("scope", "unknown"))
    return ORJSONResponse(status_code=exc.http_status, content=exc.to_dict(), headers=headers)

@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):  # noqa: ANN001
    return ORJSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request payload failed validation",
                "details": {"errors": exc.errors()},
            }
        },
    )


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_v1_router, prefix="/api/v1")