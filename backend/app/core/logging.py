from __future__ import annotations

import logging
import sys
from contextvars import ContextVar
from typing import Any

import structlog


# ============================================================
# Request Context
# ============================================================

request_id_var: ContextVar[str | None] = ContextVar(
    "request_id",
    default=None,
)


# ============================================================
# Structlog Processors
# ============================================================

def add_request_id(
    logger: Any,
    method_name: str,
    event_dict: dict[str, Any],
) -> dict[str, Any]:
    """
    Add the current request ID to every log event when available.
    """

    request_id = request_id_var.get()

    if request_id:
        event_dict["request_id"] = request_id

    return event_dict


# ============================================================
# Logging Configuration
# ============================================================

def configure_logging(level: str = "INFO") -> None:
    """
    Configure application logging.

    Logs are emitted as JSON to stdout, which works well with
    Docker and cloud/container logging systems.
    """

    log_level = getattr(
        logging,
        level.upper(),
        logging.INFO,
    )

    # --------------------------------------------------------
    # Standard Python logging
    # --------------------------------------------------------

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
        force=True,
    )

    # --------------------------------------------------------
    # Structlog
    # --------------------------------------------------------

    structlog.configure(
        processors=[
            # Merge contextvars such as request_id.
            structlog.contextvars.merge_contextvars,

            # Add our explicit request ID.
            add_request_id,

            # Add INFO / WARNING / ERROR etc.
            structlog.processors.add_log_level,

            # Add ISO-8601 UTC timestamp.
            structlog.processors.TimeStamper(
                fmt="iso",
                utc=True,
            ),

            # Add stack information when requested.
            structlog.processors.StackInfoRenderer(),

            # Format exception information.
            structlog.processors.format_exc_info,

            # Render final output as JSON.
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            log_level,
        ),
        logger_factory=structlog.PrintLoggerFactory(
            file=sys.stdout,
        ),
        cache_logger_on_first_use=True,
    )


# ============================================================
# Logger Factory
# ============================================================

def get_logger(name: str = "app") -> Any:
    """
    Return a structured logger for the given module/component.
    """

    return structlog.get_logger(name)