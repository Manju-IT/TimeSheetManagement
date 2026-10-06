import type { TimesheetWeek, WeekRow } from './types';

function fmtMinutes(min: number): string {
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h${String(m).padStart(2, '0')}`;
}

interface Props {
    week: TimesheetWeek;
    editable?: boolean;
    onCellClick?: (row: WeekRow, workDate: string, minutes: number) => void;
}

export function WeekGrid({ week, editable, onCellClick }: Props) {
    const dayDates = week.days.map((d) => d.work_date);

    return (
        <div className="week-grid-wrap">
            <table className="week-grid">
                <thead>
                    <tr>
                        <th className="sticky-col">Project / Task</th>
                        {week.days.map((d) => (
                            <th key={d.work_date} className={d.is_future ? 'is-future' : ''}>
                                <div className="wg-day">{d.weekday}</div>
                                <div className="wg-date">{d.work_date.slice(8)}</div>
                            </th>
                        ))}
                        <th className="wg-total-col">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {week.rows.length === 0 && (
                        <tr>
                            <td colSpan={9} className="wg-empty">
                                No time entries for this week yet.
                            </td>
                        </tr>
                    )}
                    {week.rows.map((row) => (
                        <tr key={`${row.project_id}-${row.task_id ?? 'none'}`}>
                            <td className="sticky-col">
                                <div className="wg-project">{row.project_name}</div>
                                {row.task_title && <div className="wg-task">{row.task_title}</div>}
                            </td>
                            {dayDates.map((d) => {
                                const cell = row.cells[d];
                                const minutes = cell?.minutes ?? 0;
                                return (
                                    <td
                                        key={d}
                                        className={`wg-cell ${editable ? 'editable' : ''} ${minutes ? '' : 'empty'}`}
                                        onClick={() => editable && onCellClick?.(row, d, minutes)}
                                        title={minutes ? `${minutes} min` : editable ? 'Add entry' : undefined}
                                    >
                                        {fmtMinutes(minutes)}
                                    </td>
                                );
                            })}
                            <td className="wg-total-col num">{fmtMinutes(row.total_minutes)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td className="sticky-col">Daily total</td>
                        {dayDates.map((d) => (
                            <td key={d} className="num">{fmtMinutes(week.daily_totals[d] ?? 0)}</td>
                        ))}
                        <td className="wg-total-col num">{fmtMinutes(week.weekly_total_minutes)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}