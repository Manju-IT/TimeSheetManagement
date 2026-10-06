import type { ClassifiedError } from '@/lib/errors';
import type { QueueError } from '@/lib/offlineQueue';

/**
 * Which errors are safe to retry later?
 *
 * Retryable:
 *   - network / offline  (we don't know if the server received it)
 *   - 429 rate limited    (Retry-After handled by the flush loop)
 *   - 5xx server errors   (transient by definition)
 *
 * Not retryable:
 *   - 422 validation, 401, 403, 404, 409 (state conflict)
 *   - 409 STALE_WRITE (shouldn't occur for creates, but guard anyway)
 *
 * On non-retryable errors the item is surfaced to the user as `failed` or
 * `conflict` and can only be retried manually after the user has fixed
 * whatever caused it.
 */
export function isRetryable(c: ClassifiedError): boolean {
    return (
        c.kind === 'network' ||
        c.kind === 'offline' ||
        c.kind === 'rate-limited' ||
        c.kind === 'server'
    );
}

export function toQueueError(err: unknown, c: ClassifiedError): QueueError {
    return {
        code: c.code || 'UNKNOWN',
        message: c.message,
        status: c.status,
        retryable: isRetryable(c),
        details: c.details,
    };
}