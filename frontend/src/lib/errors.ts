export interface ClassifiedError {
    kind:
    | 'network'
    | 'offline'
    | 'auth'
    | 'forbidden'
    | 'notfound'
    | 'conflict'
    | 'stale'
    | 'rate-limited'
    | 'validation'
    | 'server'
    | 'unknown';

    status: number;
    code: string;
    message: string;
    details: Record<string, unknown>;
    retryAfterSeconds?: number;
}

export function classifyError(
    err: unknown,
): ClassifiedError {
    const e = err as {
        status?: number;
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
        name?: string;
    };

    const status = e?.status ?? 0;

    const code =
        e?.code ??
        (status ? `HTTP_${status}` : 'NETWORK');

    const message =
        e?.message ??
        'Unexpected error';

    /**
     * Network / offline / timeout errors.
     *
     * AbortError:
     *   Produced by AbortController / AbortSignal.timeout().
     *
     * TimeoutError:
     *   Produced by AbortSignal.timeout() in runtimes
     *   that expose the dedicated TimeoutError name.
     *
     * TypeError:
     *   Common browser fetch() failure for network errors.
     *
     * NETWORK:
     *   Explicit application-level network error.
     */
    if (
        e?.name === 'AbortError' ||
        e?.name === 'TimeoutError' ||
        e?.name === 'TypeError' ||
        code === 'NETWORK'
    ) {
        const offline =
            typeof navigator !== 'undefined' &&
            navigator.onLine === false;

        const isTimeout =
            e?.name === 'AbortError' ||
            e?.name === 'TimeoutError';

        return {
            kind: offline
                ? 'offline'
                : 'network',

            status: 0,

            code: isTimeout
                ? 'TIMEOUT'
                : 'NETWORK',

            message: offline
                ? 'You appear to be offline.'
                : isTimeout
                    ? 'The server did not respond in time.'
                    : 'Unable to reach the server. Check your connection and try again.',

            details: {},
        };
    }

    /**
     * Authentication failure.
     */
    if (status === 401) {
        return {
            kind: 'auth',
            status,
            code,
            message,
            details: e?.details ?? {},
        };
    }

    /**
     * Authorization failure.
     */
    if (status === 403) {
        return {
            kind: 'forbidden',
            status,
            code,
            message,
            details: e?.details ?? {},
        };
    }

    /**
     * Resource not found.
     */
    if (status === 404) {
        return {
            kind: 'notfound',
            status,
            code,
            message,
            details: e?.details ?? {},
        };
    }

    /**
     * Conflict / stale-write handling.
     */
    if (status === 409) {
        const stale =
            code === 'STALE_WRITE';

        return {
            kind: stale
                ? 'stale'
                : 'conflict',

            status,
            code,
            message,

            details:
                e?.details ?? {},
        };
    }

    /**
     * Validation failure.
     */
    if (status === 422) {
        return {
            kind: 'validation',
            status,
            code,
            message,
            details:
                e?.details ?? {},
        };
    }

    /**
     * Rate limiting.
     */
    if (status === 429) {
        const retryAfterSeconds = Number(
            (
                e?.details as {
                    retry_after_seconds?: number;
                }
            )?.retry_after_seconds ?? 0,
        );

        return {
            kind: 'rate-limited',
            status,
            code,
            message,
            details:
                e?.details ?? {},
            retryAfterSeconds:
                retryAfterSeconds || undefined,
        };
    }

    /**
     * Server-side failure.
     */
    if (status >= 500) {
        return {
            kind: 'server',
            status,
            code,
            message,
            details:
                e?.details ?? {},
        };
    }

    /**
     * Anything not covered above.
     */
    return {
        kind: 'unknown',
        status,
        code,
        message,
        details:
            e?.details ?? {},
    };
}