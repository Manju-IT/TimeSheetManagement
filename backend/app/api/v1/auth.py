from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.rate_limit import rate_limit
from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import Unauthenticated
from app.core.logging import get_logger
from app.core.permissions import CurrentUser, permissions_for
from app.schemas.auth import (
    AuthConfigResponse,
    DevLoginRequest,
    LogoutResponse,
    MeResponse,
    StartLoginResponse,
)
from app.core.embed import get_allowed_frame_ancestors
from app.services import auth_service


log = get_logger("app.api.auth")

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)


# ============================================================================
# Request helpers
# ============================================================================


def _client_ip(request: Request) -> str | None:
    """
    Return the direct client IP.

    X-Forwarded-For is intentionally not trusted here until the application
    is deployed behind a trusted reverse proxy with explicit proxy handling.
    """
    return request.client.host if request.client else None


def _client_embedded(request: Request) -> bool:
    """
    Return True when the frontend is operating in embedded mode.

    The frontend sends:
        X-Embedded: 1

    when its current URL contains:
        ?embedded=1

    This value is used only for authentication/cookie/navigation context.
    It does not affect authorization or RBAC.
    """
    return (request.headers.get("x-embedded") or "").strip() == "1"


# ============================================================================
# Session cookie helpers
# ============================================================================


def _set_session_cookie(
    response: Response,
    token: str,
    expires_in: int,
    *,
    embedded: bool,
) -> None:
    """
    Set the application session cookie.

    Embedded/iframe contexts require:
        SameSite=None
        Secure=True

    Normal contexts continue using the configured application cookie policy.
    """

    if embedded:
        samesite = "none"
        secure = True
    else:
        samesite = settings.SESSION_COOKIE_SAMESITE
        secure = settings.SESSION_COOKIE_SECURE

    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        max_age=expires_in,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )


def _clear_session_cookie(
    response: Response,
) -> None:
    """
    Clear the application session cookie.

    Use the configured SameSite value for the normal application cookie.
    """

    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
        samesite=settings.SESSION_COOKIE_SAMESITE,
    )


# ============================================================================
# Authentication configuration
# ============================================================================



@router.get("/config", response_model=AuthConfigResponse)
async def auth_config(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthConfigResponse:
    from app.services.auth_service import _sso_enabled
    return AuthConfigResponse(
        oidc_enabled=await _sso_enabled(db),
        local_dev_auth=settings.LOCAL_DEV_AUTH and settings.APP_ENV in ("local", "dev"),
        app_name=settings.APP_NAME,
        embedded=_client_embedded(request),
        frame_ancestors=await get_allowed_frame_ancestors(),
    )


# ============================================================================
# OIDC login
# ============================================================================


@router.post(
    "/login",
    response_model=StartLoginResponse,
    dependencies=[Depends(rate_limit("auth.start_login"))],
)
async def start_login(
    request: Request,
    return_to: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> StartLoginResponse:
    """
    Start the OIDC authorization-code + PKCE flow.

    The embedded context is persisted inside the short-lived OIDC state so
    that it survives the external identity-provider redirect.
    """

    url = await auth_service.start_oidc_login(
        db,
        return_to=return_to,
        ip=_client_ip(request),
        ua=request.headers.get("user-agent"),
        embedded=_client_embedded(request),
    )

    # The state is contained inside the authorization URL.
    # Keep the response field for API compatibility.
    return StartLoginResponse(
        authorize_url=url,
        state="",
    )


# ============================================================================
# OIDC callback
# ============================================================================


@router.get(
    "/callback",
    dependencies=[Depends(rate_limit("auth.callback"))],
)
async def oidc_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Complete the OIDC authorization-code + PKCE flow.

    The embedded flag for a successful flow is restored from the short-lived
    Redis login state created by start_oidc_login().
    """

    # This is used for error redirects because the OIDC flow may fail before
    # complete_oidc_login() has had an opportunity to recover the persisted
    # embedded state.
    embedded_from_request = _client_embedded(request)

    # ------------------------------------------------------------------
    # Provider returned an OAuth/OIDC error.
    # ------------------------------------------------------------------

    if error:
        suffix = "&embedded=1" if embedded_from_request else ""

        return RedirectResponse(
            url=(
                f"{settings.FRONTEND_URL}/login"
                f"?error={error}{suffix}"
            ),
            status_code=status.HTTP_302_FOUND,
        )

    # ------------------------------------------------------------------
    # Required callback parameters are missing.
    # ------------------------------------------------------------------

    if not code or not state:
        suffix = "&embedded=1" if embedded_from_request else ""

        return RedirectResponse(
            url=(
                f"{settings.FRONTEND_URL}/login"
                f"?error=missing_params{suffix}"
            ),
            status_code=status.HTTP_302_FOUND,
        )

    # ------------------------------------------------------------------
    # Complete OIDC authentication.
    #
    # complete_oidc_login() restores the embedded flag from Redis and
    # returns it together with the issued session and destination URL.
    # ------------------------------------------------------------------

    issued, return_to, embedded = await auth_service.complete_oidc_login(
        db,
        code=code,
        state=state,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    # ------------------------------------------------------------------
    # Redirect back to the frontend.
    # ------------------------------------------------------------------

    response = RedirectResponse(
        url=return_to,
        status_code=status.HTTP_302_FOUND,
    )

    # ------------------------------------------------------------------
    # Set the session cookie according to the authentication context.
    #
    # Normal:
    #   configured SameSite/Secure settings
    #
    # Embedded:
    #   SameSite=None
    #   Secure=True
    # ------------------------------------------------------------------

    _set_session_cookie(
        response,
        issued.token,
        settings.SESSION_TTL_SECONDS,
        embedded=embedded,
    )

    return response


# ============================================================================
# Local development login
# ============================================================================


@router.post(
    "/dev-login",
    response_model=MeResponse,
    dependencies=[Depends(rate_limit("auth.dev_login"))],
)
async def dev_login(
    payload: DevLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Development-only local login.

    The embedded context is read directly from X-Embedded because this flow
    does not perform an external OIDC redirect.
    """

    issued = await auth_service.dev_login(
        db,
        email=str(payload.email),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    me = await _build_me(
        db,
        issued.user.id,
    )

    response = JSONResponse(
        content=me.model_dump(mode="json"),
    )

    _set_session_cookie(
        response,
        issued.token,
        settings.SESSION_TTL_SECONDS,
        embedded=_client_embedded(request),
    )

    return response


# ============================================================================
# Logout
# ============================================================================


@router.post(
    "/logout",
    response_model=LogoutResponse,
    dependencies=[Depends(rate_limit("auth.logout"))],
)
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Log out the current local application session.

    If an active local session exists, revoke it server-side before clearing
    the browser cookie.
    """

    user = None

    try:
        user = await get_current_user(
            request,
            db,
        )
    except Unauthenticated:
        # Logout should remain idempotent even when the local session has
        # already expired or has been revoked.
        pass

    if user is not None:
        sid = getattr(
            request.state,
            "session_id",
            None,
        )

        if sid is not None:
            await auth_service.logout(
                db,
                user_id=user.id,
                session_id=sid,
                ip=_client_ip(request),
            )

    end_url = await auth_service.ims_end_session_url()

    response = JSONResponse(
        content=LogoutResponse(
            ok=True,
            ims_end_session_url=end_url,
        ).model_dump(),
    )

    _clear_session_cookie(response)

    return response


# ============================================================================
# Current user
# ============================================================================


@router.get(
    "/me",
    response_model=MeResponse,
)
async def me(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    """
    Return the latest application user representation.
    """

    return await _build_me(
        db,
        user.id,
    )


# ============================================================================
# Current-user response builder
# ============================================================================


async def _build_me(
    db: AsyncSession,
    user_id,
) -> MeResponse:  # noqa: ANN001
    """
    Build the frontend-facing authenticated-user response.

    The user is deliberately re-read from the database so that role,
    permission, profile, and organization changes are reflected immediately.
    """

    from sqlalchemy import select

    from app.models.user import AppUser, UserRole

    user = (
        await db.execute(
            select(AppUser).where(
                AppUser.id == user_id,
            )
        )
    ).scalar_one()

    roles = list(
        (
            await db.execute(
                select(UserRole.role).where(
                    UserRole.user_id == user.id,
                )
            )
        ).scalars()
    )

    role_names = sorted(
        {
            role.value
            for role in roles
        }
    )

    perms = sorted(
        permissions_for(
            frozenset(roles)
        )
    )

    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        timezone=user.timezone,
        org_id=user.org_id,
        github_login=user.github_login,
        roles=role_names,
        permissions=perms,
    )