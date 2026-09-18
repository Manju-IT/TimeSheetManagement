from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings
from app.core.exceptions import Unauthenticated

JWT_ALG = "HS256"


# ---------- PKCE ----------

def make_pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge). S256 method."""
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(64)).rstrip(b"=").decode("ascii")
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def random_urlsafe(n: int = 32) -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(n)).rstrip(b"=").decode("ascii")


# ---------- Session JWT ----------

@dataclass(frozen=True)
class SessionClaims:
    user_id: uuid.UUID
    session_id: uuid.UUID
    issued_at: datetime
    expires_at: datetime


def issue_session_token(user_id: uuid.UUID, session_id: uuid.UUID) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(seconds=settings.SESSION_TTL_SECONDS)
    payload = {
        "iss": settings.BACKEND_URL,
        "aud": settings.APP_NAME,
        "sub": str(user_id),
        "sid": str(session_id),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    token = jwt.encode(payload, settings.SESSION_SECRET, algorithm=JWT_ALG)
    return token, exp


def decode_session_token(token: str) -> SessionClaims:
    try:
        payload = jwt.decode(
            token,
            settings.SESSION_SECRET,
            algorithms=[JWT_ALG],
            audience=settings.APP_NAME,
            issuer=settings.BACKEND_URL,
            options={"require": ["exp", "iat", "sub", "sid", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError as e:
        raise Unauthenticated("Session expired") from e
    except jwt.InvalidTokenError as e:
        raise Unauthenticated("Invalid session token") from e

    try:
        user_id = uuid.UUID(payload["sub"])
        session_id = uuid.UUID(payload["sid"])
    except (KeyError, ValueError) as e:
        raise Unauthenticated("Malformed session token") from e

    return SessionClaims(
        user_id=user_id,
        session_id=session_id,
        issued_at=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
        expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
    )


def constant_time_compare(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))