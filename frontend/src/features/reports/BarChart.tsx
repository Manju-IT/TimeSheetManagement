import { BarChart as RBar, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Datum {
    label: string;
    hours: number;
}

export function HoursBarChart({ data, color = '#2f81f7' }: { data: Datum[]; color?: string }) {
    if (data.length === 0) {
        return <div className="chart-empty">No data for the selected range.</div>;
    }
    return (
        <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
                <RBar data={data} margin={{ top: 8, right: 12, bottom: 40, left: 0 }}>
                    <CartesianGrid stroke="#232a35" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                        dataKey="label"
                        tick={{ fill: '#8b949e', fontSize: 11 }}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        height={50}
                    />
                    <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} width={40} />
                    <Tooltip
                        contentStyle={{ background: '#161b22', border: '1px solid #232a35', fontSize: 12 }}
                        formatter={(v: number) => `${v.toFixed(2)} h`}
                    />
                    <Bar dataKey="hours" fill={color} radius={[3, 3, 0, 0]} />
                </RBar>
            </ResponsiveContainer>
        </div>
    );
}