/**
 * Small persistent queue for time-entry creates.
 *
 * Design constraints:
 *  - Only "create" mutations are queued. Edits / deletes need the server's
 *    current `version` and are rejected offline instead of being replayed
 *    blindly.
 *  - One item per client idempotency key. The key travels with the item to the
 *    server; the server's UNIQUE(user_id, client_idempotency_key) rejects any
 *    duplicate row that slipped through.
 *  - Multi-tab safe by construction: if two tabs send the same key, the
 *    backend returns the prior row (idempotent). The queue does not need a
 *    cross-tab lock.
 *  - No retries, no timers, no fetch calls live here. This module is a pure
 *    store. The flush loop lives in `useOfflineQueue`.
 */

export type QueueStatus = 'pending' | 'syncing' | 'saved' | 'failed' | 'conflict';

export interface QueueError {
    code: string;
    message: string;
    status: number;
    retryable: boolean;
    details?: Record<string, unknown>;
}

export interface QueuedPayload {
    project_id: string;
    task_id?: string | null;
    description?: string;
    duration_minutes?: number | null;
    started_at?: string | null;
    ended_at?: string | null;
    billable?: boolean;
    work_date?: string | null;
    code_links?: { url: string; note?: string | null }[];
}

export interface QueueItem {
    key: string;                // client idempotency key
    payload: QueuedPayload;
    createdAt: number;
    status: QueueStatus;
    attempts: number;
    lastAttemptAt?: number;
    nextAttemptAt?: number;
    serverId?: string;          // set once the server returns the created row
    error?: QueueError;
}

const STORAGE_KEY = 'ts.offlineQueue.v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Listener = (items: QueueItem[]) => void;

let items: QueueItem[] = load();
const listeners = new Set<Listener>();

function load(): QueueItem[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as QueueItem[];
        if (!Array.isArray(parsed)) return [];
        const cutoff = Date.now() - MAX_AGE_MS;
        return parsed.filter((i) => {
            if (!i || typeof i.key !== 'string' || typeof i.createdAt !== 'number') return false;
            if (i.createdAt < cutoff) return false;
            // Items that completed before reload are no longer needed.
            if (i.status === 'saved') return false;
            return true;
        });
    } catch {
        return [];
    }
}

function persist() {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
        // Storage disabled or full. Degrade silently; the in-memory queue still works.
    }
}

function emit() {
    const snapshot = items.slice();
    for (const l of listeners) l(snapshot);
}

export const offlineQueue = {
    snapshot(): QueueItem[] {
        return items.slice();
    },

    subscribe(fn: Listener): () => void {
        listeners.add(fn);
        return () => {
            listeners.delete(fn);
        };
    },

    has(key: string): boolean {
        return items.some((i) => i.key === key);
    },

    /** Insert or update an item with the given idempotency key. */
    enqueue(payload: QueuedPayload, key: string, error?: QueueError): QueueItem {
        const existing = items.find((i) => i.key === key);
        if (existing) {
            if (error) {
                existing.error = error;
                existing.status = error.retryable ? 'failed' : 'conflict';
            }
            persist();
            emit();
            return existing;
        }
        const item: QueueItem = {
            key,
            payload,
            createdAt: Date.now(),
            status: error ? (error.retryable ? 'failed' : 'conflict') : 'pending',
            attempts: 0,
            error,
            nextAttemptAt: error?.retryable ? Date.now() + 2000 : undefined,
        };
        items = [item, ...items];
        persist();
        emit();
        return item;
    },

    update(key: string, patch: Partial<QueueItem>) {
        let changed = false;
        items = items.map((i) => {
            if (i.key !== key) return i;
            changed = true;
            return { ...i, ...patch };
        });
        if (changed) {
            persist();
            emit();
        }
    },

    remove(key: string) {
        const before = items.length;
        items = items.filter((i) => i.key !== key);
        if (items.length !== before) {
            persist();
            emit();
        }
    },

    clearAll() {
        items = [];
        persist();
        emit();
    },
};