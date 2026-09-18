from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base class for all application errors that map to structured API responses."""

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
        super().__init__(message or self.message)
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code
        if http_status is not None:
            self.http_status = http_status
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


class ValidationError(AppError):
    code = "VALIDATION_ERROR"
    http_status = 422
    message = "Invalid request payload"


class Unauthenticated(AppError):
    code = "UNAUTHENTICATED"
    http_status = 401
    message = "Authentication required"


class Forbidden(AppError):
    code = "FORBIDDEN"
    http_status = 403
    message = "You do not have permission to perform this action"


class NotFound(AppError):
    code = "NOT_FOUND"
    http_status = 404
    message = "Resource not found"


class Conflict(AppError):
    code = "CONFLICT"
    http_status = 409
    message = "Conflict"


class InvalidStateTransition(Conflict):
    code = "INVALID_STATE_TRANSITION"
    message = "This state transition is not allowed"


class OptimisticConcurrencyError(Conflict):
    code = "STALE_WRITE"
    message = "Record was modified by another session"


class RateLimited(AppError):
    code = "RATE_LIMITED"
    http_status = 429
    message = "Too many requests"


class IntegrationError(AppError):
    code = "INTEGRATION_ERROR"
    http_status = 502
    message = "Upstream integration failed"