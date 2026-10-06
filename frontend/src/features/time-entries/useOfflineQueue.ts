import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { offlineQueue, type QueueItem } from '@/lib/offlineQueue';
import { classifyError } from '@/lib/errors';
import { timeEntriesApi } from './api';
import { isRetryable, toQueueError } from './queueHelpers';

const TICK_MS = 3000;
const BASE_BACKOFF_MS = 4000;
const MAX_BACKOFF_MS = 60_000;
const MAX_AUTO_ATTEMPTS = 8;

function backoffMs(attempts: number): number {
    const raw = BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempts - 1));
    return Math.min(raw, MAX_BACKOFF_MS);
}

export function useOfflineQueue() {
    const qc = useQueryClient();
    const [items, setItems] = useState<QueueItem[]>(() => offlineQueue.snapshot());
    const [online, setOnline] = useState<boolean>(
        typeof navigator === 'undefined' ? true : navigator.onLine,
    );
    const runningRef = useRef(false);

    // Store subscription.
    useEffect(() => offlineQueue.subscribe(setItems), []);

    // Browser online / offline.
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);

    // Single-flight flush. Reads the store snapshot; React state is not used
    // inside the loop so concurrent state updates cannot cause double sends.
    const flush = useMemo(() => {
        return async function run(force = false): Promise<void> {
            if (runningRef.current) return;
            if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

            const snapshot = offlineQueue.snapshot();
            const now = Date.now();
            const eligible = snapshot.filter((i) => {
                if (i.status === 'saved' || i.status === 'syncing' || i.status === 'conflict') return false;
                if (i.status === 'failed' && i.error && !i.error.retryable) return false;
                if (!force && i.attempts >= MAX_AUTO_ATTEMPTS) return false;
                if (!force && i.nextAttemptAt && i.nextAttemptAt > now) return false;
                return true;
            });
            if (eligible.length === 0) return;

            runningRef.current = true;
            try {
                for (const item of eligible) {
                    offlineQueue.update(item.key, {
                        status: 'syncing',
                        attempts: item.attempts + 1,
                        lastAttemptAt: Date.now(),
                    });

                    try {
                        const entry = await timeEntriesApi.create({
                            ...item.payload,
                            client_idempotency_key: item.key,
                        });
                        offlineQueue.update(item.key, {
                            status: 'saved',
                            serverId: entry.id,
                            error: undefined,
                            nextAttemptAt: undefined,
                        });
                        qc.invalidateQueries({ queryKey: ['time-entries'] });
                        qc.invalidateQueries({ queryKey: ['attendance'] });
                        qc.invalidateQueries({ queryKey: ['timesheet'] });
                        // Flash "Saved" briefly, then drop it from the visible queue.
                        window.setTimeout(() => offlineQueue.remove(item.key), 2500);
                    } catch (err) {
                        const c = classifyError(err);
                        const attempts = item.attempts + 1;

                        if (c.kind === 'validation' || c.kind === 'auth' || c.kind === 'forbidden') {
                            offlineQueue.update(item.key, {
                                status: 'failed',
                                error: { ...toQueueError(err, c), retryable: false },
                                nextAttemptAt: undefined,
                            });
                            continue;
                        }
                        if (c.kind === 'conflict' && c.code !== 'STALE_WRITE') {
                            offlineQueue.update(item.key, {
                                status: 'conflict',
                                error: { ...toQueueError(err, c), retryable: false },
                                nextAttemptAt: undefined,
                            });
                            continue;
                        }
                        if (c.kind === 'stale') {
                            // The entry exists but the caller doesn't own it in this tab.
                            // Surface it; user needs to reload.
                            offlineQueue.update(item.key, {
                                status: 'conflict',
                                error: { ...toQueueError(err, c), retryable: false },
                                nextAttemptAt: undefined,
                            });
                            continue;
                        }
                        if (!isRetryable(c) && attempts >= 1) {
                            offlineQueue.update(item.key, {
                                status: 'failed',
                                error: toQueueError(err, c),
                                nextAttemptAt: undefined,
                            });
                            continue;
                        }
                        // Retryable: schedule a backoff.
                        offlineQueue.update(item.key, {
                            status: 'failed',
                            error: toQueueError(err, c),
                            nextAttemptAt: Date.now() + backoffMs(attempts),
                        });
                    }
                }
            } finally {
                runningRef.current = false;
            }
        };
    }, [qc]);

    // Derive a boolean so the interval is not reset on every item update.
    const hasWork = useMemo(
        () =>
            items.some(
                (i) =>
                    i.status === 'pending' ||
                    (i.status === 'failed' && (i.error?.retryable ?? true)),
            ),
        [items],
    );

    useEffect(() => {
        if (!online || !hasWork) return;
        const id = window.setInterval(() => {
            void flush(false);
        }, TICK_MS);
        // Try once immediately so a fresh item doesn't wait a full tick.
        void flush(false);
        return () => window.clearInterval(id);
    }, [online, hasWork, flush]);

    return { items, online, flush, hasWork };
}