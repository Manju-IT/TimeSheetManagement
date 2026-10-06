import { isEmbedded } from './embedded';

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Create a fresh timeout signal for each HTTP attempt.
 *
 * AbortSignal.timeout() is supported by modern evergreen browsers.
 * A manual AbortController fallback is provided for older runtimes.
 */
function timeoutSignal(): AbortSignal {
    if (
        typeof AbortSignal !== 'undefined' &&
        'timeout' in AbortSignal
    ) {
        return (
            AbortSignal as unknown as {
                timeout(ms: number): AbortSignal;
            }
        ).timeout(REQUEST_TIMEOUT_MS);
    }

    const ac = new AbortController();

    window.setTimeout(() => {
        ac.abort();
    }, REQUEST_TIMEOUT_MS);

    return ac.signal;
}

/**
 * Build common request headers.
 */
function baseHeaders(
    hasBody: boolean,
): Record<string, string> {
    const headers: Record<string, string> = {};

    if (hasBody) {
        headers['Content-Type'] = 'application/json';
    }

    if (isEmbedded()) {
        headers['X-Embedded'] = '1';
    }

    return headers;
}

export class ApiError extends Error {
    status: number;
    code: string;
    details: unknown;

    constructor(
        status: number,
        code: string,
        message: string,
        details: unknown,
    ) {
        super(message);

        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

type Json = unknown;

type RetryState = {
    attempt: number;
    lastRetryAt: number;
};

const RETRY_AFTER_MULTIPLIER = 1.15;
const MAX_SINGLE_BACKOFF_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 4;

/**
 * Small delay helper used by the 429 retry mechanism.
 */
async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) =>
        setTimeout(resolve, ms),
    );
}

/**
 * Parse an API error into the application's ApiError type.
 */
async function parseError(
    res: Response,
): Promise<ApiError> {
    let body: any = null;

    try {
        body = await res.json();
    } catch {
        // Response may not contain JSON.
    }

    const code =
        body?.error?.code ??
        `HTTP_${res.status}`;

    const message =
        body?.error?.message ??
        res.statusText ??
        'Request failed';

    return new ApiError(
        res.status,
        code,
        message,
        body?.error?.details,
    );
}

/**
 * Generate a unique idempotency key for a mutation.
 *
 * crypto.randomUUID() is preferred when available.
 * The fallback is suitable for browsers without randomUUID().
 */
export function newIdempotencyKey(): string {
    if (
        typeof crypto !== 'undefined' &&
        'randomUUID' in crypto
    ) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
}

/**
 * Perform a request with controlled 429 retry behavior.
 *
 * Important:
 * - Every HTTP attempt has its own 20-second timeout.
 * - Only HTTP 429 is retried.
 * - Other 4xx responses are never retried.
 * - 5xx responses are also not retried here.
 * - POST/PATCH requests should use an Idempotency-Key
 *   when they are expected to be safely retried.
 *
 * Embedded mode:
 * - Automatically sends X-Embedded: 1 when the application
 *   is running inside an embedded context.
 */
async function requestWithBackoff<T>(
    method: string,
    path: string,
    body: Json | undefined,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    headers?: HeadersInit,
): Promise<T> {
    let attempt = 0;

    const retryState: RetryState = {
        attempt: 0,
        lastRetryAt: 0,
    };

    while (true) {
        attempt += 1;
        retryState.attempt = attempt;

        const requestHeaders: HeadersInit = {
            ...baseHeaders(
                body !== undefined,
            ),
            ...(headers ?? {}),
        };

        const res = await fetch(path, {
            method,
            credentials: 'include',
            headers: requestHeaders,

            body:
                body !== undefined
                    ? JSON.stringify(body)
                    : undefined,

            // Every individual HTTP attempt gets a fresh
            // 20-second timeout.
            signal: timeoutSignal(),
        });

        /**
         * Retry ONLY on HTTP 429.
         */
        if (
            res.status === 429 &&
            attempt < maxAttempts
        ) {
            const retryAfterHeader =
                res.headers.get(
                    'Retry-After',
                ) ?? '1';

            const retryAfter =
                Number(retryAfterHeader);

            /**
             * Protect against malformed
             * Retry-After headers.
             */
            const safeRetryAfter =
                Number.isFinite(retryAfter) &&
                    retryAfter >= 0
                    ? retryAfter
                    : 1;

            const ms = Math.min(
                MAX_SINGLE_BACKOFF_MS,
                Math.max(
                    250,
                    safeRetryAfter *
                    1000 *
                    RETRY_AFTER_MULTIPLIER **
                    attempt,
                ),
            );

            retryState.lastRetryAt =
                Date.now();

            await sleep(ms);

            continue;
        }

        /**
         * 204 No Content.
         */
        if (res.status === 204) {
            return undefined as T;
        }

        /**
         * Every non-success response is returned
         * immediately after the 429 retry budget
         * is exhausted.
         */
        if (!res.ok) {
            throw await parseError(res);
        }

        /**
         * Some endpoints may return an empty or
         * non-JSON response.
         */
        const contentType =
            res.headers.get(
                'content-type',
            ) ?? '';

        if (
            !contentType.includes(
                'application/json',
            )
        ) {
            return undefined as T;
        }

        return (await res.json()) as T;
    }
}

/**
 * POST helper for operations protected by
 * server-side idempotency handling.
 *
 * A fresh Idempotency-Key is generated for each
 * logical operation.
 *
 * In embedded mode the request also receives:
 * X-Embedded: 1
 */
export async function postIdempotent<T>(
    path: string,
    body: Json,
): Promise<T> {
    const key = newIdempotencyKey();

    return requestWithBackoff<T>(
        'POST',
        path,
        body,
        DEFAULT_MAX_ATTEMPTS,
        {
            ...baseHeaders(true),
            'Idempotency-Key': key,
        },
    );
}

/**
 * Normal API client.
 *
 * All requests ultimately pass through
 * requestWithBackoff(), which means every fetch
 * receives the 20-second timeout.
 */
export const apiClient = {
    async request<T>(
        method: string,
        path: string,
        body?: Json,
    ): Promise<T> {
        return requestWithBackoff<T>(
            method,
            path,
            body,
        );
    },

    get: <T>(path: string) =>
        apiClient.request<T>(
            'GET',
            path,
        ),

    post: <T>(
        path: string,
        body?: Json,
    ) =>
        apiClient.request<T>(
            'POST',
            path,
            body,
        ),

    patch: <T>(
        path: string,
        body?: Json,
    ) =>
        apiClient.request<T>(
            'PATCH',
            path,
            body,
        ),

    delete: <T>(path: string) =>
        apiClient.request<T>(
            'DELETE',
            path,
        ),
};