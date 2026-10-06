import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/features/projects/api';
import { tasksApi } from './api';
import type { SyncState, Task } from './types';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { SyncBadge } from '@/components/ui/SyncBadge';
import { PageHeader } from '@/layouts/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, THead, TBody, TH, TD } from '@/components/ui/Table';
import { Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { classifyError } from '@/lib/errors';

const SYNC_STATES: (SyncState | '')[] = ['', 'synced', 'pending_push', 'syncing', 'conflict', 'error'];

export function TasksPage() {
    const [projectId, setProjectId] = useState('');
    const [syncState, setSyncState] = useState<SyncState | ''>('');
    const [openTask, setOpenTask] = useState<Task | null>(null);

    const projects = useQuery({
        queryKey: ['projects', { activeOnly: true }],
        queryFn: () => projectsApi.list(true),
    });

    const tasks = useQuery({
        queryKey: ['tasks', { project_id: projectId, sync_state: syncState }],
        queryFn: () =>
            tasksApi.list({
                project_id: projectId || undefined,
                sync_state: syncState || undefined,
                page_size: 100,
            }),
    });

    return (
        <div className="page">
            <PageHeader
                title="Tasks"
                subtitle="Synced from GitHub Projects"
                actions={
                    <div className="row">
                        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Filter by project">
                            <option value="">All projects</option>
                            {(projects.data?.data ?? []).map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </Select>
                        <Select value={syncState} onChange={(e) => setSyncState(e.target.value as SyncState | '')} aria-label="Filter by sync state">
                            {SYNC_STATES.map((s) => (
                                <option key={s} value={s}>{s ? s.replace('_', ' ') : 'Any sync state'}</option>
                            ))}
                        </Select>
                    </div>
                }
            />

            <Card padded={false}>
                {tasks.isLoading && <div style={{ padding: 16 }}><SkeletonTable rows={6} cols={5} /></div>}
                {tasks.isError && (
                    <div style={{ padding: 16 }}>
                        <ErrorState message={classifyError(tasks.error).message} onRetry={() => tasks.refetch()} />
                    </div>
                )}
                {tasks.data && tasks.data.data.length === 0 && (
                    <EmptyState
                        icon="file-text"
                        title="No tasks match the filters"
                        description="Adjust the project or sync-state filter, or link a GitHub project in Admin."
                    />
                )}
                {tasks.data && tasks.data.data.length > 0 && (
                    <Table>
                        <THead>
                            <tr>
                                <TH>Task</TH>
                                <TH style={{ width: 120 }}>Status</TH>
                                <TH style={{ width: 110 }}>Source</TH>
                                <TH style={{ width: 140 }}>Assignee</TH>
                                <TH style={{ width: 140 }}>Sync</TH>
                                <TH style={{ width: 60 }} />
                            </tr>
                        </THead>
                        <TBody>
                            {tasks.data.data.map((t) => (
                                <tr key={t.id} onClick={() => setOpenTask(t)} className="clickable">
                                    <TD>
                                        <div className="task-title">
                                            {t.gh_issue_number != null && <span className="muted num">#{t.gh_issue_number}</span>}
                                            <span>{t.title}</span>
                                        </div>
                                    </TD>
                                    <TD><span className="muted">{t.status}</span></TD>
                                    <TD>
                                        {t.source === 'github'
                                            ? <span className="row" style={{ gap: 4 }}><Icon name="github" size={12} /> GitHub</span>
                                            : <span className="muted">Manual</span>}
                                    </TD>
                                    <TD className="muted small">{t.assignee_user_id?.slice(0, 8) ?? '—'}</TD>
                                    <TD><SyncBadge state={t.sync_state} errorCode={t.sync_last_error_code} /></TD>
                                    <TD>
                                        {t.gh_url && (
                                            <a
                                                href={t.gh_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="icon-btn"
                                                aria-label="Open in GitHub"
                                            >
                                                <Icon name="external-link" size={12} />
                                            </a>
                                        )}
                                    </TD>
                                </tr>
                            ))}
                        </TBody>
                    </Table>
                )}
            </Card>

            {openTask && <TaskDetailDrawer task={openTask} onClose={() => setOpenTask(null)} />}
        </div>
    );
}