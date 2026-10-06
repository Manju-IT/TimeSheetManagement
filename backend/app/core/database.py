from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings


# ============================================================
# Database Engine
# ============================================================

_engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,  # Adjust as needed
    max_overflow=20,  # Adjust as needed
    pool_timeout=30,  # 30 seconds
    pool_recycle=1800,  # Recycle connections every 30 minutes
)


# ============================================================
# Session Factory
# ============================================================

AsyncSessionLocal = async_sessionmaker(
    bind=_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


# ============================================================
# Engine Access
# ============================================================

def get_engine() -> AsyncEngine:
    """Return the application's shared SQLAlchemy async engine."""
    return _engine


# ============================================================
# FastAPI Database Dependency
# ============================================================

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides an AsyncSession.

    Transaction behavior:
        - Endpoint succeeds  -> commit
        - Endpoint raises    -> rollback
        - Session closes     -> always
    """

    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()

        except Exception:
            await session.rollback()
            raise


# ============================================================
# Application Shutdown
# ============================================================

async def close_db() -> None:
    """Dispose the SQLAlchemy engine during application shutdown."""
    await _engine.dispose()