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

    const rows = tasks.data?.data ?? [];
    const syncedCount = rows.filter((task) => task.sync_state === 'synced').length;
    const attentionCount = rows.filter((task) =>
        task.sync_state === 'conflict' || task.sync_state === 'error'
    ).length;
    const pendingCount = rows.filter((task) =>
        task.sync_state === 'pending_push' || task.sync_state === 'syncing'
    ).length;

    return (
        <div className="page tasks-page tasks-page-polished">
            <PageHeader
                title="Tasks"
                subtitle="A unified view of work synced from GitHub Projects."
                actions={
                    <div className="tasks-filter-bar">
                        <label className="tasks-filter">
                            <span>Project</span>
                            <Select
                                value={projectId}
                                onChange={(e) => setProjectId(e.target.value)}
                                aria-label="Filter by project"
                            >
                                <option value="">All projects</option>
                                {(projects.data?.data ?? []).map((project) => (
                                    <option key={project.id} value={project.id}>
                                        {project.name}
                                    </option>
                                ))}
                            </Select>
                        </label>
                        <label className="tasks-filter">
                            <span>Sync status</span>
                            <Select
                                value={syncState}
                                onChange={(e) => setSyncState(e.target.value as SyncState | '')}
                                aria-label="Filter by sync state"
                            >
                                {SYNC_STATES.map((state) => (
                                    <option key={state} value={state}>
                                        {state ? state.replaceAll('_', ' ') : 'All sync states'}
                                    </option>
                                ))}
                            </Select>
                        </label>
                    </div>
                }
            />

            <section className="tasks-overview" aria-label="Task overview">
                <div className="tasks-overview-copy">
                    <div className="tasks-overview-icon">
                        <Icon name="list-checks" size={21} />
                    </div>
                    <div>
                        <div className="tasks-overview-title">Work overview</div>
                        <p>Review task status and keep local work aligned with GitHub.</p>
                    </div>
                </div>
                <div className="tasks-overview-metrics">
                    <div className="tasks-metric">
                        <span className="tasks-metric-label">Tasks shown</span>
                        <strong>{tasks.isLoading ? '—' : rows.length}</strong>
                    </div>
                    <div className="tasks-metric">
                        <span className="tasks-metric-label">Synced</span>
                        <strong className="tasks-metric-success">{tasks.isLoading ? '—' : syncedCount}</strong>
                    </div>
                    <div className="tasks-metric">
                        <span className="tasks-metric-label">In progress</span>
                        <strong>{tasks.isLoading ? '—' : pendingCount}</strong>
                    </div>
                    <div className="tasks-metric">
                        <span className="tasks-metric-label">Needs attention</span>
                        <strong className={attentionCount ? 'tasks-metric-warning' : ''}>
                            {tasks.isLoading ? '—' : attentionCount}
                        </strong>
                    </div>
                </div>
            </section>

            <Card padded={false}>
                <div className="tasks-table-heading">
                    <div>
                        <h2>Task directory</h2>
                        <p>
                            {tasks.isLoading
                                ? 'Loading tasks…'
                                : `${rows.length} ${rows.length === 1 ? 'task' : 'tasks'} in the current view`}
                        </p>
                    </div>
                    <span className="tasks-live-indicator">
                        <span />
                        Live workspace data
                    </span>
                </div>

                {tasks.isLoading && (
                    <div className="tasks-loading">
                        <SkeletonTable rows={6} cols={5} />
                    </div>
                )}

                {tasks.isError && (
                    <div className="tasks-loading">
                        <ErrorState
                            message={classifyError(tasks.error).message}
                            onRetry={() => tasks.refetch()}
                        />
                    </div>
                )}

                {tasks.data && rows.length === 0 && (
                    <div className="tasks-empty">
                        <EmptyState
                            icon="file-text"
                            title="No tasks match these filters"
                            description="Try another project or sync state. You can also link a GitHub project in Admin."
                        />
                    </div>
                )}

                {tasks.data && rows.length > 0 && (
                    <div className="tasks-table-scroll">
                        <Table>
                            <THead>
                                <tr>
                                    <TH>Task</TH>
                                    <TH style={{ width: 125 }}>Status</TH>
                                    <TH style={{ width: 125 }}>Source</TH>
                                    <TH style={{ width: 150 }}>Assignee</TH>
                                    <TH style={{ width: 145 }}>Sync state</TH>
                                    <TH style={{ width: 64 }} />
                                </tr>
                            </THead>
                            <TBody>
                                {rows.map((task) => (
                                    <tr
                                        key={task.id}
                                        onClick={() => setOpenTask(task)}
                                        className="clickable tasks-data-row"
                                        tabIndex={0}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                setOpenTask(task);
                                            }
                                        }}
                                        aria-label={`Open task ${task.title}`}
                                    >
                                        <TD>
                                            <div className="tasks-task-cell">
                                                <span className={`tasks-task-icon ${task.source === 'github' ? 'is-github' : ''}`}>
                                                    <Icon
                                                        name={task.source === 'github' ? 'github' : 'check-square'}
                                                        size={15}
                                                    />
                                                </span>
                                                <div className="tasks-task-copy">
                                                    <div className="tasks-task-title">
                                                        {task.title}
                                                        {task.gh_issue_number != null && (
                                                            <span className="tasks-issue-number">
                                                                #{task.gh_issue_number}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="tasks-task-hint">
                                                        {task.gh_repo || (task.source === 'github' ? 'GitHub issue' : 'Manually created task')}
                                                    </span>
                                                </div>
                                            </div>
                                        </TD>
                                        <TD>
                                            <span className={`tasks-status-text status-${task.status.toLowerCase().replaceAll(' ', '-')}`}>
                                                <span />
                                                {task.status.replaceAll('_', ' ')}
                                            </span>
                                        </TD>
                                        <TD>
                                            {task.source === 'github' ? (
                                                <span className="tasks-source tasks-source-github">
                                                    <Icon name="github" size={14} />
                                                    GitHub
                                                </span>
                                            ) : (
                                                <span className="tasks-source">Manual</span>
                                            )}
                                        </TD>
                                        <TD>
                                            <span className="tasks-assignee">
                                                <span className="tasks-assignee-avatar">
                                                    {task.assignee_user_id ? task.assignee_user_id.slice(0, 1).toUpperCase() : '—'}
                                                </span>
                                                <span>{task.assignee_user_id?.slice(0, 8) ?? 'Unassigned'}</span>
                                            </span>
                                        </TD>
                                        <TD>
                                            <SyncBadge state={task.sync_state} errorCode={task.sync_last_error_code} />
                                        </TD>
                                        <TD>
                                            <div className="tasks-row-actions">
                                                {task.gh_url && (
                                                    <a
                                                        href={task.gh_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(event) => event.stopPropagation()}
                                                        className="icon-btn"
                                                        aria-label="Open in GitHub"
                                                        title="Open in GitHub"
                                                    >
                                                        <Icon name="external-link" size={14} />
                                                    </a>
                                                )}
                                                <span className="tasks-open-indicator" aria-hidden="true">›</span>
                                            </div>
                                        </TD>
                                    </tr>
                                ))}
                            </TBody>
                        </Table>
                    </div>
                )}
            </Card>

            {openTask && (
                <TaskDetailDrawer task={openTask} onClose={() => setOpenTask(null)} />
            )}
        </div>
    );
}
