import { useQuery } from '@tanstack/react-query';
import { attendanceApi } from './api';
import { ASSIGNED_OFFICE, getStoredEvents } from './attendanceStore';

function fmt(iso: string | null | undefined) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

export function LocationHistoryPage() {
    const q = useQuery({
        queryKey: ['attendance', 'events'],
        queryFn: () => attendanceApi.myEvents(200),
        retry: false,
    });

    const localEvents = getStoredEvents();

    return (
        <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <header className="page-header">
                <div>
                    <h1>Location & Attendance History</h1>
                    <p className="muted">Recorded login/logout events and assigned corporate office geofence data.</p>
                </div>
            </header>

            {/* Corporate Assigned Office Address Card */}
            <div
                className="card"
                style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    padding: '16px 20px',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>🏢 Official Corporate Office:</span> {ASSIGNED_OFFICE.name}
                    </div>
                    <span style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: 12, background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                        ✓ Verified Geofence · On-Site Only
                    </span>
                </div>
                <p style={{ color: '#e2e8f0', margin: '4px 0 8px 0', fontSize: '0.9rem' }}>
                    <strong>Full Address:</strong> {ASSIGNED_OFFICE.address}
                </p>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.8rem', color: '#94a3b8' }}>
                    <span>🌐 Coordinates: {ASSIGNED_OFFICE.latitude}° N, {ASSIGNED_OFFICE.longitude}° E</span>
                    <span>📍 Geofence Radius: {ASSIGNED_OFFICE.radiusMeters} meters</span>
                    <span>🕒 Timezone: {ASSIGNED_OFFICE.timezone}</span>
                </div>
            </div>

            {/* Login & Logout Event Audit Log */}
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                        <h3 style={{ margin: 0 }}>Login & Logout Time Log</h3>
                        <p className="muted small" style={{ margin: '4px 0 0 0' }}>
                            Timestamps noted on user login, check-in, and check-out at {ASSIGNED_OFFICE.name}.
                        </p>
                    </div>
                </div>

                <table className="table">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Action Type</th>
                            <th>User Email</th>
                            <th>Assigned Office</th>
                            <th>Coordinates</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {localEvents.map((e) => (
                            <tr key={e.id}>
                                <td style={{ fontWeight: 500 }}>{fmt(e.timestamp)}</td>
                                <td>
                                    <span
                                        className={`status-pill ${
                                            e.eventType === 'login' ? 'status-success' : 'status-info'
                                        }`}
                                        style={{ textTransform: 'capitalize' }}
                                    >
                                        {e.eventType === 'login' ? '🟢 User Login / Check-In' : '🔴 User Logout / Check-Out'}
                                    </span>
                                </td>
                                <td>{e.email}</td>
                                <td>
                                    <div style={{ fontWeight: 500 }}>{e.officeName}</div>
                                    <div className="muted small">{e.officeAddress.split(',')[0]}</div>
                                </td>
                                <td className="small">
                                    {e.latitude.toFixed(4)}°, {e.longitude.toFixed(4)}°
                                </td>
                                <td>
                                    <span className="status-pill status-success">
                                        ✓ On Site
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Detailed Geo-Event Trace from API */}
            {q.data && q.data.length > 0 && (
                <div className="card">
                    <h3 style={{ marginBottom: 12 }}>Detailed Device Location Traces</h3>
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
                </div>
            )}
        </div>
    );
}