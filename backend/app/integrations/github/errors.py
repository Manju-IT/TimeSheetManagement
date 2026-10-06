from __future__ import annotations


class GitHubError(Exception):
    """Base for any GitHub integration failure."""


class GitHubAuthError(GitHubError):
    """Credentials missing, invalid, or expired."""


class GitHubNotFound(GitHubError):
    """Resource not found on GitHub (project, issue, item)."""


class GitHubRateLimited(GitHubError):
    def __init__(self, retry_after_seconds: int, message: str = "GitHub rate limit reached"):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class GitHubServerError(GitHubError):
    """5xx from GitHub or transport-level failure."""


class GitHubValidationError(GitHubError):
    """GraphQL returned errors indicating a bad request (permanent)."""


class GitHubConflictDetected(GitHubError):
    """Remote changed since our last sync; caller must reconcile."""
    def __init__(self, remote_updated_at: str):
        super().__init__("Remote resource changed since last sync")
        self.remote_updated_at = remote_updated_at