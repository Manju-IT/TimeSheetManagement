import type { SyncState } from './types';

const LABEL: Record<SyncState, string> = {
    synced: 'Synced',
    pending_push: 'Pending',
    syncing: 'Syncing…',
    conflict: 'Conflict',
    error: 'Error',
};

export function SyncBadge({
    state,
    errorCode,
}: {
    state: SyncState;
    errorCode?: string | null;
}) {
    return (
        <span className={`sync-${state}`}>
            {LABEL[state] ?? state}
            {state === 'error' && errorCode
                ? ` · ${errorCode}`
                : ''}
        </span>
    );
}