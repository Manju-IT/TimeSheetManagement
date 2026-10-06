import { useState } from 'react';
import {
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';

import { adminApi } from '../api';

import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { classifyError } from '@/lib/errors';

export function SyncLogAdminPage() {
    const qc = useQueryClient();

    const [direction, setDirection] = useState('');
    const [entity, setEntity] = useState('');
    const [trigger, setTrigger] = useState('');
    const [status, setStatus] = useState('');
    const [page, setPage] = useState(1);

    const query = useQuery({
        queryKey: [
            'admin',
            'sync-logs',
            {
                direction,
                entity,
                trigger,
                status,
                page,
            },
        ],
        queryFn: () =>
            adminApi.listSyncLogs({
                direction: direction || undefined,
                entity: entity || undefined,
                trigger: trigger || undefined,
                status: status || undefined,
                page,
                page_size: 50,
            }),
        refetchInterval: 15_000,
    });

    const retry = useMutation({
        mutationFn: (taskId: string) =>
            adminApi.retrySync(taskId),

        onSuccess: () =>
            qc.invalidateQueries({
                queryKey: ['admin', 'sync-logs'],
            }),
    });

    return (
        <div className="sync-log-page">

            <header className="sync-log-page-header">
                <div>
                    <h1>Sync log</h1>
                    <p>
                        Monitor GitHub synchronization activity,
                        failures, and retryable operations.
                    </p>
                </div>
            </header>

            <section className="sync-log-filter-card">

                <div className="sync-log-card-header">
                    <div>
                        <h2>Filters</h2>
                        <p>
                            Filter synchronization events by
                            direction, entity, trigger, and status.
                        </p>
                    </div>
                </div>

                <div className="sync-log-filters">

                    {/* KEEP YOUR EXISTING DROPDOWNS HERE */}

                    <label className="sync-log-filter-field">
                        <span>Direction</span>
                        <select
                            value={direction}
                            onChange={(e) => {
                                setDirection(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">All directions</option>
                            <option value="pull">Pull</option>
                            <option value="push">Push</option>
                        </select>
                    </label>

                    <label className="sync-log-filter-field">
                        <span>Entity</span>
                        <select
                            value={entity}
                            onChange={(e) => {
                                setEntity(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">All entities</option>
                            <option value="project">Project</option>
                            <option value="task">Task</option>
                        </select>
                    </label>

                    <label className="sync-log-filter-field">
                        <span>Trigger</span>
                        <select
                            value={trigger}
                            onChange={(e) => {
                                setTrigger(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">All triggers</option>
                            <option value="manual">Manual</option>
                            <option value="webhook">Webhook</option>
                            <option value="worker">Worker</option>
                        </select>
                    </label>

                    <label className="sync-log-filter-field">
                        <span>Status</span>
                        <select
                            value={status}
                            onChange={(e) => {
                                setStatus(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">All statuses</option>
                            <option value="success">Success</option>
                            <option value="failed">Failed</option>
                            <option value="running">Running</option>
                        </select>
                    </label>

                </div>
            </section>

            <section className="sync-log-table-card">

                <div className="sync-log-card-header">
                    <div>
                        <h2>Synchronization activity</h2>

                        {query.data && (
                            <p>
                                {query.data.pagination.total} total
                                records
                            </p>
                        )}
                    </div>
                </div>

                {query.isLoading && (
                    <div className="sync-log-loading">
                        <SkeletonTable
                            rows={6}
                            cols={5}
                        />
                    </div>
                )}

                {query.isError && (
                    <div className="sync-log-error">
                        <ErrorState
                            title="Failed to load sync log"
                            message={
                                classifyError(query.error).message
                            }
                            onRetry={() => query.refetch()}
                        />
                    </div>
                )}

                {query.data &&
                    query.data.data.length === 0 && (
                        <EmptyState
                            icon="refresh"
                            title="No synchronization activity yet"
                            description="Once GitHub projects are linked and items are synced, every pull and push is recorded here."
                        />
                    )}

                {query.data &&
                    query.data.data.length > 0 && (
                        <>
                            <div className="sync-log-table-wrapper">

                                <table className="sync-log-table">

                                    <thead>
                                        <tr>
                                            <th>When</th>
                                            <th>Direction</th>
                                            <th>Entity</th>
                                            <th>Trigger</th>
                                            <th>Status</th>
                                            <th>Error</th>
                                            <th />
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {query.data.data.map((r) => (
                                            <tr key={r.id}>

                                                <td>
                                                    {new Date(
                                                        r.created_at
                                                    ).toLocaleTimeString()}
                                                </td>

                                                <td>
                                                    <span
                                                        className={`sync-direction sync-direction-${r.direction}`}
                                                    >
                                                        {r.direction}
                                                    </span>
                                                </td>

                                                <td>
                                                    {r.entity}
                                                </td>

                                                <td>
                                                    {r.trigger}
                                                </td>

                                                <td>
                                                    <span
                                                        className={`sync-status sync-status-${r.status}`}
                                                    >
                                                        {r.status}
                                                    </span>
                                                </td>

                                                <td>
                                                    <span className="sync-error-text">
                                                        {r.error_message ??
                                                            '—'}
                                                    </span>
                                                </td>

                                                <td className="sync-log-action">
                                                    {r.status === 'failed' &&
                                                        r.entity === 'task' &&
                                                        r.entity_id && (
                                                            <button
                                                                type="button"
                                                                className="sync-retry-button"
                                                                disabled={
                                                                    retry.isPending
                                                                }
                                                                onClick={() =>
                                                                    retry.mutate(
                                                                        r.entity_id!
                                                                    )
                                                                }
                                                            >
                                                                {retry.isPending
                                                                    ? 'Retrying…'
                                                                    : 'Retry'}
                                                            </button>
                                                        )}
                                                </td>

                                            </tr>
                                        ))}
                                    </tbody>

                                </table>
                            </div>

                            <div className="sync-log-pager">

                                <button
                                    type="button"
                                    className="sync-pager-button"
                                    disabled={page <= 1}
                                    onClick={() =>
                                        setPage(
                                            (current) =>
                                                current - 1
                                        )
                                    }
                                >
                                    ← Prev
                                </button>

                                <span>
                                    Page <strong>{page}</strong>
                                    <span> · </span>
                                    {query.data.pagination.total}
                                    {' '}total
                                </span>

                                <button
                                    type="button"
                                    className="sync-pager-button"
                                    disabled={
                                        !query.data.pagination
                                            .has_next
                                    }
                                    onClick={() =>
                                        setPage(
                                            (current) =>
                                                current + 1
                                        )
                                    }
                                >
                                    Next →
                                </button>

                            </div>
                        </>
                    )}

            </section>

        </div>
    );
}