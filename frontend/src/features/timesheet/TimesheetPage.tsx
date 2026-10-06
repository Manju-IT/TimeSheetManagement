import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { timesheetApi } from './api';
import { WeekGrid } from './WeekGrid';
import { DaySummary } from './DaySummary';
import { TimeEntryDrawer } from '@/features/time-entries/TimeEntryDrawer';
import { PageHeader } from '@/layouts/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { classifyError } from '@/lib/errors';

function shiftWeek(anchor: Date, weeks: number): Date {
    const d = new Date(anchor);
    d.setDate(d.getDate() + weeks * 7);
    return d;
}
function startOfWeek(d: Date): Date {
    const x = new Date(d);
    const day = x.getDay() || 7;
    x.setDate(x.getDate() - (day - 1));
    x.setHours(0, 0, 0, 0);
    return x;
}

export function TimesheetPage() {
    const qc = useQueryClient();
    const toast = useToast();
    const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
    const [drawer, setDrawer] = useState<{ open: boolean; workDate?: string; projectId?: string; taskId?: string }>({ open: false });

    const weekQuery = useQuery({
        queryKey: ['timesheet', 'week', anchor.toISOString().slice(0, 10)],
        queryFn: () => timesheetApi.myWeek(anchor),
    });

    const submit = useMutation({
        mutationFn: () => {
            const w = weekQuery.data!;
            return timesheetApi.submit(w.period.id, w.period.version);
        },
        onSuccess: () => {
            toast.success('Week submitted', 'Your manager will review it.');
            qc.invalidateQueries({ queryKey: ['timesheet'] });
        },
        onError: (e) => {
            const c = classifyError(e);
            if (c.kind === 'stale') {
                toast.warn(
                    'This week was updated elsewhere',
                    'Reloading the latest version — try again once the page refreshes.',
                );
                qc.invalidateQueries({ queryKey: ['timesheet'] });
                return;
            }
            if (c.code === 'OPEN_ATTENDANCE_DAY') {
                toast.error('Close your active session first', 'You have an open session today.');
                return;
            }
            if (c.code === 'EMPTY_WEEK') {
                toast.error('Nothing to submit', 'Add at least one time entry first.');
                return;
            }
            toast.error('Submission failed', c.message);
        },
    });

    const reopen = useMutation({
        mutationFn: () => {
            const w = weekQuery.data!;
            return timesheetApi.reopen(w.period.id, w.period.version);
        },
        onSuccess: () => {
            toast.success('Week reopened', 'You can edit entries again.');
            qc.invalidateQueries({ queryKey: ['timesheet'] });
        },
        onError: (e) => {
            const c = classifyError(e);
            if (c.kind === 'stale') {
                toast.warn('This week was updated elsewhere', 'Reloading the latest version.');
                qc.invalidateQueries({ queryKey: ['timesheet'] });
                return;
            }
            toast.error('Reopen failed', c.message);
        },
    });

    if (weekQuery.isLoading) {
        return (
            <div className="page">
                <PageHeader title="My Timesheet" />
                <Card><SkeletonTable rows={6} cols={9} /></Card>
            </div>
        );
    }
    if (weekQuery.isError || !weekQuery.data) {
        return (
            <div className="page">
                <PageHeader title="My Timesheet" />
                <ErrorState onRetry={() => weekQuery.refetch()} />
            </div>
        );
    }

    const week = weekQuery.data;
    const period = week.period;
    const isEditable = period.status === 'draft';
    const canSubmit = isEditable && week.rows.length > 0;
    const canReopen = period.status === 'rejected';

    return (
        <div className="page">
            <PageHeader
                title="My Timesheet"
                subtitle={`${period.period_start} → ${period.period_end}`}
                actions={
                    <>
                        <Button variant="ghost" size="sm" iconLeft="chevron-left" onClick={() => setAnchor(shiftWeek(anchor, -1))}>
                            Prev
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setAnchor(startOfWeek(new Date()))}>This week</Button>
                        <Button variant="ghost" size="sm" iconRight="chevron-right" onClick={() => setAnchor(shiftWeek(anchor, 1))}>
                            Next
                        </Button>
                    </>
                }
            />

            <Card>
                <div className="row-between">
                    <div className="row" style={{ gap: 12 }}>
                        <StatusBadge status={period.status} />
                        <span className="muted small">
                            Total <strong className="num">{fmtMinutes(week.weekly_total_minutes)}</strong>
                        </span>
                    </div>
                    <div className="row">
                        {isEditable && (
                            <Button
                                variant="primary"
                                size="sm"
                                iconLeft="check"
                                onClick={() => submit.mutate()}
                                loading={submit.isPending}
                                disabled={!canSubmit}
                                title={!canSubmit ? 'Nothing to submit' : undefined}
                            >
                                Submit week
                            </Button>
                        )}
                        {canReopen && (
                            <Button
                                variant="primary"
                                size="sm"
                                iconLeft="refresh"
                                onClick={() => reopen.mutate()}
                                loading={reopen.isPending}
                            >
                                Reopen
                            </Button>
                        )}
                    </div>
                </div>

                {period.status === 'submitted' && (
                    <Banner tone="info" title="Awaiting review">
                        Submitted {period.submitted_at ? new Date(period.submitted_at).toLocaleString() : ''}.
                    </Banner>
                )}
                {period.status === 'approved' && (
                    <Banner tone="success" title="Approved">
                        {period.approved_at ? new Date(period.approved_at).toLocaleString() : ''}
                    </Banner>
                )}
                {period.status === 'rejected' && (
                    <Banner tone="warning" title="Changes requested">
                        {period.comment ?? '(no comment)'}
                    </Banner>
                )}
            </Card>

            <div style={{ height: 16 }} />

            <Card padded={false}>
                <div className="card-section-header">
                    <h3 className="card-title">Weekly grid</h3>
                    {isEditable && <span className="muted small">Click a cell to add an entry for that day and project.</span>}
                </div>
                <WeekGrid
                    week={week}
                    editable={isEditable}
                    onCellClick={(row, workDate) => setDrawer({
                        open: true, workDate, projectId: row.project_id, taskId: row.task_id ?? undefined,
                    })}
                />
            </Card>

            <div style={{ height: 16 }} />

            <Card>
                <div className="card-section-header">
                    <h3 className="card-title">Attendance &amp; variance</h3>
                    <span className="muted small">
                        Variance threshold: ±{week.variance_threshold_minutes}m
                    </span>
                </div>
                <DaySummary week={week} />
            </Card>

            <TimeEntryDrawer
                open={drawer.open}
                onClose={() => setDrawer({ open: false })}
                defaultDate={drawer.workDate}
                defaultProjectId={drawer.projectId}
                defaultTaskId={drawer.taskId}
            />
        </div>
    );
}

function fmtMinutes(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
}
function StatusBadge({ status }: { status: string }) {
    const tone = status === 'approved' ? 'success'
        : status === 'rejected' ? 'danger'
            : status === 'submitted' ? 'info'
                : 'neutral';
    return <Badge tone={tone}>{status}</Badge>;
}