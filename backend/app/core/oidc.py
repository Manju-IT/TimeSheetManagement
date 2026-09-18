from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

from app.core.config import settings
from app.core.exceptions import IntegrationError, Unauthenticated
from app.core.logging import get_logger

log = get_logger("app.oidc")

_DISCOVERY_TTL = 3600
_JWKS_TTL = 3600


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float


class OIDCDiscoveryCache:
    """In-process cache for the issuer's discovery document + JWKS.

    Single-process only. A future Phase may back this with Redis for multi-worker.
    """

    def __init__(self) -> None:
        self._discovery: _CacheEntry | None = None
        self._jwks: _CacheEntry | None = None
        self._lock = asyncio.Lock()

    async def discovery(self) -> dict[str, Any]:
        async with self._lock:
            now = time.monotonic()
            if self._discovery and self._discovery.expires_at > now:
                return self._discovery.value

            if not settings.OIDC_ISSUER:
                raise IntegrationError("OIDC issuer is not configured")

            url = settings.OIDC_ISSUER.rstrip("/") + "/.well-known/openid-configuration"
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(url)
            if r.status_code != 200:
                raise IntegrationError(f"OIDC discovery failed: HTTP {r.status_code}")
            doc = r.json()
            for required in ("authorization_endpoint", "token_endpoint", "jwks_uri", "issuer"):
                if required not in doc:
                    raise IntegrationError(f"OIDC discovery missing field: {required}")

            self._discovery = _CacheEntry(doc, now + _DISCOVERY_TTL)
            return doc

    async def jwks(self, force_refresh: bool = False) -> dict[str, Any]:
        async with self._lock:
            now = time.monotonic()
            if not force_refresh and self._jwks and self._jwks.expires_at > now:
                return self._jwks.value

            doc = await self.discovery()
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(doc["jwks_uri"])
            if r.status_code != 200:
                raise IntegrationError(f"JWKS fetch failed: HTTP {r.status_code}")
            jwks = r.json()
            self._jwks = _CacheEntry(jwks, now + _JWKS_TTL)
            return jwks


discovery_cache = OIDCDiscoveryCache()


def _select_jwk(jwks: dict[str, Any], kid: str | None) -> dict[str, Any]:
    keys = jwks.get("keys") or []
    if kid:
        for k in keys:
            if k.get("kid") == kid:
                return k
    # Fallback: use the first signing key with a matching use/alg.
    for k in keys:
        if k.get("use") == "sig" or "alg" in k:
            return k
    raise Unauthenticated("No suitable signing key found in JWKS")


async def verify_id_token(id_token: str, expected_nonce: str) -> dict[str, Any]:
    if not settings.OIDC_ISSUER or not settings.OIDC_CLIENT_ID:
        raise IntegrationError("OIDC is not configured")

    try:
        header = jwt.get_unverified_header(id_token)
    except jwt.InvalidTokenError as e:
        raise Unauthenticated("Malformed ID token") from e

    kid = header.get("kid")
    alg = header.get("alg", "RS256")
    if not isinstance(alg, str) or not alg.startswith("RS") and alg != "RS256":
        # Restrict to RS* family for the IMS IdP.
        if alg not in {"RS256", "RS384", "RS512"}:
            raise Unauthenticated(f"Unsupported ID token alg: {alg}")

    jwks = await discovery_cache.jwks()
    try:
        jwk = _select_jwk(jwks, kid)
    except Unauthenticated:
        # Key rotation: refresh once and retry.
        jwks = await discovery_cache.jwks(force_refresh=True)
        jwk = _select_jwk(jwks, kid)

    try:
        public_key = RSAAlgorithm.from_jwk(jwk)
    except Exception as e:  # noqa: BLE001
        raise IntegrationError("Failed to load signing key") from e

    try:
        claims = jwt.decode(
            id_token,
            public_key,
            algorithms=[alg],
            audience=settings.OIDC_CLIENT_ID,
            issuer=settings.OIDC_ISSUER.rstrip("/"),
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.ExpiredSignatureError as e:
        raise Unauthenticated("ID token expired") from e
    except jwt.InvalidTokenError as e:
        raise Unauthenticated("ID token validation failed") from e

    if expected_nonce and claims.get("nonce") != expected_nonce:
        raise Unauthenticated("ID token nonce mismatch")

    return claims