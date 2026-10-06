import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/features/projects/api';
import { reportsApi, type ReportQuery } from './api';
import { HoursBarChart } from './BarChart';
import { DailyTrendChart } from './TrendChart';
import { AttendanceSummaryTable } from './AttendanceSummaryTable';
import { PageHeader } from '@/layouts/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { SkeletonCards, SkeletonTable } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { classifyError } from '@/lib/errors';

function isoDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return iso(d);
}
function iso(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ReportsPage() {
    const [from, setFrom] = useState(isoDaysAgo(29));
    const [to, setTo] = useState(iso(new Date()));
    const [projectId, setProjectId] = useState('');
    const [userId, setUserId] = useState('');
    const [billable, setBillable] = useState<'all' | 'true' | 'false'>('all');

    const projects = useQuery({ queryKey: ['projects', { activeOnly: false }], queryFn: () => projectsApi.list(false) });
    const users = useQuery({ queryKey: ['reports', 'users'], queryFn: reportsApi.users });

    const params: ReportQuery = useMemo(() => ({
        from_date: from,
        to_date: to,
        project_id: projectId || undefined,
        user_id: userId || undefined,
        billable: billable === 'all' ? undefined : billable === 'true',
    }), [from, to, projectId, userId, billable]);

    const summary = useQuery({
        queryKey: ['reports', 'summary', params],
        queryFn: () => reportsApi.summary(params),
    });

    return (
        <div className="page">
            <PageHeader
                title="Reports"
                actions={
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            iconLeft="file-text"
                            onClick={() => window.location.assign(reportsApi.exportCsvUrl(params, 'projects'))}
                        >
                            CSV
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            iconLeft="file-text"
                            onClick={() => window.location.assign(reportsApi.exportXlsxUrl(params))}
                        >
                            XLSX
                        </Button>
                    </>
                }
            />

            <Card>
                <div className="filter-bar">
                    <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
                    <Field label="To">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
                    <Field label="Project">
                        {(id) => (
                            <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                                <option value="">All</option>
                                {(projects.data?.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </Select>
                        )}
                    </Field>
                    <Field label="Member">
                        {(id) => (
                            <Select id={id} value={userId} onChange={(e) => setUserId(e.target.value)}>
                                <option value="">All</option>
                                {(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                            </Select>
                        )}
                    </Field>
                    <Field label="Billable">
                        {(id) => (
                            <Select id={id} value={billable} onChange={(e) => setBillable(e.target.value as typeof billable)}>
                                <option value="all">All</option>
                                <option value="true">Billable</option>
                                <option value="false">Non-billable</option>
                            </Select>
                        )}
                    </Field>
                </div>
            </Card>

            <div style={{ height: 16 }} />

            {summary.isLoading && <SkeletonCards count={4} />}
            {summary.isError && <ErrorState message={classifyError(summary.error).message} onRetry={() => summary.refetch()} />}
            {summary.data && summary.data.total_entries === 0 && (
                <Card>
                    <EmptyState
                        icon="bar-chart"
                        title="No data for the selected range"
                        description="Adjust the date range or filters above."
                    />
                </Card>
            )}

            {summary.data && summary.data.total_entries > 0 && (
                <div className="stack-6">
                    <div className="stats-grid">
                        <StatCard label="Total hours" value={`${(summary.data.total_minutes / 60).toFixed(2)} h`} />
                        <StatCard label="Total entries" value={String(summary.data.total_entries)} />
                        <StatCard label="Projects" value={String(summary.data.hours_by_project.length)} />
                        <StatCard label="Members" value={String(summary.data.hours_by_member.length)} />
                    </div>

                    <div className="grid-2">
                        <Card>
                            <CardHeader title="Hours by project" />
                            <HoursBarChart data={summary.data.hours_by_project.map((p) => ({
                                label: p.code ? `${p.code} · ${p.name}` : p.name,
                                hours: p.minutes / 60,
                            }))} />
                        </Card>
                        <Card>
                            <CardHeader title="Hours by member" />
                            <HoursBarChart color="#7ee787" data={summary.data.hours_by_member.map((m) => ({
                                label: m.full_name,
                                hours: m.minutes / 60,
                            }))} />
                        </Card>
                    </div>

                    <Card>
                        <CardHeader title="Daily trend" />
                        <DailyTrendChart data={summary.data.daily_trend.map((d) => ({
                            work_date: d.work_date,
                            hours: d.minutes / 60,
                        }))} />
                    </Card>

                    <Card>
                        <CardHeader title="Attendance summary" />
                        <AttendanceSummaryTable rows={summary.data.attendance_summary} />
                    </Card>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="stat-card">
            <span className="muted small">{label}</span>
            <span className="stat-big num">{value}</span>
        </div>
    );
}