from __future__ import annotations

import math
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.core.logging import get_logger
from app.models.work_site import WorkSite

log = get_logger("app.location_service")

_EARTH_RADIUS_M = 6_371_000.0


def validate_coordinates(
    latitude: float | None, longitude: float | None, accuracy_m: float | None
) -> None:
    """Server-side validation. Never trust the browser's bounds check."""
    if latitude is None and longitude is None:
        return
    if latitude is None or longitude is None:
        raise ValidationError("Both latitude and longitude must be provided together")
    if not (-90.0 <= latitude <= 90.0):
        raise ValidationError("latitude must be between -90 and 90")
    if not (-180.0 <= longitude <= 180.0):
        raise ValidationError("longitude must be between -180 and 180")
    if accuracy_m is not None and accuracy_m < 0:
        raise ValidationError("accuracy_m must be >= 0")
    # Reject the classic bug where an unmapped/blocked provider returns 0,0.
    if abs(latitude) < 1e-6 and abs(longitude) < 1e-6:
        raise ValidationError("Suspicious coordinates (0, 0) rejected")


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * _EARTH_RADIUS_M * math.asin(math.sqrt(a))


async def match_work_site(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    latitude: float | None,
    longitude: float | None,
) -> tuple[WorkSite | None, bool | None]:
    """Return (matched_site, inside_site).

    `inside_site` is None when no coordinates were captured; True/False otherwise.
    All geofence math happens server-side. The frontend's hint is ignored.
    """
    if latitude is None or longitude is None:
        return None, None

    sites = list(
        (
            await db.execute(
                select(WorkSite).where(
                    WorkSite.org_id == org_id, WorkSite.is_active.is_(True)
                )
            )
        ).scalars()
    )
    if not sites:
        return None, None

    best: WorkSite | None = None
    best_distance: float | None = None
    for site in sites:
        d = haversine_meters(
            latitude, longitude, float(site.latitude), float(site.longitude)
        )
        if d <= float(site.radius_m):
            if best_distance is None or d < best_distance:
                best = site
                best_distance = d

    if best is not None:
        return best, True
    return None, False


async def resolve_place_label(
    latitude: float | None, longitude: float | None
) -> str | None:
    """Reverse-geocode hook.

    Phase 4 does NOT ship a provider call. When a provider is later configured,
    this is the single place a network call is made. The system NEVER fabricates
    a label from coordinates alone — a missing provider means a NULL label, which
    the UI renders as "On site"/"Off site"/dash.
    """
    if not settings.REVERSE_GEOCODE_ENABLED:
        return None
    if latitude is None or longitude is None:
        return None
    return None