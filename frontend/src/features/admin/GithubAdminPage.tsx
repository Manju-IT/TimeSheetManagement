import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

interface Connection {
    ok: boolean;
    viewer_login: string | null;
    mode: string;
    error: string | null;
}

interface Link {
    id: string;
    project_id: string;
    gh_owner: string;
    gh_project_number: number;
    gh_project_node_id: string;
    last_synced_at: string | null;
}

interface SyncLog {
    id: string;
    direction: string;
    entity: string;
    status: string;
    error_message: string | null;
    created_at: string;
}

const api = {
    connection: () =>
        apiClient.get<Connection>(
            '/api/v1/admin/github/connection'
        ),

    links: () =>
        apiClient.get<Link[]>(
            '/api/v1/admin/github/links'
        ),

    logs: () =>
        apiClient.get<{ data: SyncLog[] }>(
            '/api/v1/admin/github/sync-logs?page_size=30'
        ),

    sync: (id: string) =>
        apiClient.post(
            `/api/v1/admin/github/links/${id}/sync`
        ),

    fullResync: () =>
        apiClient.post(
            '/api/v1/admin/github/full-resync'
        ),
};

export function GithubAdminPage() {
    const qc = useQueryClient();

    const conn = useQuery({
        queryKey: ['gh', 'connection'],
        queryFn: api.connection,
    });

    const links = useQuery({
        queryKey: ['gh', 'links'],
        queryFn: api.links,
    });

    const logs = useQuery({
        queryKey: ['gh', 'logs'],
        queryFn: api.logs,
        refetchInterval: 15_000,
    });

    const sync = useMutation({
        mutationFn: api.sync,
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ['gh'],
            });
        },
    });

    const full = useMutation({
        mutationFn: api.fullResync,
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ['gh'],
            });
        },
    });

    return (
        <div className="github-page">

            {/* PAGE HEADER */}
            <header className="github-page-header">

                <div>
                    <h1>GitHub integration</h1>

                    <p>
                        Manage the GitHub connection, linked projects,
                        and synchronization activity.
                    </p>
                </div>

            </header>

            {/* CONNECTION */}
            <section className="github-card">

                <div className="github-card-header">

                    <div>
                        <h2>Connection</h2>

                        <p>
                            GitHub App connection status and
                            synchronization controls.
                        </p>
                    </div>

                    {conn.data && (
                        <span
                            className={`github-connection-badge ${conn.data.ok
                                ? 'github-connected'
                                : 'github-disconnected'
                                }`}
                        >
                            <span className="github-status-dot" />
                            {conn.data.ok
                                ? 'Connected'
                                : 'Disconnected'}
                        </span>
                    )}

                </div>

                <div className="github-card-body">

                    {conn.isLoading && (
                        <div className="github-loading">
                            Checking GitHub connection…
                        </div>
                    )}

                    {conn.data?.ok && (
                        <div className="github-connection-content">

                            <div className="github-connection-details">

                                <div className="github-detail">
                                    <span>
                                        GitHub account
                                    </span>

                                    <strong>
                                        {conn.data.viewer_login ??
                                            '—'}
                                    </strong>
                                </div>

                                <div className="github-detail">
                                    <span>
                                        Connection mode
                                    </span>

                                    <strong>
                                        {conn.data.mode}
                                    </strong>
                                </div>

                            </div>

                            <button
                                type="button"
                                className="github-secondary-button"
                                onClick={() =>
                                    full.mutate()
                                }
                                disabled={full.isPending}
                            >
                                {full.isPending
                                    ? 'Resyncing…'
                                    : 'Full resync'}
                            </button>

                        </div>
                    )}

                    {conn.data && !conn.data.ok && (
                        <div className="github-error">

                            <div>
                                <strong>
                                    GitHub is not connected
                                </strong>

                                <p>
                                    {conn.data.error ??
                                        'The GitHub integration could not be established.'}
                                </p>
                            </div>

                            <button
                                type="button"
                                className="github-secondary-button"
                                onClick={() =>
                                    full.mutate()
                                }
                                disabled={full.isPending}
                            >
                                {full.isPending
                                    ? 'Retrying…'
                                    : 'Retry connection'}
                            </button>

                        </div>
                    )}

                </div>

            </section>

            {/* LINKED PROJECTS */}
            <section className="github-card">

                <div className="github-card-header">

                    <div>
                        <h2>Linked projects</h2>

                        <p>
                            GitHub Projects currently connected
                            to TSM.
                        </p>
                    </div>

                    {links.data && (
                        <span className="github-count-badge">
                            {links.data.length}
                            {' '}
                            {links.data.length === 1
                                ? 'project'
                                : 'projects'}
                        </span>
                    )}

                </div>

                {links.isLoading && (
                    <div className="github-loading">
                        Loading linked projects…
                    </div>
                )}

                {links.data &&
                    links.data.length === 0 && (
                        <div className="github-empty">
                            <strong>
                                No linked projects
                            </strong>

                            <span>
                                GitHub projects linked to TSM
                                will appear here.
                            </span>
                        </div>
                    )}

                {links.data &&
                    links.data.length > 0 && (
                        <div className="github-table-wrapper">

                            <table className="github-table">

                                <thead>
                                    <tr>
                                        <th>Owner</th>
                                        <th>Project</th>
                                        <th>Last synced</th>
                                        <th />
                                    </tr>
                                </thead>

                                <tbody>
                                    {links.data.map((link) => (
                                        <tr key={link.id}>

                                            <td>
                                                <span className="github-owner">
                                                    {link.gh_owner}
                                                </span>
                                            </td>

                                            <td>
                                                <span className="github-project-number">
                                                    #{link.gh_project_number}
                                                </span>
                                            </td>

                                            <td>
                                                <span className="github-sync-time">
                                                    {link.last_synced_at
                                                        ? new Date(
                                                            link.last_synced_at
                                                        ).toLocaleString()
                                                        : 'Never'}
                                                </span>
                                            </td>

                                            <td className="github-action-column">

                                                <button
                                                    type="button"
                                                    className="github-sync-button"
                                                    disabled={
                                                        sync.isPending
                                                    }
                                                    onClick={() =>
                                                        sync.mutate(
                                                            link.id
                                                        )
                                                    }
                                                >
                                                    {sync.isPending
                                                        ? 'Syncing…'
                                                        : 'Sync now'}
                                                </button>

                                            </td>

                                        </tr>
                                    ))}
                                </tbody>

                            </table>

                        </div>
                    )}

            </section>

            {/* SYNC LOG */}
            <section className="github-card">

                <div className="github-card-header">

                    <div>
                        <h2>Sync log</h2>

                        <p>
                            Recent GitHub synchronization events.
                        </p>
                    </div>

                    <span className="github-live-badge">
                        Live
                    </span>

                </div>

                {logs.isLoading && (
                    <div className="github-loading">
                        Loading synchronization activity…
                    </div>
                )}

                {logs.data &&
                    logs.data.data.length === 0 && (
                        <div className="github-empty">
                            <strong>
                                No synchronization activity
                            </strong>

                            <span>
                                GitHub pull and push operations
                                will appear here.
                            </span>
                        </div>
                    )}

                {logs.data &&
                    logs.data.data.length > 0 && (
                        <div className="github-table-wrapper">

                            <table className="github-table">

                                <thead>
                                    <tr>
                                        <th>When</th>
                                        <th>Direction</th>
                                        <th>Entity</th>
                                        <th>Status</th>
                                        <th>Error</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {logs.data.data.map((log) => (
                                        <tr key={log.id}>

                                            <td>
                                                {new Date(
                                                    log.created_at
                                                ).toLocaleTimeString()}
                                            </td>

                                            <td>
                                                <span
                                                    className={`github-direction github-direction-${log.direction}`}
                                                >
                                                    {log.direction}
                                                </span>
                                            </td>

                                            <td>
                                                {log.entity}
                                            </td>

                                            <td>
                                                <span
                                                    className={`github-sync-status github-sync-status-${log.status}`}
                                                >
                                                    {log.status}
                                                </span>
                                            </td>

                                            <td>
                                                <span className="github-error-text">
                                                    {log.error_message ??
                                                        '—'}
                                                </span>
                                            </td>

                                        </tr>
                                    ))}
                                </tbody>

                            </table>

                        </div>
                    )}

            </section>

        </div>
    );
}