"""Thin re-export so future code can import a stable IMS client surface.

The heavy lifting lives in `app.core.oidc`; this module exists so the
integration layer is the only place callers reach into for IMS behavior.
"""

from app.core.oidc import discovery_cache, verify_id_token  # noqa: F401

__all__ = ["discovery_cache", "verify_id_token"]