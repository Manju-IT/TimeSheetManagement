import { useCallback, useState } from 'react';

export type BrowserPermission = 'granted' | 'denied' | 'unavailable';

export interface GeoFix {
    latitude: number;
    longitude: number;
    accuracy_m: number;
}

export interface GeoResult {
    fix: GeoFix | null;
    permission: BrowserPermission;
    error: string | null;
}

interface State {
    permission: BrowserPermission | 'unknown';
    fix: GeoFix | null;
    error: string | null;
    loading: boolean;
}

const initial: State = { permission: 'unknown', fix: null, error: null, loading: false };

/**
 * One-shot geolocation. Never watches, never polls.
 * Called only when the user explicitly performs check-in or check-out.
 */
export function useGeolocation() {
    const [state, setState] = useState<State>(initial);

    const request = useCallback((): Promise<GeoResult> => {
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
            const r: GeoResult = {
                fix: null,
                permission: 'unavailable',
                error: 'Geolocation is not supported by this browser.',
            };
            setState({ permission: 'unavailable', fix: null, error: r.error, loading: false });
            return Promise.resolve(r);
        }

        setState((s) => ({ ...s, loading: true, error: null }));

        return new Promise<GeoResult>((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const fix: GeoFix = {
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy_m: pos.coords.accuracy,
                    };
                    setState({ permission: 'granted', fix, error: null, loading: false });
                    resolve({ fix, permission: 'granted', error: null });
                },
                (err) => {
                    const permission: BrowserPermission =
                        err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
                    setState({
                        permission,
                        fix: null,
                        error: err.message || 'Unable to determine location.',
                        loading: false,
                    });
                    resolve({ fix: null, permission, error: err.message });
                },
                { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
            );
        });
    }, []);

    const reset = useCallback(() => setState(initial), []);

    return { ...state, request, reset };
}