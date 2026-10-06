import { Badge } from './Badge';
import type { IconName } from './Icon';

export type SyncState = 'synced' | 'pending_push' | 'syncing' | 'conflict' | 'error';

const MAP: Record<SyncState, { tone: 'success' | 'warning' | 'info' | 'danger' | 'neutral'; label: string; icon: IconName }> = {
    synced: { tone: 'success', label: 'Synced', icon: 'check-circle' },
    pending_push: { tone: 'warning', label: 'Pending', icon: 'clock' },
    syncing: { tone: 'info', label: 'Syncing', icon: 'refresh' },
    conflict: { tone: 'danger', label: 'Conflict', icon: 'alert-triangle' },
    error: { tone: 'danger', label: 'Error', icon: 'alert-circle' },
};

export function SyncBadge({ state, errorCode }: { state: SyncState; errorCode?: string | null }) {
    const conf = MAP[state];
    const label = state === 'error' && errorCode ? `${conf.label} · ${errorCode}` : conf.label;
    return <Badge tone={conf.tone} icon={conf.icon} size="sm">{label}</Badge>;
}