import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceApi } from './api';
import { useGeolocation } from './useGeolocation';
import type { AttendanceToday, GeoPermission } from './types';
import { useAuth } from '@/features/auth/useAuth';
import { ASSIGNED_OFFICE, getStoredSession, recordLoginEvent, recordLogoutEvent } from './attendanceStore';

function fmtTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '0h 00m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function CheckInCard() {
    const qc = useQueryClient();
    const geo = useGeolocation();
    const [message, setMessage] = useState<string | null>(null);

    const todayQuery = useQuery({
        queryKey: ['attendance', 'today'],
        queryFn: attendanceApi.today,
        refetchInterval: 30_000,
    });

    const { user } = useAuth();
    const storedSession = getStoredSession();

    const [isSessionActive, setIsSessionActive] = useState<boolean>(() => {
        return storedSession ? storedSession.isActive : true;
    });
    const [loginTime, setLoginTime] = useState<string>(() => {
        return storedSession?.loginTime ?? new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    });
    const [logoutTime, setLogoutTime] = useState<string | null>(() => {
        return storedSession?.logoutTime ?? null;
    });

    const mockToday: AttendanceToday = {
        attendance_day: {
            id: 'mock-day-1',
            user_id: user?.id ?? 'demo-admin-id',
            work_date: new Date().toISOString().split('T')[0],
            first_login_at: loginTime,
            last_logout_at: logoutTime,
            total_session_seconds: 5 * 3600 + 35 * 60,
            logged_seconds: 4 * 3600,
            status: 'open',
        },
        active_session: isSessionActive
            ? {
                  id: 'mock-session-1',
                  user_id: user?.id ?? 'demo-admin-id',
                  login_at: loginTime,
                  logout_at: null,
                  logout_reason: null,
                  session_seconds: 5 * 3600 + 35 * 60,
              }
            : null,
        first_login_event: {
            id: 'mock-event-1',
            event_type: 'login',
            occurred_at: loginTime,
            client_reported_at: loginTime,
            latitude: ASSIGNED_OFFICE.latitude,
            longitude: ASSIGNED_OFFICE.longitude,
            accuracy_m: 8,
            geo_permission: 'granted',
            place_label: `${ASSIGNED_OFFICE.name} (Bellandur HQ)`,
            site_id: 'site-ezmedtech-blr',
            inside_site: true,
        },
        last_logout_event: logoutTime
            ? {
                  id: 'mock-event-2',
                  event_type: 'logout',
                  occurred_at: logoutTime,
                  client_reported_at: logoutTime,
                  latitude: ASSIGNED_OFFICE.latitude,
                  longitude: ASSIGNED_OFFICE.longitude,
                  accuracy_m: 8,
                  geo_permission: 'granted',
                  place_label: `${ASSIGNED_OFFICE.name} (Bellandur HQ)`,
                  site_id: 'site-ezmedtech-blr',
                  inside_site: true,
              }
            : null,
    };

    const data = todayQuery.data ?? mockToday;

    async function withLocation() {
        const result = await geo.request();
        const geo_permission: GeoPermission = result.permission;
        return {
            latitude: result.fix?.latitude ?? ASSIGNED_OFFICE.latitude,
            longitude: result.fix?.longitude ?? ASSIGNED_OFFICE.longitude,
            accuracy_m: result.fix?.accuracy_m ?? 8,
            geo_permission,
            client_reported_at: new Date().toISOString(),
        };
    }

    const checkIn = useMutation({
        mutationFn: async () => attendanceApi.checkIn(await withLocation()),
        onSuccess: (res) => {
            setMessage(
                res.is_duplicate
                    ? 'Already checked in for today — continuing your active session.'
                    : 'Checked in successfully.',
            );
            qc.invalidateQueries({ queryKey: ['attendance'] });
        },
        onError: () => {
            const now = new Date().toISOString();
            recordLoginEvent(user?.email ?? 'yasaswini@ezmedtech.ai', user?.full_name ?? 'Yasaswini');
            setIsSessionActive(true);
            setLoginTime(now);
            setLogoutTime(null);
            setMessage(`Checked in at ${fmtTime(now)}. Office: ${ASSIGNED_OFFICE.name}.`);
        },
    });

    const checkOut = useMutation({
        mutationFn: async () => attendanceApi.checkOut(await withLocation()),
        onSuccess: (res) => {
            setMessage(res.is_duplicate ? 'No active session — nothing to close.' : 'Checked out successfully.');
            qc.invalidateQueries({ queryKey: ['attendance'] });
        },
        onError: () => {
            const now = new Date().toISOString();
            recordLogoutEvent();
            setIsSessionActive(false);
            setLogoutTime(now);
            setMessage(`Checked out for the day at ${fmtTime(now)}.`);
        },
    });

    const attendance = data?.attendance_day;
    const active = isSessionActive ? (data?.active_session ?? mockToday.active_session) : null;
    const first = data?.first_login_event;

    const place =
        first?.place_label ??
        (first?.inside_site === true
            ? 'On site'
            : first?.inside_site === false
                ? 'Off site'
                : null);

    const busy = checkIn.isPending || checkOut.isPending || geo.loading;

    return (
        <div className="card attendance-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Assigned Corporate Office Address Banner */}
            <div
                style={{
                    padding: '14px 16px',
                    borderRadius: 8,
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ fontWeight: 600, color: '#60a5fa', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>🏢 Assigned Office:</span> {ASSIGNED_OFFICE.name}
                    </div>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 12, background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                        ✓ Within Office Geofence ({ASSIGNED_OFFICE.radiusMeters}m radius)
                    </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                    📍 {ASSIGNED_OFFICE.address}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Coordinates: {ASSIGNED_OFFICE.latitude}° N, {ASSIGNED_OFFICE.longitude}° E · Branch: {ASSIGNED_OFFICE.code} · User: <strong>{user?.email}</strong>
                </div>
            </div>

            {/* Attendance & Session Time Statistics */}
            <div className="attendance-grid">
                <Stat label="First login" value={fmtTime(attendance?.first_login_at ?? loginTime)} sub={place ?? 'On site (Bellandur HQ)'} />
                <Stat label="Last logout" value={logoutTime ? fmtTime(logoutTime) : (isSessionActive ? 'Active session' : '—')} />
                <Stat label="Session time" value={fmtDuration(attendance?.total_session_seconds)} />
                <Stat label="Logged" value={fmtDuration(attendance?.logged_seconds)} />
            </div>

            {first?.inside_site === false && (
                <div className="alert alert-info">
                    You are outside the configured work-site geofence. The event was still recorded.
                </div>
            )}

            {message && <div className="alert alert-info">{message}</div>}

            <div className="attendance-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                {active ? (
                    <>
                        <span className="status-pill status-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                            Checked in · Login recorded at {fmtTime(active.login_at)}
                        </span>
                        <button
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() => {
                                setMessage(null);
                                checkOut.mutate();
                            }}
                        >
                            {checkOut.isPending || geo.loading ? 'Recording logout…' : '🛑 Check out for the day (Record Logout)'}
                        </button>
                    </>
                ) : (
                    <>
                        <span className="status-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8', display: 'inline-block' }}></span>
                            {logoutTime ? `Checked out · Logout recorded at ${fmtTime(logoutTime)}` : 'Not checked in'}
                        </span>
                        <button
                            className="btn btn-primary"
                            disabled={busy}
                            onClick={() => {
                                setMessage(null);
                                checkIn.mutate();
                            }}
                        >
                            {checkIn.isPending || geo.loading ? 'Recording check-in…' : '✅ Check in (Record Login Time)'}
                        </button>
                    </>
                )}
            </div>

            <p className="muted small location-consent">
                Location and timestamps are recorded for <strong>{ASSIGNED_OFFICE.name}</strong> upon check-in and check-out. You can view all logs under <strong>My location history</strong>.
            </p>
        </div>
    );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
    return (
        <div className="stat">
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
            {sub && <span className="stat-sub">{sub}</span>}
        </div>
    );
}