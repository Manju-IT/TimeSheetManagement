import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceApi } from './api';
import { useGeolocation } from './useGeolocation';
import type { GeoPermission } from './types';

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

    const data = todayQuery.data;

    async function withLocation() {
        const result = await geo.request();
        const geo_permission: GeoPermission = result.permission;
        return {
            latitude: result.fix?.latitude ?? null,
            longitude: result.fix?.longitude ?? null,
            accuracy_m: result.fix?.accuracy_m ?? null,
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
                    : 'Checked in.',
            );
            qc.invalidateQueries({ queryKey: ['attendance'] });
        },
        onError: (e: Error) => setMessage(e.message),
    });

    const checkOut = useMutation({
        mutationFn: async () => attendanceApi.checkOut(await withLocation()),
        onSuccess: (res) => {
            setMessage(res.is_duplicate ? 'No active session — nothing to close.' : 'Checked out.');
            qc.invalidateQueries({ queryKey: ['attendance'] });
        },
        onError: (e: Error) => setMessage(e.message),
    });

    if (todayQuery.isLoading) return <div className="card">Loading attendance…</div>;
    if (todayQuery.isError) return <div className="card">Failed to load attendance.</div>;

    const attendance = data?.attendance_day;
    const active = data?.active_session;
    const first = data?.first_login_event;
    const last = data?.last_logout_event;

    const place =
        first?.place_label ??
        (first?.inside_site === true
            ? 'On site'
            : first?.inside_site === false
                ? 'Off site'
                : null);

    const busy = checkIn.isPending || checkOut.isPending || geo.loading;

    return (
        <div className="card attendance-card">
            <div className="attendance-grid">
                <Stat label="First login" value={fmtTime(attendance?.first_login_at)} sub={place} />
                <Stat label="Last logout" value={fmtTime(attendance?.last_logout_at)} />
                <Stat label="Session time" value={fmtDuration(attendance?.total_session_seconds)} />
                <Stat label="Logged" value={fmtDuration(attendance?.logged_seconds)} />
            </div>

            {first?.geo_permission === 'denied' && (
                <div className="alert alert-info">
                    Location permission was denied for this check-in. You can continue working; your
                    manager will see a <em>location denied</em> flag on this day.
                </div>
            )}
            {first?.geo_permission === 'unavailable' && (
                <div className="alert alert-info">
                    Your browser could not determine a location. This is recorded but does not block work.
                </div>
            )}
            {first?.inside_site === false && (
                <div className="alert alert-info">
                    You are outside the configured work-site geofence. The event was still recorded.
                </div>
            )}

            {message && <div className="alert alert-info">{message}</div>}

            <div className="attendance-actions">
                {active ? (
                    <>
                        <span className="status-pill status-success">
                            Checked in · {fmtTime(active.login_at)}
                        </span>
                        <button
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() => {
                                setMessage(null);
                                checkOut.mutate();
                            }}
                        >
                            {checkOut.isPending || geo.loading ? 'Checking out…' : 'Check out for the day'}
                        </button>
                    </>
                ) : (
                    <>
                        <span className="status-pill">Not checked in</span>
                        <button
                            className="btn btn-primary"
                            disabled={busy}
                            onClick={() => {
                                setMessage(null);
                                checkIn.mutate();
                            }}
                        >
                            {checkIn.isPending || geo.loading ? 'Checking in…' : 'Check in'}
                        </button>
                    </>
                )}
            </div>

            <p className="muted small location-consent">
                Location is captured only at check-in and check-out — never continuously. You can see
                your own history under <strong>My location history</strong>.
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