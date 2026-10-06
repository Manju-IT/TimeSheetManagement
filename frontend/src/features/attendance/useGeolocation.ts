import { useCallback, useState } from 'react';

export type BrowserPermission =
    | 'granted'
    | 'denied'
    | 'unavailable';

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

const initial: State = {
    permission: 'unknown',
    fix: null,
    error: null,
    loading: false,
};

/**
 * One-shot geolocation.
 *
 * Never watches and never polls.
 * Called only when the user explicitly performs
 * check-in or check-out.
 */
export function useGeolocation() {
    const [state, setState] = useState<State>(initial);

    const request = useCallback((): Promise<GeoResult> => {
        if (
            typeof navigator === 'undefined' ||
            !('geolocation' in navigator)
        ) {
            const result: GeoResult = {
                fix: null,
                permission: 'unavailable',
                error:
                    'Geolocation is not supported by this browser.',
            };

            setState({
                permission: 'unavailable',
                fix: null,
                error: result.error,
                loading: false,
            });

            return Promise.resolve(result);
        }

        setState((current) => ({
            ...current,
            loading: true,
            error: null,
        }));

        return new Promise<GeoResult>((resolve) => {
            /**
             * Handle geolocation failures.
             *
             * When the application is running inside an iframe,
             * browsers may report PERMISSION_DENIED without showing
             * a normal permission prompt if the iframe does not have
             * the required allow="geolocation" permission policy.
             */
            const err = (
                posErr: GeolocationPositionError,
            ) => {
                const inIframe =
                    typeof window !== 'undefined' &&
                    window.self !== window.top;

                const permission: BrowserPermission =
                    posErr.code === posErr.PERMISSION_DENIED
                        ? 'denied'
                        : 'unavailable';

                let message =
                    posErr.message ||
                    'Unable to determine location.';

                if (
                    permission === 'denied' &&
                    inIframe
                ) {
                    message =
                        'Location was denied. If this app is embedded, ' +
                        'the parent page must include allow="geolocation" ' +
                        'on the iframe tag.';
                }

                setState({
                    permission,
                    fix: null,
                    error: message,
                    loading: false,
                });

                resolve({
                    fix: null,
                    permission,
                    error: message,
                });
            };

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const fix: GeoFix = {
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy_m: pos.coords.accuracy,
                    };

                    setState({
                        permission: 'granted',
                        fix,
                        error: null,
                        loading: false,
                    });

                    resolve({
                        fix,
                        permission: 'granted',
                        error: null,
                    });
                },
                err,
                {
                    enableHighAccuracy: true,
                    timeout: 12_000,
                    maximumAge: 0,
                },
            );
        });
    }, []);

    const reset = useCallback(() => {
        setState(initial);
    }, []);

    return {
        ...state,
        request,
        reset,
    };
}