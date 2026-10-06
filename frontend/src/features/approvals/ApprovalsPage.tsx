import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { timesheetApi } from '@/features/timesheet/api';
import { ApprovalDetailDrawer } from './ApprovalDetailDrawer';
import type { ReviewItem, TimesheetStatus } from '@/features/timesheet/types';
import { PageHeader } from '@/layouts/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, THead, TBody, TH, TD } from '@/components/ui/Table';
import { Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { classifyError } from '@/lib/errors';

const FILTERS: { label: string; value: TimesheetStatus | '' }[] = [
    { label: 'Submitted', value: 'submitted' },
    { label: 'Approved', value: 'approved' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'All', value: '' },
];

export function ApprovalsPage() {
    const [status, setStatus] = useState<TimesheetStatus | ''>('submitted');
    const [open, setOpen] = useState<ReviewItem | null>(null);

    const queue = useQuery({
        queryKey: ['approvals', status],
        queryFn: () => timesheetApi.reviewQueue(status),
    });

    return (
        <div className="page">
            <PageHeader
                title="Approvals"
                subtitle="Review and approve your team's weekly timesheets"
                actions={
                    <Select value={status} onChange={(e) => setStatus(e.target.value as TimesheetStatus | '')} aria-label="Status filter">
                        {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </Select>
                }
            />

            <Card padded={false}>
                {queue.isLoading && <div style={{ padding: 16 }}><SkeletonTable rows={5} cols={4} /></div>}
                {queue.isError && (
                    <div style={{ padding: 16 }}>
                        <ErrorState message={classifyError(queue.error).message} onRetry={() => queue.refetch()} />
                    </div>
                )}
                {queue.data && queue.data.data.length === 0 && (
                    <EmptyState
                        icon="check-circle"
                        title="Nothing to review"
                        description="Submitted timesheets from your team will appear here."
                    />
                )}
                {queue.data && queue.data.data.length > 0 && (
                    <Table>
                        <THead>
                            <tr>
                                <TH>Member</TH>
                                <TH style={{ width: 200 }}>Period</TH>
                                <TH style={{ width: 110 }}>Status</TH>
                                <TH style={{ width: 180 }}>Submitted</TH>
                                <TH style={{ width: 100 }} />
                            </tr>
                        </THead>
                        <TBody>
                            {queue.data.data.map((r) => (
                                <tr key={r.period.id}>
                                    <TD>
                                        <div>{r.user.full_name}</div>
                                        <div className="muted small">{r.user.email}</div>
                                    </TD>
                                    <TD className="num">{r.period.period_start} → {r.period.period_end}</TD>
                                    <TD><StatusBadge status={r.period.status} /></TD>
                                    <TD className="num">{r.period.submitted_at ? new Date(r.period.submitted_at).toLocaleString() : '—'}</TD>
                                    <TD className="row-actions">
                                        <Button variant="secondary" size="sm" onClick={() => setOpen(r)}>Review</Button>
                                    </TD>
                                </tr>
                            ))}
                        </TBody>
                    </Table>
                )}
            </Card>

            {open && <ApprovalDetailDrawer periodId={open.period.id} onClose={() => setOpen(null)} />}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const tone = status === 'approved' ? 'success'
        : status === 'rejected' ? 'danger'
            : status === 'submitted' ? 'info'
                : 'neutral';
    return <Badge tone={tone} size="sm">{status}</Badge>;
}