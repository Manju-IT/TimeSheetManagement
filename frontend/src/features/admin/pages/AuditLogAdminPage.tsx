import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../api';
import type { AuditLog } from '../types';

export function AuditLogAdminPage() {
    const [action, setAction] = useState('');
    const [entity, setEntity] = useState('');
    const [since, setSince] = useState('');
    const [until, setUntil] = useState('');
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState<AuditLog | null>(null);

    const query = useQuery({
        queryKey: [
            'admin',
            'audit',
            {
                action,
                entity,
                since,
                until,
                page,
            },
        ],
        queryFn: () =>
            adminApi.listAudit({
                action: action || undefined,
                entity: entity || undefined,
                since: since
                    ? new Date(since).toISOString()
                    : undefined,
                until: until
                    ? new Date(until).toISOString()
                    : undefined,
                page,
                page_size: 50,
            }),
    });

    return (
        <div className="audit-page">

            {/* PAGE HEADER */}
            <header className="audit-page-header">
                <div>
                    <h1>Audit log</h1>
                    <p>
                        Review administrative actions and changes made
                        across the organization.
                    </p>
                </div>
            </header>

            {/* FILTERS */}
            <section className="audit-filter-card">

                <div className="audit-filter-header">
                    <div>
                        <h2>Filters</h2>
                        <p>
                            Narrow the audit history by action, entity,
                            or time range.
                        </p>
                    </div>
                </div>

                <div className="audit-filters">

                    <label className="audit-filter-field">
                        <span>Action</span>
                        <input
                            placeholder="e.g. role.grant"
                            value={action}
                            onChange={(e) => {
                                setAction(e.target.value);
                                setPage(1);
                            }}
                        />
                    </label>

                    <label className="audit-filter-field">
                        <span>Entity</span>
                        <input
                            placeholder="e.g. task"
                            value={entity}
                            onChange={(e) => {
                                setEntity(e.target.value);
                                setPage(1);
                            }}
                        />
                    </label>

                    <label className="audit-filter-field">
                        <span>From</span>
                        <input
                            type="datetime-local"
                            value={since}
                            onChange={(e) => {
                                setSince(e.target.value);
                                setPage(1);
                            }}
                        />
                    </label>

                    <label className="audit-filter-field">
                        <span>To</span>
                        <input
                            type="datetime-local"
                            value={until}
                            onChange={(e) => {
                                setUntil(e.target.value);
                                setPage(1);
                            }}
                        />
                    </label>

                </div>
            </section>

            {/* AUDIT TABLE */}
            <section className="audit-table-card">

                <div className="audit-table-header">
                    <div>
                        <h2>Activity</h2>
                        {query.data && (
                            <p>
                                {query.data.pagination.total} total records
                            </p>
                        )}
                    </div>
                </div>

                <div className="audit-table-wrapper">

                    {query.isLoading && (
                        <div className="audit-empty">
                            Loading audit records…
                        </div>
                    )}

                    {query.isError && (
                        <div className="audit-empty audit-empty-error">
                            Failed to load audit records.
                        </div>
                    )}

                    {query.data && (
                        <table className="audit-table">

                            <thead>
                                <tr>
                                    <th>When</th>
                                    <th>Actor</th>
                                    <th>Action</th>
                                    <th>Entity</th>
                                    <th>IP address</th>
                                    <th className="audit-action-column">
                                        <span className="sr-only">
                                            Actions
                                        </span>
                                    </th>
                                </tr>
                            </thead>

                            <tbody>

                                {query.data.data.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="audit-no-results"
                                        >
                                            No audit records found.
                                        </td>
                                    </tr>
                                )}

                                {query.data.data.map((r) => (
                                    <tr key={r.id}>

                                        <td>
                                            <span className="audit-primary-value">
                                                {new Date(
                                                    r.created_at
                                                ).toLocaleString()}
                                            </span>
                                        </td>

                                        <td>
                                            <span className="audit-actor">
                                                {r.actor_user_id
                                                    ? r.actor_user_id.slice(0, 8)
                                                    : '—'}
                                            </span>
                                        </td>

                                        <td>
                                            <span className="audit-action-badge">
                                                {r.action}
                                            </span>
                                        </td>

                                        <td>
                                            <span className="audit-entity">
                                                {r.entity}
                                            </span>
                                        </td>

                                        <td>
                                            <span className="audit-ip">
                                                {r.ip ?? '—'}
                                            </span>
                                        </td>

                                        <td className="audit-action-column">
                                            <button
                                                type="button"
                                                className="audit-view-button"
                                                onClick={() => setOpen(r)}
                                            >
                                                View
                                            </button>
                                        </td>

                                    </tr>
                                ))}

                            </tbody>

                        </table>
                    )}

                </div>

                {/* PAGINATION */}
                {query.data && (
                    <div className="audit-pager">

                        <button
                            type="button"
                            className="audit-pager-button"
                            disabled={page <= 1}
                            onClick={() =>
                                setPage((current) => current - 1)
                            }
                        >
                            ← Prev
                        </button>

                        <span className="audit-pager-status">
                            Page <strong>{page}</strong>
                            <span>·</span>
                            {query.data.pagination.total} total
                        </span>

                        <button
                            type="button"
                            className="audit-pager-button"
                            disabled={
                                !query.data.pagination.has_next
                            }
                            onClick={() =>
                                setPage((current) => current + 1)
                            }
                        >
                            Next →
                        </button>

                    </div>
                )}

            </section>

            {/* DETAIL SHEET */}
            {open && (
                <div
                    className="audit-sheet-backdrop"
                    onClick={() => setOpen(null)}
                >
                    <aside
                        className="audit-sheet"
                        onClick={(e) => e.stopPropagation()}
                    >

                        <header className="audit-sheet-header">

                            <div>
                                <span className="audit-sheet-label">
                                    Audit event
                                </span>

                                <h2>{open.action}</h2>
                            </div>

                            <button
                                type="button"
                                className="audit-close-button"
                                onClick={() => setOpen(null)}
                                aria-label="Close audit details"
                            >
                                ×
                            </button>

                        </header>

                        <div className="audit-sheet-body">

                            <div className="audit-detail-grid">

                                <Kv
                                    k="When"
                                    v={new Date(
                                        open.created_at
                                    ).toLocaleString()}
                                />

                                <Kv
                                    k="Actor"
                                    v={open.actor_user_id ?? '—'}
                                />

                                <Kv
                                    k="Entity"
                                    v={`${open.entity} / ${open.entity_id ?? '—'
                                        }`}
                                />

                                <Kv
                                    k="IP address"
                                    v={open.ip ?? '—'}
                                />

                            </div>

                            <div className="audit-json-section">
                                <div className="audit-json-header">
                                    <h3>Before</h3>
                                </div>

                                <pre className="audit-json">
                                    {JSON.stringify(
                                        open.before,
                                        null,
                                        2
                                    )}
                                </pre>
                            </div>

                            <div className="audit-json-section">
                                <div className="audit-json-header">
                                    <h3>After</h3>
                                </div>

                                <pre className="audit-json">
                                    {JSON.stringify(
                                        open.after,
                                        null,
                                        2
                                    )}
                                </pre>
                            </div>

                        </div>

                    </aside>
                </div>
            )}

        </div>
    );
}

function Kv({
    k,
    v,
}: {
    k: string;
    v: string;
}) {
    return (
        <div className="audit-kv">

            <span className="audit-kv-label">
                {k}
            </span>

            <span className="audit-kv-value">
                {v}
            </span>

        </div>
    );
}