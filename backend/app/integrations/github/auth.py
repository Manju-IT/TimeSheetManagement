"""GitHub authentication providers.

Two modes:
  - `pat`  : a fine-grained personal access token, local development only.
  - `app`  : GitHub App installation token, exchanged via a short-lived JWT
             signed with the app's private key. Preferred for production.

Neither provider logs the token. The token is returned as an opaque string and
handed directly to the HTTP client.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Protocol

import httpx
import jwt

from app.core.config import settings
from app.core.logging import get_logger
from app.integrations.github.errors import GitHubAuthError


log = get_logger("app.github.auth")

_REFRESH_SKEW_SECONDS = 300  # refresh installation tokens 5 min before expiry


class GitHubAuthProvider(Protocol):
    async def get_token(self) -> str:
        ...


class PATAuthProvider:
    """GitHub Personal Access Token authentication provider."""

    def __init__(self, token: str) -> None:
        self._token = token

    async def get_token(self) -> str:
        return self._token


@dataclass
class _CachedInstallationToken:
    token: str
    expires_at: float


class AppInstallationAuthProvider:
    """Exchange a GitHub App JWT for an installation access token.

    The installation token is cached until five minutes before expiry.
    """

    def __init__(
        self,
        *,
        app_id: str,
        private_key: str,
        installation_id: str,
        api_base: str,
    ) -> None:
        self._app_id = app_id
        self._private_key = private_key
        self._installation_id = installation_id
        self._api_base = api_base.rstrip("/")

        self._cache: _CachedInstallationToken | None = None
        self._lock = asyncio.Lock()

    def _mint_app_jwt(self) -> str:
        """Create a short-lived JWT signed with the GitHub App private key."""

        now = int(time.time())

        payload = {
            "iat": now - 60,
            "exp": now + 600,
            "iss": self._app_id,
        }

        try:
            return jwt.encode(
                payload,
                self._private_key,
                algorithm="RS256",
            )
        except Exception as exc:  # noqa: BLE001
            raise GitHubAuthError(
                f"Failed to sign GitHub App JWT: {exc}"
            ) from exc

    async def _fetch_installation_token(
        self,
    ) -> _CachedInstallationToken:
        """Exchange the App JWT for an installation access token."""

        app_jwt = self._mint_app_jwt()

        url = (
            f"{self._api_base}"
            f"/app/installations/{self._installation_id}"
            f"/access_tokens"
        )

        headers = {
            "Authorization": f"Bearer {app_jwt}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                url,
                headers=headers,
            )

        if response.status_code == 401:
            raise GitHubAuthError(
                "GitHub App JWT rejected"
            )

        if response.status_code >= 500:
            raise GitHubAuthError(
                "GitHub App token exchange failed: "
                f"HTTP {response.status_code}"
            )

        if response.status_code != 201:
            raise GitHubAuthError(
                "GitHub App token exchange failed: "
                f"HTTP {response.status_code}"
            )

        try:
            body = response.json()
        except ValueError as exc:
            raise GitHubAuthError(
                "GitHub App token response was not valid JSON"
            ) from exc

        token = body.get("token")

        if not token:
            raise GitHubAuthError(
                "GitHub App token response missing 'token'"
            )

        # GitHub normally returns an ISO8601 expiration timestamp.
        # Use a conservative fallback if parsing fails.
        expires_at = time.time() + 3300

        try:
            from datetime import datetime

            expires_at = datetime.fromisoformat(
                body["expires_at"].replace(
                    "Z",
                    "+00:00",
                )
            ).timestamp()
        except Exception:  # noqa: BLE001
            pass

        return _CachedInstallationToken(
            token=token,
            expires_at=expires_at,
        )

    async def get_token(self) -> str:
        """Return a cached installation token or refresh it."""

        async with self._lock:
            now = time.time()

            if (
                self._cache is not None
                and (
                    self._cache.expires_at
                    - _REFRESH_SKEW_SECONDS
                    > now
                )
            ):
                return self._cache.token

            self._cache = await self._fetch_installation_token()

            log.info(
                "github_installation_token_refreshed",
                expires_in=int(
                    self._cache.expires_at - now
                ),
            )

            return self._cache.token


def build_auth_provider() -> GitHubAuthProvider:
    """Build the configured GitHub authentication provider."""

    mode = settings.GITHUB_AUTH_MODE

    # ------------------------------------------------------------------
    # GitHub App authentication
    # ------------------------------------------------------------------

    if mode == "app":
        if (
            not settings.GITHUB_APP_ID
            or not settings.GITHUB_PRIVATE_KEY
            or not settings.GITHUB_INSTALLATION_ID
        ):
            raise GitHubAuthError(
                "GitHub App credentials are incomplete"
            )

        # GITHUB_PRIVATE_KEY is configured as SecretStr.
        # Explicitly unwrap it before manipulating the PEM string.
        private_key = (
            settings.GITHUB_PRIVATE_KEY
            .get_secret_value()
        )

        # Support .env values containing literal "\\n".
        private_key = private_key.replace(
            "\\n",
            "\n",
        )

        return AppInstallationAuthProvider(
            app_id=settings.GITHUB_APP_ID,
            private_key=private_key,
            installation_id=settings.GITHUB_INSTALLATION_ID,
            api_base=str(settings.GITHUB_API_BASE),
        )

    # ------------------------------------------------------------------
    # Personal Access Token authentication
    # ------------------------------------------------------------------

    if mode == "pat":
        if not settings.GITHUB_PAT:
            raise GitHubAuthError(
                "GITHUB_PAT is not configured"
            )

        # GITHUB_PAT is also SecretStr.
        token = settings.GITHUB_PAT.get_secret_value()

        return PATAuthProvider(token)

    # ------------------------------------------------------------------
    # Unsupported authentication mode
    # ------------------------------------------------------------------

    raise GitHubAuthError(
        f"Unsupported GITHUB_AUTH_MODE: {mode}"
    )