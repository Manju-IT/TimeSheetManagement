import type { TimesheetWeek } from './types';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';

function fmtTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(seconds: number | null): string {
    if (!seconds || seconds <= 0) return '0h 00m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
}
function fmtVariance(seconds: number): string {
    const sign = seconds > 0 ? '+' : seconds < 0 ? '−' : '';
    return sign + fmtDuration(Math.abs(seconds));
}

export function DaySummary({ week }: { week: TimesheetWeek }) {
    return (
        <table className="table day-summary">
            <thead>
                <tr>
                    <th>Day</th>
                    <th>First login</th>
                    <th>Last logout</th>
                    <th>Session</th>
                    <th>Logged</th>
                    <th>Variance</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                {week.days.map((d) => (
                    <tr key={d.work_date} className={d.variance_exceeds_threshold ? 'row-warn' : ''}>
                        <td>
                            <strong>{d.weekday}</strong>{' '}
                            <span className="muted small num">{d.work_date}</span>
                        </td>
                        <td className="num">{fmtTime(d.first_login_at)}</td>
                        <td className="num">{fmtTime(d.last_logout_at)}</td>
                        <td className="num">{fmtDuration(d.total_session_seconds)}</td>
                        <td className="num">{fmtDuration(d.logged_seconds)}</td>
                        <td className={`num ${d.variance_exceeds_threshold ? 'variance-warn' : ''}`}>
                            {fmtVariance(d.variance_seconds)}
                            {d.variance_exceeds_threshold && (
                                <span className="variance-flag" title="Exceeds threshold">
                                    <Icon name="alert-triangle" size={11} />
                                </span>
                            )}
                        </td>
                        <td>
                            {d.has_open_session ? (
                                <Badge tone="warning" size="sm">Open session</Badge>
                            ) : d.missing_attendance ? (
                                <Badge tone="warning" size="sm">No attendance</Badge>
                            ) : (
                                <DayStatus status={d.attendance_status} />
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function DayStatus({ status }: { status: string | null }) {
    if (!status) return <span className="muted">—</span>;
    const tone = status === 'approved' ? 'success'
        : status === 'rejected' ? 'danger'
            : status === 'submitted' ? 'info'
                : status === 'open' ? 'warning'
                    : 'neutral';
    return <Badge tone={tone} size="sm">{status}</Badge>;
}