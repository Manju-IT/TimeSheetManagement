from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import (
    AnyHttpUrl,
    Field,
    RedisDsn,
    SecretStr,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application configuration.

    Values are loaded from environment variables and `.env`.
    Environment variables take precedence over `.env` values.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ============================================================
    # Runtime
    # ============================================================

    APP_ENV: Literal[
        "local",
        "dev",
        "staging",
        "production",
    ] = "local"

    APP_NAME: str = "Team Timesheet"

    LOG_LEVEL: Literal[
        "DEBUG",
        "INFO",
        "WARNING",
        "ERROR",
        "CRITICAL",
    ] = "INFO"

    # ============================================================
    # Database
    # ============================================================

    DATABASE_URL: str = Field(
        ...,
        description="Async SQLAlchemy database URL.",
    )

    DATABASE_URL_SYNC: str = Field(
        ...,
        description="Synchronous SQLAlchemy database URL.",
    )

    # ============================================================
    # Redis
    # ============================================================

    REDIS_URL: RedisDsn = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL.",
    )

    # ============================================================
    # Application URLs
    # ============================================================

    FRONTEND_URL: AnyHttpUrl = "http://localhost:5173"

    BACKEND_URL: AnyHttpUrl = "http://localhost:8000"

    CORS_ALLOWED_ORIGINS: list[AnyHttpUrl] = Field(
        default_factory=lambda: [
            AnyHttpUrl("http://localhost:5173"),
        ]
    )

    # ============================================================
    # Session / Cookies
    # ============================================================

    SESSION_SECRET: SecretStr = Field(
        ...,
        min_length=32,
        description="Cryptographic secret used for session security.",
    )

    SESSION_COOKIE_NAME: str = "tsid"

    SESSION_TTL_SECONDS: int = Field(
        default=60 * 60 * 12,
        ge=300,
        description="Session lifetime in seconds.",
    )

    SESSION_COOKIE_SECURE: bool = False

    SESSION_COOKIE_SAMESITE: Literal[
        "lax",
        "strict",
        "none",
    ] = "lax"

    # ============================================================
    # Authentication
    # ============================================================

    LOCAL_DEV_AUTH: bool = False

    # ============================================================
    # OIDC
    # ============================================================

    OIDC_ENABLED: bool = False

    OIDC_ISSUER: AnyHttpUrl | None = None

    OIDC_CLIENT_ID: str | None = None

    OIDC_CLIENT_SECRET: SecretStr | None = None

    OIDC_REDIRECT_URI: AnyHttpUrl | None = None

    OIDC_SCOPES: str = "openid email profile groups"

    OIDC_GROUP_CLAIM: str = "groups"

    # ============================================================
    # OIDC → RBAC mapping
    # ============================================================

    OIDC_GROUP_TO_ROLE_ADMIN: str | None = None

    OIDC_GROUP_TO_ROLE_MANAGER: str | None = None

    OIDC_GROUP_TO_ROLE_MEMBER: str | None = None

    # ============================================================
    # Location
    # ============================================================

    LOCATION_REQUIRED: bool = False

    LOCATION_RETENTION_DAYS: int = Field(
        default=365,
        ge=1,
    )

    REVERSE_GEOCODE_ENABLED: bool = False

    REVERSE_GEOCODE_PROVIDER: str | None = None

    # ============================================================
    # GitHub
    # ============================================================

    GITHUB_AUTH_MODE: Literal[
        "app",
        "pat",
    ] = "app"

    GITHUB_APP_ID: str | None = None

    GITHUB_PRIVATE_KEY: SecretStr | None = None

    GITHUB_INSTALLATION_ID: str | None = None

    GITHUB_PAT: SecretStr | None = None

    GITHUB_API_BASE: AnyHttpUrl = "https://api.github.com"

    GITHUB_SYNC_INTERVAL_SECONDS: int = Field(
        default=600,
        ge=60,
    )
    GITHUB_WEBHOOK_SECRET: str | None = None

    # ============================================================
    # Rate Limits
    # ============================================================

    RATE_LIMIT_AUTH: str = "10/minute"

    RATE_LIMIT_API: str = "600/minute"

    RATE_LIMIT_GITHUB_SYNC: str = "30/minute"

    RATE_LIMIT_ADMIN_RESYNC: str = "2/hour"

    # ============================================================
    # Business Rules
    # ============================================================

    DEFAULT_WORKDAY_HOURS: int = Field(
        default=8,
        ge=1,
        le=24,
    )

    VARIANCE_THRESHOLD_MINUTES: int = Field(
        default=60,
        ge=0,
    )

    AUTO_LOGOUT_MINUTES: int = Field(
        default=600,
        ge=1,
    )

    EMBED_ALLOWED_ORIGINS: str = ""

    # ============================================================
    # Validators
    # ============================================================

    @field_validator("CORS_ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        """
        Allow either:

        CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000

        or a Python-style list when configuration is provided
        programmatically.
        """

        if isinstance(value, str):
            return [
                origin.strip()
                for origin in value.split(",")
                if origin.strip()
            ]

        return value

    @property
    def embed_origins_env(self) -> list[str]:
        return [o.strip() for o in self.EMBED_ALLOWED_ORIGINS.split(",") if o.strip()]

    @model_validator(mode="after")
    def validate_environment_security(self) -> "Settings":
        """
        Cross-field security validation.
        """

        # --------------------------------------------------------
        # Production must never use local development auth.
        # --------------------------------------------------------

        if self.APP_ENV in {"staging", "production"}:
            if self.LOCAL_DEV_AUTH:
                raise ValueError(
                    "LOCAL_DEV_AUTH must be false in staging/production."
                )

        # --------------------------------------------------------
        # Production should use HTTPS cookies.
        # --------------------------------------------------------

        if self.APP_ENV == "production":
            if not self.SESSION_COOKIE_SECURE:
                raise ValueError(
                    "SESSION_COOKIE_SECURE must be true in production."
                )

        # --------------------------------------------------------
        # SameSite=None requires Secure cookies.
        # --------------------------------------------------------

        if self.SESSION_COOKIE_SAMESITE == "none":
            if not self.SESSION_COOKIE_SECURE:
                raise ValueError(
                    "SESSION_COOKIE_SECURE must be true when "
                    "SESSION_COOKIE_SAMESITE='none'."
                )

        # --------------------------------------------------------
        # OIDC validation.
        # --------------------------------------------------------

        if self.OIDC_ENABLED:

            required_oidc_fields = {
                "OIDC_ISSUER": self.OIDC_ISSUER,
                "OIDC_CLIENT_ID": self.OIDC_CLIENT_ID,
                "OIDC_CLIENT_SECRET": self.OIDC_CLIENT_SECRET,
                "OIDC_REDIRECT_URI": self.OIDC_REDIRECT_URI,
            }

            missing = [
                name
                for name, value in required_oidc_fields.items()
                if value is None
            ]

            if missing:
                raise ValueError(
                    "OIDC is enabled but these settings are missing: "
                    + ", ".join(missing)
                )

        # --------------------------------------------------------
        # GitHub authentication validation.
        # --------------------------------------------------------

        if self.GITHUB_AUTH_MODE == "pat":

            if self.GITHUB_PAT is None:
                raise ValueError(
                    "GITHUB_AUTH_MODE='pat' requires GITHUB_PAT."
                )

        elif self.GITHUB_AUTH_MODE == "app":

            required_github_app_fields = {
                "GITHUB_APP_ID": self.GITHUB_APP_ID,
                "GITHUB_PRIVATE_KEY": self.GITHUB_PRIVATE_KEY,
                "GITHUB_INSTALLATION_ID": self.GITHUB_INSTALLATION_ID,
            }

            missing = [
                name
                for name, value in required_github_app_fields.items()
                if value is None
            ]

            if missing:
                raise ValueError(
                    "GITHUB_AUTH_MODE='app' requires: "
                    + ", ".join(missing)
                )

        return self

    # ============================================================
    # Convenience properties
    # ============================================================

    @property
    def cors_origin_strings(self) -> list[str]:
        """
        Convert Pydantic URL objects into strings for FastAPI.
        """

        return [
            str(origin).rstrip("/")
            for origin in self.CORS_ALLOWED_ORIGINS
        ]


# ================================================================
# Settings singleton
# ================================================================

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()