import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { timeEntriesApi } from './api';
import { projectsApi } from '@/features/projects/api';
import { TimeEntryDrawer } from './TimeEntryDrawer';
import { QueuedEntryRow } from './QueuedEntryRow';
import { OfflineQueueBanner } from './OfflineQueueBanner';
import { useOfflineQueueItems } from './useOfflineQueueItems';
import type { TimeEntry } from './types';
import { Card, CardHeader } from '@/components/ui/Card';
import { Table, THead, TBody, TH, TD } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { classifyError } from '@/lib/errors';

function todayIso() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtMinutes(min: number) {
    if (!min) return '0h 00m';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function TodayEntriesList() {
    const qc = useQueryClient();
    const toast = useToast();
    const [editing, setEditing] = useState<TimeEntry | null>(null);
    const [creating, setCreating] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null);

    const q = useQuery({
        queryKey: ['time-entries', { from_date: todayIso(), to_date: todayIso() }],
        queryFn: () =>
            timeEntriesApi.list({ from_date: todayIso(), to_date: todayIso(), page_size: 100 }),
    });

    const projects = useQuery({
        queryKey: ['projects', { activeOnly: false }],
        queryFn: () => projectsApi.list(false),
    });

    const projectsById = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of projects.data?.data ?? []) m.set(p.id, p.name);
        return m;
    }, [projects.data]);

    const queueItems = useOfflineQueueItems();
    const todayQueued = useMemo(() => {
        const today = todayIso();
        const serverIds = new Set((q.data?.data ?? []).map((e) => e.id));
        return queueItems.filter((i) => {
            const wd = i.payload.work_date ?? today;
            if (wd !== today) return false;
            // Hide items whose server row is already visible.
            if (i.serverId && serverIds.has(i.serverId)) return false;
            return true;
        });
    }, [queueItems, q.data]);

    const del = useMutation({
        mutationFn: (id: string) => timeEntriesApi.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['time-entries'] });
            qc.invalidateQueries({ queryKey: ['attendance'] });
            toast.success('Entry deleted');
            setPendingDelete(null);
        },
        onError: (e) => {
            const c = classifyError(e);
            toast.error('Delete failed', c.message);
        },
    });

    const serverRows = q.data?.data ?? [];
    const hasAnything = serverRows.length > 0 || todayQueued.length > 0;

    return (
        <Card>
            <CardHeader
                title="Today's entries"
                subtitle={
                    hasAnything
                        ? `${serverRows.length} saved · ${todayQueued.length} queued`
                        : undefined
                }
                actions={
                    <Button
                        variant="primary"
                        size="sm"
                        iconLeft="plus"
                        onClick={() => setCreating(true)}
                    >
                        Add time entry
                    </Button>
                }
            />

            {q.isLoading && <SkeletonTable rows={3} cols={6} />}
            {q.isError && (
                <ErrorState
                    title="Failed to load entries"
                    message={classifyError(q.error).message}
                    onRetry={() => q.refetch()}
                />
            )}

            {!q.isLoading && !q.isError && (
                <>
                    <OfflineQueueBanner />
                    {!hasAnything && (
                        <EmptyState
                            icon="clock"
                            title="No entries yet today"
                            description="Log your first task to start tracking time."
                            action={
                                <Button variant="primary" size="sm" iconLeft="plus" onClick={() => setCreating(true)}>
                                    Add time entry
                                </Button>
                            }
                        />
                    )}
                    {hasAnything && (
                        <Table>
                            <THead>
                                <tr>
                                    <TH style={{ width: '22%' }}>Project</TH>
                                    <TH style={{ width: '20%' }}>Task</TH>
                                    <TH>Description</TH>
                                    <TH style={{ width: 80 }}>Duration</TH>
                                    <TH style={{ width: 90 }}>Links</TH>
                                    <TH style={{ width: 130 }}>Status</TH>
                                    <TH style={{ width: 130 }} />
                                </tr>
                            </THead>
                            <TBody>
                                {todayQueued.map((i) => (
                                    <QueuedEntryRow
                                        key={i.key}
                                        item={i}
                                        projectName={projectsById.get(i.payload.project_id) ?? null}
                                        taskTitle={null}
                                    />
                                ))}
                                {serverRows.map((e) => (
                                    <tr key={e.id}>
                                        <TD className="clip">{projectsById.get(e.project_id) ?? e.project_id.slice(0, 8)}</TD>
                                        <TD className="clip">{e.task_title_snapshot ?? <span className="muted">—</span>}</TD>
                                        <TD className="clip">{e.description || <span className="muted">—</span>}</TD>
                                        <TD className="num">{fmtMinutes(e.duration_minutes)}</TD>
                                        <TD>
                                            {e.code_links.length === 0 ? (
                                                <span className="muted">—</span>
                                            ) : (
                                                <span className="row" style={{ gap: 4 }}>
                                                    {e.code_links.slice(0, 2).map((l) => (
                                                        <a
                                                            key={l.id}
                                                            href={l.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="chip-link"
                                                            title={l.url}
                                                        >
                                                            {l.link_type === 'commit' ? '⌥' : l.link_type === 'pull_request' ? 'PR' : '↗'}
                                                        </a>
                                                    ))}
                                                    {e.code_links.length > 2 && (
                                                        <span className="muted small">+{e.code_links.length - 2}</span>
                                                    )}
                                                </span>
                                            )}
                                        </TD>
                                        <TD>
                                            <StatusBadge status={e.status} />
                                        </TD>
                                        <TD className="row-actions">
                                            {(e.status === 'draft' || e.status === 'rejected') && (
                                                <>
                                                    <Button variant="ghost" size="sm" onClick={() => setEditing(e)}>Edit</Button>
                                                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(e)}>Delete</Button>
                                                </>
                                            )}
                                        </TD>
                                    </tr>
                                ))}
                            </TBody>
                        </Table>
                    )}
                </>
            )}

            <TimeEntryDrawer
                open={creating || !!editing}
                onClose={() => { setCreating(false); setEditing(null); }}
                entry={editing}
                defaultDate={todayIso()}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                title="Delete time entry?"
                message={
                    pendingDelete
                        ? `"${pendingDelete.description || 'Untitled entry'}" will be permanently removed.`
                        : undefined
                }
                confirmLabel="Delete"
                danger
                busy={del.isPending}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => pendingDelete && del.mutate(pendingDelete.id)}
            />
        </Card>
    );
}

function StatusBadge({ status }: { status: string }) {
    const tone =
        status === 'approved' ? 'success'
            : status === 'rejected' ? 'danger'
                : status === 'submitted' ? 'info'
                    : 'neutral';
    return <Badge tone={tone}>{status}</Badge>;
}