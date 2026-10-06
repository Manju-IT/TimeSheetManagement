import { useQuery } from '@tanstack/react-query';
import { teamApi } from './api';
import { MiniMap } from './MiniMap';
import type { TeamAttendanceRow, TimelineEntry } from './types';

function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function AttendanceTimeline({
    teamId,
    row,
}: {
    teamId: string;
    row: TeamAttendanceRow;
}) {
    const q = useQuery({
        queryKey: ['team', 'timeline', teamId, row.user_id, row.work_date],
        queryFn: () => teamApi.timeline(teamId, row.user_id, row.work_date),
    });

    if (q.isLoading) return <div className="timeline-loading">Loading timeline…</div>;
    if (q.isError || !q.data) return <div className="timeline-loading">Failed to load.</div>;

    const t = q.data;

    return (
        <div className="timeline">
            <div className="timeline-summary">
                <div>
                    <span className="muted small">First login</span>
                    <div><strong>{t.first_login_at ? new Date(t.first_login_at).toLocaleTimeString() : '—'}</strong></div>
                </div>
                <div>
                    <span className="muted small">Last logout</span>
                    <div><strong>{t.last_logout_at ? new Date(t.last_logout_at).toLocaleTimeString() : '—'}</strong></div>
                </div>
                <div>
                    <span className="muted small">Session time</span>
                    <div><strong>{fmtDuration(t.total_session_seconds)}</strong></div>
                </div>
                <div>
                    <span className="muted small">Logged</span>
                    <div><strong>{fmtDuration(t.logged_seconds)}</strong></div>
                </div>
            </div>

            {t.events.length === 0 && (
                <div className="muted small" style={{ padding: 12 }}>No login/logout events recorded.</div>
            )}

            {t.events.map((e) => (
                <TimelineRow key={`${e.kind}-${e.occurred_at}`} entry={e} />
            ))}
        </div>
    );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
    const hasMap = entry.latitude != null && entry.longitude != null;
    const isLogin = entry.kind === 'login';

    return (
        <div className="timeline-row">
            <div className="timeline-marker">
                <span className={`dot ${isLogin ? 'dot-login' : 'dot-logout'}`} />
            </div>
            <div className="timeline-body">
                <div className="timeline-head">
                    <span className={`status-pill ${isLogin ? 'status-submitted' : 'status-draft'}`}>
                        {isLogin ? 'Check-in' : 'Check-out'}
                    </span>
                    <span className="timeline-time">{fmtTime(entry.occurred_at)}</span>
                    {entry.inside_site === true && <span className="flag-pill flag-ok">on site</span>}
                    {entry.inside_site === false && <span className="flag-pill">outside geofence</span>}
                    {entry.geo_permission === 'denied' && <span className="flag-pill">location denied</span>}
                    {entry.geo_permission === 'unavailable' && <span className="flag-pill">location unavailable</span>}
                </div>
                <div className="timeline-detail muted small">
                    {entry.place_label && <span>{entry.place_label} · </span>}
                    {entry.ip && <span>IP {entry.ip}</span>}
                    {entry.accuracy_m != null && <> · ±{Math.round(entry.accuracy_m)}m</>}
                </div>
            </div>
            {hasMap && (
                <div className="timeline-map">
                    <MiniMap
                        latitude={entry.latitude!}
                        longitude={entry.longitude!}
                        accuracyM={entry.accuracy_m}
                        label={entry.place_label}
                        size={100}
                    />
                </div>
            )}
        </div>
    );
}