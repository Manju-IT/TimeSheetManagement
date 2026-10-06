from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import Forbidden, Unauthenticated, ValidationError
from app.core.logging import get_logger
from app.core.oidc import discovery_cache, verify_id_token
from app.core.redis import get_redis
from app.core.security import (
    decode_session_token,
    issue_session_token,
    make_pkce_pair,
    random_urlsafe,
)
from app.models.enums import UserStatus
from app.models.user import AppUser, UserRole
from app.models.user_session import UserSession
from app.services import audit_service, user_service


log = get_logger("app.auth_service")

_PKCE_PREFIX = "pkce:"
_PKCE_TTL_SECONDS = 600


@dataclass
class IssuedSession:
    user: AppUser
    roles: set
    token: str
    expires_at: datetime
    session_id: uuid.UUID


def _redis() -> Redis:
    return get_redis()


# ---------------------------------------------------------------------------
# SSO / OIDC configuration
# ---------------------------------------------------------------------------

async def _sso_enabled(db: AsyncSession) -> bool:
    """Return whether OIDC/SSO is enabled for the default organization.

    Database configuration takes precedence over the environment setting.

    Because the application does not have an authenticated session yet when
    starting the OIDC login flow, there is no user/org context available.
    The current application therefore uses the first/default organization.
    """

    from app.models.organization import Organization, SSOConfig

    org = (
        await db.execute(
            select(Organization).limit(1)
        )
    ).scalar_one_or_none()

    # If there is no organization configuration yet, preserve the
    # environment-based behavior.
    if org is None:
        return settings.OIDC_ENABLED

    cfg = (
        await db.execute(
            select(SSOConfig).where(
                SSOConfig.org_id == org.id
            )
        )
    ).scalar_one_or_none()

    # No DB configuration -> fall back to environment.
    if cfg is None:
        return settings.OIDC_ENABLED

    # DB configuration explicitly controls whether SSO is enabled.
    return cfg.enabled


# ---------------------------------------------------------------------------
# OIDC flow
# ---------------------------------------------------------------------------

async def start_oidc_login(
    db: AsyncSession,
    *,
    return_to: str | None,
    ip: str | None,
    ua: str | None,
    embedded: bool = False,
) -> str:
    """Start the OIDC authorization-code + PKCE flow."""

    # ------------------------------------------------------------------
    # Check database-controlled SSO enablement first.
    # ------------------------------------------------------------------

    if not await _sso_enabled(db):
        raise ValidationError("OIDC is not enabled")

    # ------------------------------------------------------------------
    # Environment configuration is still required for the actual OIDC
    # provider connection.
    # ------------------------------------------------------------------

    if not settings.OIDC_ISSUER or not settings.OIDC_CLIENT_ID:
        raise ValidationError("OIDC is not configured")

    # ------------------------------------------------------------------
    # Discover provider endpoints.
    # ------------------------------------------------------------------

    discovery = await discovery_cache.discovery()

    # ------------------------------------------------------------------
    # Generate PKCE verifier/challenge.
    # ------------------------------------------------------------------

    verifier, challenge = make_pkce_pair()

    # ------------------------------------------------------------------
    # Generate OAuth/OIDC state and nonce.
    # ------------------------------------------------------------------

    state = random_urlsafe(32)
    nonce = random_urlsafe(32)

    # ------------------------------------------------------------------
    # Persist short-lived login state in Redis.
    # ------------------------------------------------------------------

    payload = {
        "code_verifier": verifier,
        "nonce": nonce,
        "return_to": return_to or settings.FRONTEND_URL,
        "ip": ip,
        "ua": ua,
        "embedded": bool(embedded),
    }

    await _redis().setex(
        _PKCE_PREFIX + state,
        _PKCE_TTL_SECONDS,
        json.dumps(payload),
    )

    # ------------------------------------------------------------------
    # Build authorization request.
    # ------------------------------------------------------------------

    params = {
        "response_type": "code",
        "client_id": settings.OIDC_CLIENT_ID,
        "redirect_uri": settings.OIDC_REDIRECT_URI,
        "scope": settings.OIDC_SCOPES,
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }

    url = (
        discovery["authorization_endpoint"]
        + "?"
        + urlencode(params)
    )

    log.info(
        "oidc_login_started",
        state=state[:8] + "...",
    )

    return url


async def _exchange_code(
    code: str,
    verifier: str,
) -> dict[str, Any]:
    """Exchange an OIDC authorization code for tokens."""

    discovery = await discovery_cache.discovery()

    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.OIDC_REDIRECT_URI,
        "client_id": settings.OIDC_CLIENT_ID,
        "code_verifier": verifier,
    }

    headers = {
        "Accept": "application/json",
    }

    auth = None

    if settings.OIDC_CLIENT_SECRET:
        auth = (
            settings.OIDC_CLIENT_ID or "",
            settings.OIDC_CLIENT_SECRET,
        )

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            discovery["token_endpoint"],
            data=data,
            headers=headers,
            auth=auth,
        )

    if response.status_code != 200:
        log.warning(
            "oidc_token_exchange_failed",
            status=response.status_code,
        )
        raise Unauthenticated("Token exchange failed")

    return response.json()


async def _create_session(
    db: AsyncSession,
    user: AppUser,
    *,
    auth_method: str,
    ip: str | None,
    user_agent: str | None,
) -> IssuedSession:
    """Create an application session for an active user."""

    if user.status != UserStatus.active:
        raise Forbidden("Account is disabled")

    now = datetime.now(timezone.utc)

    session = UserSession(
        user_id=user.id,
        issued_at=now,
        expires_at=now + timedelta(
            seconds=settings.SESSION_TTL_SECONDS
        ),
        last_seen_at=now,
        ip=ip,
        user_agent=(user_agent or "")[:500] or None,
        auth_method=auth_method,
    )

    db.add(session)

    await db.flush()

    token, expires_at = issue_session_token(
        user.id,
        session.id,
    )

    roles = set(
        (
            await db.execute(
                select(UserRole.role).where(
                    UserRole.user_id == user.id
                )
            )
        ).scalars()
    )

    await audit_service.record(
        db,
        actor_user_id=user.id,
        action="auth.login",
        entity="user_session",
        entity_id=session.id,
        after={
            "auth_method": auth_method,
            "ip": ip,
        },
        ip=ip,
    )

    return IssuedSession(
        user=user,
        roles=roles,
        token=token,
        expires_at=expires_at,
        session_id=session.id,
    )


async def complete_oidc_login(
    db: AsyncSession,
    *,
    code: str,
    state: str,
    ip: str | None,
    user_agent: str | None,
) -> tuple[IssuedSession, str, bool]:
    """Complete the OIDC authorization-code flow.

    Returns:
        (issued_session, return_to_url)
    """

    # ------------------------------------------------------------------
    # Retrieve PKCE state from Redis.
    # ------------------------------------------------------------------

    raw = await _redis().get(
        _PKCE_PREFIX + state
    )

    if not raw:
        raise Unauthenticated(
            "Login state has expired or is invalid"
        )

    # ------------------------------------------------------------------
    # Consume state immediately.
    #
    # This prevents replay of the same authorization callback.
    # ------------------------------------------------------------------

    await _redis().delete(
        _PKCE_PREFIX + state
    )

    pkce = json.loads(raw)

    verifier: str = pkce["code_verifier"]
    nonce: str = pkce["nonce"]
    return_to: str = (
            pkce.get("return_to")
            or settings.FRONTEND_URL
        )
    embedded: bool = bool(pkce.get("embedded", False))

    # ------------------------------------------------------------------
    # Exchange authorization code.
    # ------------------------------------------------------------------

    tokens = await _exchange_code(
        code,
        verifier,
    )

    id_token = tokens.get("id_token")

    if not id_token:
        raise Unauthenticated(
            "Token response missing id_token"
        )

    # ------------------------------------------------------------------
    # Verify ID token, including nonce validation.
    # ------------------------------------------------------------------

    claims = await verify_id_token(
        id_token,
        expected_nonce=nonce,
    )

    # ------------------------------------------------------------------
    # JIT provision/update application user from IMS claims.
    # ------------------------------------------------------------------

    provisioned = await user_service.provision_from_ims(
        db,
        claims,
    )

    # ------------------------------------------------------------------
    # Create local application session.
    # ------------------------------------------------------------------

    issued = await _create_session(
        db,
        provisioned.user,
        auth_method="oidc",
        ip=ip,
        user_agent=user_agent,
    )
    if embedded and "embedded=1" not in return_to:
        sep = "&" if "?" in return_to else "?"
        return_to = f"{return_to}{sep}embedded=1"

    return issued, return_to, embedded


# ---------------------------------------------------------------------------
# Local development authentication
# ---------------------------------------------------------------------------

async def dev_login(
    db: AsyncSession,
    *,
    email: str,
    ip: str | None,
    user_agent: str | None,
) -> IssuedSession:
    """Create a local development session."""

    if not settings.LOCAL_DEV_AUTH:
        raise Forbidden(
            "Local development auth is disabled"
        )

    if settings.APP_ENV not in ("local", "dev"):
        raise Forbidden(
            "Local development auth is only available in local/dev"
        )

    user = (
        await db.execute(
            select(AppUser).where(
                AppUser.email == email
            )
        )
    ).scalar_one_or_none()

    if user is None:
        raise Unauthenticated(
            "No demo user with that email"
        )

    return await _create_session(
        db,
        user,
        auth_method="local_dev",
        ip=ip,
        user_agent=user_agent,
    )


# ---------------------------------------------------------------------------
# Session validation
# ---------------------------------------------------------------------------

async def load_session(
    db: AsyncSession,
    token: str,
) -> tuple[UserSession, AppUser] | None:
    """Validate a session token and load its session/user."""

    try:
        claims = decode_session_token(token)
    except Unauthenticated:
        return None

    session = (
        await db.execute(
            select(UserSession).where(
                UserSession.id == claims.session_id
            )
        )
    ).scalar_one_or_none()

    if session is None:
        return None

    now = datetime.now(timezone.utc)

    if (
        session.revoked_at is not None
        or session.expires_at <= now
    ):
        return None

    user = (
        await db.execute(
            select(AppUser).where(
                AppUser.id == session.user_id
            )
        )
    ).scalar_one_or_none()

    if user is None or user.status != UserStatus.active:
        return None

    # ------------------------------------------------------------------
    # Throttle last_seen_at writes to once every five minutes.
    # ------------------------------------------------------------------

    if (
        session.last_seen_at is None
        or (
            now - session.last_seen_at
        ) > timedelta(minutes=5)
    ):
        session.last_seen_at = now

    return session, user


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

async def logout(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    ip: str | None,
) -> None:
    """Revoke the current session."""

    session = (
        await db.execute(
            select(UserSession)
            .where(
                UserSession.id == session_id
            )
            .with_for_update()
        )
    ).scalar_one_or_none()

    if session is None or session.revoked_at is not None:
        return

    session.revoked_at = datetime.now(timezone.utc)

    await audit_service.record(
        db,
        actor_user_id=user_id,
        action="auth.logout",
        entity="user_session",
        entity_id=session.id,
        ip=ip,
    )


# ---------------------------------------------------------------------------
# IMS end-session
# ---------------------------------------------------------------------------

async def ims_end_session_url() -> str | None:
    """Return the OIDC provider's end-session endpoint if available."""

    if not settings.OIDC_ENABLED:
        return None

    try:
        discovery = await discovery_cache.discovery()
    except Exception:  # noqa: BLE001
        return None

    return discovery.get("end_session_endpoint")