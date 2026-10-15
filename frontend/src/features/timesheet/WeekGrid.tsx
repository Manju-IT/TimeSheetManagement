import type { TimesheetWeek, WeekRow } from './types';

function fmtMinutes(min: number): string {
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatDayDate(iso: string): string {
    const date = new Date(`${iso}T00:00:00`);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface Props {
    week: TimesheetWeek;
    editable?: boolean;
    onCellClick?: (row: WeekRow, workDate: string, minutes: number) => void;
}

export function WeekGrid({ week, editable = false, onCellClick }: Props) {
    const dayDates = week.days.map((d) => d.work_date);

    return (
        <div className="week-grid-wrap redesigned-week-grid-wrap">
            <table className="week-grid redesigned-week-grid">
                <thead>
                    <tr>
                        <th className="sticky-col wg-project-heading">Project / task</th>
                        {week.days.map((day) => (
                            <th
                                key={day.work_date}
                                className={`${day.is_future ? 'is-future ' : ''}wg-day-heading`}
                            >
                                <span className="wg-day">{day.weekday}</span>
                                <span className="wg-date">{formatDayDate(day.work_date)}</span>
                            </th>
                        ))}
                        <th className="wg-total-col wg-total-heading">Weekly total</th>
                    </tr>
                </thead>
                <tbody>
                    {week.rows.length === 0 ? (
                        <tr>
                            <td colSpan={week.days.length + 2} className="wg-empty">
                                <span className="wg-empty-icon" aria-hidden="true">＋</span>
                                <strong>No time entries yet</strong>
                                <span>
                                    {editable
                                        ? 'Select a day cell after adding a project or task to start logging time.'
                                        : 'There are no recorded time entries for this week.'}
                                </span>
                            </td>
                        </tr>
                    ) : (
                        week.rows.map((row) => (
                            <tr key={`${row.project_id}-${row.task_id ?? 'none'}`}>
                                <td className="sticky-col wg-project-cell">
                                    <span className="wg-project">{row.project_name}</span>
                                    {row.project_code && (
                                        <span className="wg-project-code">{row.project_code}</span>
                                    )}
                                    {row.task_title && <span className="wg-task">{row.task_title}</span>}
                                </td>
                                {dayDates.map((date) => {
                                    const minutes = row.cells[date]?.minutes ?? 0;
                                    const canEdit = editable && !week.days.find((d) => d.work_date === date)?.is_future;
                                    return (
                                        <td
                                            key={date}
                                            className={[
                                                'wg-cell',
                                                minutes > 0 ? 'has-time' : 'empty',
                                                canEdit ? 'editable' : '',
                                                week.days.find((d) => d.work_date === date)?.is_future ? 'is-future-cell' : '',
                                            ].filter(Boolean).join(' ')}
                                            onClick={() => canEdit && onCellClick?.(row, date, minutes)}
                                            onKeyDown={(event) => {
                                                if (canEdit && (event.key === 'Enter' || event.key === ' ')) {
                                                    event.preventDefault();
                                                    onCellClick?.(row, date, minutes);
                                                }
                                            }}
                                            tabIndex={canEdit ? 0 : undefined}
                                            role={canEdit ? 'button' : undefined}
                                            aria-label={`${row.project_name}, ${date}, ${minutes ? fmtMinutes(minutes) : 'no time logged'}${canEdit ? ', edit time entry' : ''}`}
                                            title={minutes ? `${minutes} minutes logged` : canEdit ? 'Add time entry' : undefined}
                                        >
                                            {minutes > 0 ? (
                                                <span className="wg-minutes-pill">{fmtMinutes(minutes)}</span>
                                            ) : (
                                                <span className="wg-empty-cell">{canEdit ? '+' : '—'}</span>
                                            )}
                                        </td>
                                    );
                                })}
                                <td className="wg-total-col wg-row-total num">
                                    {fmtMinutes(row.total_minutes) || '—'}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
                <tfoot>
                    <tr>
                        <td className="sticky-col wg-daily-label">Daily total</td>
                        {dayDates.map((date) => {
                            const minutes = week.daily_totals[date] ?? 0;
                            return (
                                <td key={date} className="wg-daily-total num">
                                    {fmtMinutes(minutes) || '—'}
                                </td>
                            );
                        })}
                        <td className="wg-total-col wg-grand-total num">
                            {fmtMinutes(week.weekly_total_minutes) || '—'}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}
