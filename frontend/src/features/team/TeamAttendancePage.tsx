import { useQuery } from '@tanstack/react-query';
import { attendanceApi } from '@/features/attendance/api';

function fmtTime(iso: string | null | undefined) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(seconds: number | null | undefined) {
    if (!seconds || seconds <= 0) return '0h 00m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function TeamAttendancePage() {
    const q = useQuery({
        queryKey: ['team', 'attendance'],
        queryFn: () => attendanceApi.team(),
        refetchInterval: 60_000,
    });

    return (
        <div className="page">
            <header className="page-header">
                <h1>Team attendance</h1>
            </header>
            <div className="card">
                {q.isLoading && <div className="muted">Loading…</div>}
                {q.isError && <div className="alert alert-error">Failed to load team attendance.</div>}
                {q.data && q.data.length === 0 && (
                    <div className="muted">
                        No teams are assigned to you, or no members have activity today.
                    </div>
                )}
                {q.data && q.data.length > 0 && (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Member</th>
                                <th>First login</th>
                                <th>Location</th>
                                <th>Last logout</th>
                                <th>Session</th>
                                <th>Logged</th>
                                <th>Entries</th>
                                <th>Flags</th>
                            </tr>
                        </thead>
                        <tbody>
                            {q.data.map((r) => (
                                <tr key={r.user_id}>
                                    <td>
                                        <div>{r.full_name}</div>
                                        <div className="muted small">{r.email}</div>
                                    </td>
                                    <td>{fmtTime(r.attendance_day?.first_login_at)}</td>
                                    <td>
                                        {r.first_login_event?.place_label ??
                                            (r.first_login_event?.inside_site === true
                                                ? 'On site'
                                                : r.first_login_event?.inside_site === false
                                                    ? 'Off site'
                                                    : '—')}
                                    </td>
                                    <td>{fmtTime(r.attendance_day?.last_logout_at)}</td>
                                    <td>{fmtDuration(r.attendance_day?.total_session_seconds)}</td>
                                    <td>{fmtDuration(r.attendance_day?.logged_seconds)}</td>
                                    <td>{r.entry_count}</td>
                                    <td>
                                        {r.flags.length === 0
                                            ? '—'
                                            : r.flags.map((f) => (
                                                <span key={f} className="flag-pill">
                                                    {f.replace(/_/g, ' ')}
                                                </span>
                                            ))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}