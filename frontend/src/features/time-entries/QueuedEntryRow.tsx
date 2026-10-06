import { offlineQueue, type QueueItem } from '@/lib/offlineQueue';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

const STATUS_LABEL: Record<QueueItem['status'], string> = {
    pending: 'Pending',
    syncing: 'Syncing',
    saved: 'Saved',
    failed: 'Failed',
    conflict: 'Conflict',
};

const STATUS_TONE: Record<
    QueueItem['status'],
    'neutral' | 'info' | 'success' | 'warning' | 'danger'
> = {
    pending: 'warning',
    syncing: 'info',
    saved: 'success',
    failed: 'danger',
    conflict: 'danger',
};

interface Props {
    item: QueueItem;
    projectName: string | null;
    taskTitle: string | null;
}

export function QueuedEntryRow({ item, projectName, taskTitle }: Props) {
    const canRetry =
        item.status === 'failed' ||
        (item.status === 'pending' && item.attempts > 0);
    const canDiscard = item.status !== 'syncing' && item.status !== 'saved';
    const minutes =
        item.payload.duration_minutes ??
        (item.payload.started_at && item.payload.ended_at
            ? Math.max(
                1,
                Math.round(
                    (new Date(item.payload.ended_at).getTime() -
                        new Date(item.payload.started_at).getTime()) /
                    60000,
                ),
            )
            : 0);

    return (
        <tr className={`queued-row queued-${item.status}`}>
            <td className="clip">
                {projectName ?? <span className="muted">Loading…</span>}
            </td>
            <td className="clip">{taskTitle ?? <span className="muted">—</span>}</td>
            <td className="clip">{item.payload.description || <span className="muted">—</span>}</td>
            <td className="num">{fmtMinutes(minutes)}</td>
            <td>
                {item.payload.code_links && item.payload.code_links.length > 0 ? (
                    <span className="muted small">
                        {item.payload.code_links.length} link{item.payload.code_links.length === 1 ? '' : 's'}
                    </span>
                ) : (
                    <span className="muted">—</span>
                )}
            </td>
            <td>
                <div className="queued-status-cell">
                    <Badge
                        tone={STATUS_TONE[item.status]}
                        icon={item.status === 'syncing' ? 'spinner' : undefined}
                        size="sm"
                    >
                        {STATUS_LABEL[item.status]}
                    </Badge>
                    {item.status === 'failed' && item.attempts > 0 && (
                        <span className="muted small num" title="Attempts">
                            ×{item.attempts}
                        </span>
                    )}
                </div>
                {item.error && item.status !== 'saved' && (
                    <div className="queued-error" title={item.error.message}>
                        {item.error.code === 'TIMESHEET_LOCKED'
                            ? 'This week is already submitted.'
                            : item.error.code === 'TIME_ENTRY_OVERLAP'
                                ? 'Overlaps an existing entry.'
                                : item.error.message}
                    </div>
                )}
            </td>
            <td className="row-actions">
                {canRetry && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                            offlineQueue.update(item.key, {
                                status: 'pending',
                                error: undefined,
                                attempts: 0,
                                nextAttemptAt: undefined,
                            })
                        }
                    >
                        Retry
                    </Button>
                )}
                {canDiscard && (
                    <Button variant="ghost" size="sm" onClick={() => offlineQueue.remove(item.key)}>
                        Discard
                    </Button>
                )}
                {item.status === 'syncing' && (
                    <span className="muted small">
                        <Icon name="spinner" size={12} /> syncing…
                    </span>
                )}
            </td>
        </tr>
    );
}

function fmtMinutes(min: number): string {
    if (!min) return '—';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
}