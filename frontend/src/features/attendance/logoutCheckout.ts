import { attendanceApi } from './api';
import type { GeoPermission } from './types';

/**
 * Best-effort check-out before sign-out.
 *
 * Design contract (from the app spec): signing out from IMS is treated as the
 * user's last logout of the day. We attempt a fresh location fix; if the
 * browser denies or the fix times out, we still send the check-out with
 * `geo_permission: 'denied' | 'unavailable'` so the attendance day records the
 * event and closes the session.
 *
 * Errors are swallowed. Signing out must not depend on the check-out succeeding.
 */
export async function bestEffortCheckout(): Promise<void> {
    try {
        const fix = await new Promise<{
            lat: number | null;
            lon: number | null;
            acc: number | null;
            permission: GeoPermission;
        }>((resolve) => {
            if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
                resolve({ lat: null, lon: null, acc: null, permission: 'unavailable' });
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (pos) =>
                    resolve({
                        lat: pos.coords.latitude,
                        lon: pos.coords.longitude,
                        acc: pos.coords.accuracy,
                        permission: 'granted',
                    }),
                (err) =>
                    resolve({
                        lat: null,
                        lon: null,
                        acc: null,
                        permission: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable',
                    }),
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
            );
        });

        await attendanceApi.checkOut({
            latitude: fix.lat,
            longitude: fix.lon,
            accuracy_m: fix.acc,
            geo_permission: fix.permission,
            client_reported_at: new Date().toISOString(),
        });
    } catch {
        // If the user was never checked in, or the request fails, we simply continue
        // with the auth logout. The session timeout worker will close any orphan
        // session and record it as `logout_reason=timeout`.
    }
}