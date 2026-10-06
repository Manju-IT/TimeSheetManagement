import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';

export function DailyTrendChart({ data }: { data: { work_date: string; hours: number }[] }) {
    if (data.length === 0) {
        return <div className="chart-empty">No data for the selected range.</div>;
    }
    return (
        <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="#232a35" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="work_date" tick={{ fill: '#8b949e', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} width={40} />
                    <Tooltip
                        contentStyle={{ background: '#161b22', border: '1px solid #232a35', fontSize: 12 }}
                        formatter={(v: number) => `${v.toFixed(2)} h`}
                    />
                    <Line
                        type="monotone"
                        dataKey="hours"
                        stroke="#7ee787"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}