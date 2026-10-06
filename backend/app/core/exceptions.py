from __future__ import annotations

from typing import Any


class AppError(Exception):
    """
    Base exception for expected application errors.

    These exceptions represent errors that are safe to expose to API clients
    through structured error responses.
    """

    code: str = "INTERNAL_ERROR"
    http_status: int = 500
    message: str = "Internal server error"

    def __init__(
        self,
        message: str | None = None,
        *,
        details: dict[str, Any] | None = None,
        code: str | None = None,
        http_status: int | None = None,
    ) -> None:
        resolved_message = message if message is not None else self.message
        resolved_code = code if code is not None else self.code
        resolved_status = (
            http_status if http_status is not None else self.http_status
        )

        super().__init__(resolved_message)

        self.message = resolved_message
        self.code = resolved_code
        self.http_status = resolved_status
        self.details = details.copy() if details else {}

    def to_dict(self) -> dict[str, Any]:
        """
        Convert the exception into the API error response format.
        """

        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


# ============================================================
# 4xx Client Errors
# ============================================================


class ValidationError(AppError):
    """The request was syntactically valid but failed business validation."""

    code = "VALIDATION_ERROR"
    http_status = 422
    message = "Invalid request payload"


class Unauthenticated(AppError):
    """The request requires authentication."""

    code = "UNAUTHENTICATED"
    http_status = 401
    message = "Authentication required"


class Forbidden(AppError):
    """The authenticated user lacks permission."""

    code = "FORBIDDEN"
    http_status = 403
    message = "You do not have permission to perform this action"


class NotFound(AppError):
    """The requested resource does not exist or is not accessible."""

    code = "NOT_FOUND"
    http_status = 404
    message = "Resource not found"


class Conflict(AppError):
    """The request conflicts with the current resource state."""

    code = "CONFLICT"
    http_status = 409
    message = "Conflict"


class InvalidStateTransition(Conflict):
    """The requested state transition is not permitted."""

    code = "INVALID_STATE_TRANSITION"
    message = "This state transition is not allowed"


class OptimisticConcurrencyError(Conflict):
    """The resource was modified after it was read."""

    code = "STALE_WRITE"
    message = "Record was modified by another session"


class RateLimited(AppError):
    """The client exceeded the configured request rate."""

    code = "RATE_LIMITED"
    http_status = 429
    message = "Too many requests"


# ============================================================
# 5xx Upstream / Integration Errors
# ============================================================


class IntegrationError(AppError):
    """
    An upstream dependency failed.

    Examples:
        GitHub API
        OIDC provider
        external geocoding provider
    """

    code = "INTEGRATION_ERROR"
    http_status = 502
    message = "Upstream integration failed"


class IdempotencyConflict(Conflict):
    code = "IDEMPOTENCY_CONFLICT"
    message = "A request with this Idempotency-Key is already in flight"


class IdempotencyKeyReused(Conflict):
    code = "IDEMPOTENCY_KEY_REUSED"
    message = "This Idempotency-Key was used with a different request payload"


class IdempotencyKeyRequired(ValidationError):
    code = "IDEMPOTENCY_KEY_REQUIRED"
    message = "This endpoint requires an Idempotency-Key header"