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

# Mean Earth radius used for geodesic/Haversine distance.
# Returning metres keeps the rest of the application consistent.
_EARTH_RADIUS_M = 6_371_000.0


def validate_coordinates(
    latitude: float | None,
    longitude: float | None,
    accuracy_m: float | None,
) -> None:
    """
    Validate coordinates on the server.

    The browser is never trusted to perform the authoritative validation.
    """

    # No location was supplied.
    if latitude is None and longitude is None:
        return

    # One coordinate without the other is invalid.
    if latitude is None or longitude is None:
        raise ValidationError(
            "Both latitude and longitude must be provided together"
        )

    # Latitude bounds.
    if not math.isfinite(latitude):
        raise ValidationError("latitude must be a finite number")

    if not (-90.0 <= latitude <= 90.0):
        raise ValidationError(
            "latitude must be between -90 and 90"
        )

    # Longitude bounds.
    if not math.isfinite(longitude):
        raise ValidationError("longitude must be a finite number")

    if not (-180.0 <= longitude <= 180.0):
        raise ValidationError(
            "longitude must be between -180 and 180"
        )

    # Accuracy must never be negative.
    if accuracy_m is not None:
        if not math.isfinite(accuracy_m):
            raise ValidationError(
                "accuracy_m must be a finite number"
            )

        if accuracy_m < 0:
            raise ValidationError(
                "accuracy_m must be >= 0"
            )

    # Reject the classic 0,0 invalid-location value.
    if abs(latitude) < 1e-6 and abs(longitude) < 1e-6:
        raise ValidationError(
            "Suspicious coordinates (0, 0) rejected"
        )


def haversine_meters(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """
    Calculate the great-circle distance between two coordinates.

    Returns:
        Distance in metres.
    """

    # Convert degrees to radians.
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)

    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    # Haversine formula.
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(dlambda / 2.0) ** 2
    )

    # Protect against tiny floating-point errors.
    a = min(1.0, max(0.0, a))

    return (
        2.0
        * _EARTH_RADIUS_M
        * math.asin(math.sqrt(a))
    )


async def match_work_site(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    latitude: float | None,
    longitude: float | None,
) -> tuple[WorkSite | None, bool | None, float | None]:
    """
    Find the nearest active work site.

    Returns:
        (
            nearest_site,
            inside_site,
            distance_to_nearest_site_m,
        )
    """

    if latitude is None or longitude is None:
        return None, None, None

    sites = list(
        (
            await db.execute(
                select(WorkSite).where(
                    WorkSite.org_id == org_id,
                    WorkSite.is_active.is_(True),
                )
            )
        ).scalars()
    )

    if not sites:
        return None, None, None

    nearest_site: WorkSite | None = None
    nearest_distance_m: float | None = None

    for site in sites:
        distance_m = haversine_meters(
            latitude,
            longitude,
            float(site.latitude),
            float(site.longitude),
        )

        if (
            nearest_distance_m is None
            or distance_m < nearest_distance_m
        ):
            nearest_site = site
            nearest_distance_m = distance_m

    if nearest_site is None or nearest_distance_m is None:
        return None, None, None

    inside_site = (
        nearest_distance_m <= float(nearest_site.radius_m)
    )
    log.info(
        "GEOFENCE DEBUG: org_id=%s latitude=%s longitude=%s",
        org_id,
        latitude,
        longitude,
    )
    log.info(
        "GEOFENCE DEBUG: active_sites=%s",
        [
            {
                "id": str(site.id),
                "org_id": str(site.org_id),
                "name": site.name,
                "lat": float(site.latitude),
                "lon": float(site.longitude),
                "radius": float(site.radius_m),
            }
            for site in sites
        ],
    )

    return (
        nearest_site,
        inside_site,
        nearest_distance_m,
    )


async def resolve_place_label(
    latitude: float | None,
    longitude: float | None,
) -> str | None:
    """
    Reverse-geocode hook.

    No provider call is made unless reverse geocoding is explicitly enabled.
    """

    if not settings.REVERSE_GEOCODE_ENABLED:
        return None

    if latitude is None or longitude is None:
        return None

    # Provider implementation can be added here later.
    return None