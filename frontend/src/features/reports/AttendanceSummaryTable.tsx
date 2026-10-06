import type { AttendanceSummary } from './types';

function fmtH(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

function fmtVariance(seconds: number): { text: string; warn: boolean } {
    const warn = Math.abs(seconds) > 3600;
    const sign = seconds > 0 ? '+' : seconds < 0 ? '−' : '';
    return { text: sign + fmtH(Math.abs(seconds)), warn };
}

export function AttendanceSummaryTable({ rows }: { rows: AttendanceSummary[] }) {
    if (rows.length === 0) {
        return <div className="chart-empty">No attendance data.</div>;
    }
    return (
        <table className="table">
            <thead>
                <tr>
                    <th>Member</th>
                    <th>Days</th>
                    <th>Session</th>
                    <th>Logged</th>
                    <th>Variance</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r) => {
                    const v = fmtVariance(r.variance_seconds);
                    return (
                        <tr key={r.user_id}>
                            <td>
                                <div>{r.full_name}</div>
                                <div className="muted small">{r.email}</div>
                            </td>
                            <td>{r.days}</td>
                            <td>{fmtH(r.session_seconds)}</td>
                            <td>{fmtH(r.logged_seconds)}</td>
                            <td className={v.warn ? 'variance-warn' : ''}>{v.text}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}