import { useQuery } from '@tanstack/react-query';
import { attendanceApi } from './api';

function fmt(iso: string) {
    return new Date(iso).toLocaleString();
}

export function LocationHistoryPage() {
    const q = useQuery({
        queryKey: ['attendance', 'events'],
        queryFn: () => attendanceApi.myEvents(200),
    });

    return (
        <div className="page">
            <header className="page-header">
                <h1>My location history</h1>
            </header>
            <div className="card">
                <p className="muted small">
                    Location is recorded only at check-in and check-out. Continuous tracking is never
                    performed, and only you and your organization's administrators can view this page.
                </p>
                {q.isLoading && <div className="muted">Loading…</div>}
                {q.isError && <div className="alert alert-error">Failed to load history.</div>}
                {q.data && q.data.length === 0 && (
                    <div className="muted">No location events recorded yet.</div>
                )}
                {q.data && q.data.length > 0 && (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>When</th>
                                <th>Type</th>
                                <th>Place</th>
                                <th>Coordinates</th>
                                <th>Accuracy</th>
                                <th>Permission</th>
                            </tr>
                        </thead>
                        <tbody>
                            {q.data.map((e) => (
                                <tr key={e.id}>
                                    <td>{fmt(e.occurred_at)}</td>
                                    <td>{e.event_type}</td>
                                    <td>
                                        {e.place_label ??
                                            (e.inside_site === true
                                                ? 'On site'
                                                : e.inside_site === false
                                                    ? 'Off site'
                                                    : '—')}
                                    </td>
                                    <td>
                                        {e.latitude != null && e.longitude != null
                                            ? `${Number(e.latitude).toFixed(5)}, ${Number(e.longitude).toFixed(5)}`
                                            : '—'}
                                    </td>
                                    <td>{e.accuracy_m != null ? `±${Number(e.accuracy_m).toFixed(0)} m` : '—'}</td>
                                    <td>{e.geo_permission}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}