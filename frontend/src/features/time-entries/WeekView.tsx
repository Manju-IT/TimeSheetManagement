import { useQuery } from '@tanstack/react-query';
import { timeEntriesApi } from './api';

function mondayOf(d: Date): Date {
    const copy = new Date(d);
    const day = copy.getDay() || 7;
    copy.setDate(copy.getDate() - (day - 1));
    copy.setHours(0, 0, 0, 0);
    return copy;
}
function toIso(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function WeekView() {
    const start = mondayOf(new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const q = useQuery({
        queryKey: ['time-entries', { from_date: toIso(start), to_date: toIso(end) }],
        queryFn: () =>
            timeEntriesApi.list({
                from_date: toIso(start),
                to_date: toIso(end),
                page_size: 100,
            }),
    });

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        days.push(d);
    }

    const totalsByDay: Record<string, number> = {};
    for (const e of q.data?.data ?? []) {
        totalsByDay[e.work_date] = (totalsByDay[e.work_date] ?? 0) + e.duration_minutes;
    }

    return (
        <div className="card">
            <header className="card-header">
                <h2>Week of {start.toLocaleDateString()}</h2>
            </header>
            <div className="week-grid">
                {days.map((d) => {
                    const iso = toIso(d);
                    const min = totalsByDay[iso] ?? 0;
                    return (
                        <div key={iso} className="week-cell">
                            <div className="week-day">{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                            <div className="week-date">{d.getDate()}</div>
                            <div className="week-total">
                                {Math.floor(min / 60)}h {String(min % 60).padStart(2, '0')}m
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}