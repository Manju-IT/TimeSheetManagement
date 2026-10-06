from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings
from app.integrations.github.auth import (
    GitHubAuthError,
    GitHubAuthProvider,
    build_auth_provider,
)


@dataclass(frozen=True)
class GitHubGraphQLResponse:
    """
    Normalized GraphQL response.

    GitHub's raw response has the shape:
        {
            "data": {...},
            "errors": [...]
        }

    The rest of the application consumes the successful GraphQL
    payload through `.data`.
    """

    data: dict[str, Any]


class GitHubGraphQLClient:
    def __init__(
        self,
        provider: GitHubAuthProvider,
        api_base: str,
    ) -> None:
        self.provider = provider
        self.api_base = str(api_base).rstrip("/")

    async def execute(
        self,
        query: str,
        variables: dict[str, Any] | None = None,
    ) -> GitHubGraphQLResponse:
        """
        Execute a GitHub GraphQL query and return a normalized response.

        Raises:
            GitHubAuthError: for authentication/provider errors,
            HTTP errors, malformed responses, or GraphQL errors.
        """
        token = await self.provider.get_token()

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        payload = {
            "query": query,
            "variables": variables or {},
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.api_base}/graphql",
                    headers=headers,
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise GitHubAuthError(
                f"GitHub API request failed: {exc}"
            ) from exc

        if response.status_code >= 400:
            raise GitHubAuthError(
                f"GitHub API returned HTTP {response.status_code}: "
                f"{response.text[:500]}"
            )

        try:
            payload_data = response.json()
        except ValueError as exc:
            raise GitHubAuthError(
                "GitHub API returned an invalid JSON response"
            ) from exc

        if not isinstance(payload_data, dict):
            raise GitHubAuthError(
                "GitHub API returned an unexpected response format"
            )

        errors = payload_data.get("errors")

        if errors:
            messages: list[str] = []

            if isinstance(errors, list):
                for error in errors:
                    if isinstance(error, dict):
                        message = error.get("message")
                        if message:
                            messages.append(str(message))
                    else:
                        messages.append(str(error))
            else:
                messages.append(str(errors))

            raise GitHubAuthError(
                "; ".join(messages) or "GitHub GraphQL request failed"
            )

        data = payload_data.get("data")

        if data is None:
            raise GitHubAuthError(
                "GitHub GraphQL response did not contain a data field"
            )

        if not isinstance(data, dict):
            raise GitHubAuthError(
                "GitHub GraphQL response data has an unexpected format"
            )

        return GitHubGraphQLResponse(data=data)


_client: GitHubGraphQLClient | None = None


def get_client() -> GitHubGraphQLClient:
    global _client

    if _client is None:
        provider = build_auth_provider()

        _client = GitHubGraphQLClient(
            provider=provider,
            api_base=str(settings.GITHUB_API_BASE),
        )

    return _client


def reset_client() -> None:
    global _client
    _client = None