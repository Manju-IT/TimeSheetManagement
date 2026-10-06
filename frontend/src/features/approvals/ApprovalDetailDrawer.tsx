import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { timesheetApi } from '@/features/timesheet/api';
import { WeekGrid } from '@/features/timesheet/WeekGrid';
import { DaySummary } from '@/features/timesheet/DaySummary';
import { useToast } from '@/components/ui/Toast';
import { classifyError } from '@/lib/errors';

interface Props {
    periodId: string;
    onClose: () => void;
}

export function ApprovalDetailDrawer({ periodId, onClose }: Props) {
    const qc = useQueryClient();
    const toast = useToast();
    const [comment, setComment] = useState('');
    const [mode, setMode] = useState<'idle' | 'rejecting'>('idle');

    const detail = useQuery({
        queryKey: ['approval', periodId],
        queryFn: () => timesheetApi.reviewDetail(periodId),
    });

    const approve = useMutation({
        mutationFn: () => {
            const p = detail.data!.period;
            return timesheetApi.approve(p.id, p.version, comment || undefined);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['approvals'] });
            toast.success('Week approved');
            onClose();
        },
        onError: (e) => {
            const c = classifyError(e);
            if (c.kind === 'stale' || c.code === 'INVALID_STATE_TRANSITION') {
                toast.warn(
                    'This timesheet has already moved on',
                    'Reloading — the member may have resubmitted, or another manager already acted.',
                );
                qc.invalidateQueries({ queryKey: ['approvals'] });
                qc.invalidateQueries({ queryKey: ['approval', detail.data!.period.id] });
                return;
            }
            toast.error('Approval failed', c.message);
        },
    });

    const reject = useMutation({
        mutationFn: () => {
            const p = detail.data!.period;
            return timesheetApi.reject(p.id, p.version, comment.trim());
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['approvals'] });
            toast.success('Changes requested');
            onClose();
        },
        onError: (e) => {
            const c = classifyError(e);
            if (c.kind === 'stale' || c.code === 'INVALID_STATE_TRANSITION') {
                toast.warn(
                    'This timesheet has already moved on',
                    'Reloading the latest state.',
                );
                qc.invalidateQueries({ queryKey: ['approvals'] });
                qc.invalidateQueries({ queryKey: ['approval', detail.data!.period.id] });
                return;
            }
            toast.error('Request failed', c.message);
        },
    });

    if (detail.isLoading) {
        return (
            <div className="sheet-backdrop" onClick={onClose}>
                <aside className="sheet" onClick={(e) => e.stopPropagation()}>
                    <div className="sheet-body">Loading…</div>
                </aside>
            </div>
        );
    }
    if (detail.isError || !detail.data) {
        return (
            <div className="sheet-backdrop" onClick={onClose}>
                <aside className="sheet" onClick={(e) => e.stopPropagation()}>
                    <div className="sheet-body">
                        <div className="alert alert-error">Failed to load.</div>
                    </div>
                </aside>
            </div>
        );
    }

    const { user, period, week } = detail.data;
    const submitted = period.status === 'submitted';

    return (
        <div className="sheet-backdrop" onClick={onClose}>
            <aside className="sheet sheet-wide" onClick={(e) => e.stopPropagation()}>
                <header className="sheet-header">
                    <div>
                        <h2>{user.full_name}</h2>
                        <div className="muted small">
                            {user.email} · {period.period_start} → {period.period_end}
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}>
                        Close
                    </button>
                </header>
                <div className="sheet-body">
                    <div className="approval-meta">
                        <span className={`status-pill status-${period.status}`}>{period.status}</span>
                        <span className="muted small">
                            Total: {Math.floor(week.weekly_total_minutes / 60)}h{' '}
                            {String(week.weekly_total_minutes % 60).padStart(2, '0')}m
                        </span>
                    </div>

                    <div className="card" style={{ padding: 12, marginTop: 12 }}>
                        <WeekGrid week={week} />
                    </div>

                    <div className="card" style={{ padding: 12, marginTop: 12 }}>
                        <h3 style={{ fontSize: 13, margin: '0 0 10px' }}>Attendance & variance</h3>
                        <DaySummary week={week} />
                    </div>

                    {period.comment && (
                        <div className="alert alert-info" style={{ marginTop: 12 }}>
                            <strong>Previous comment:</strong> {period.comment}
                        </div>
                    )}

                    {submitted && (
                        <div className="field" style={{ marginTop: 16 }}>
                            <span>Comment {mode === 'rejecting' && '(required to request changes)'}</span>
                            <textarea
                                rows={3}
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder={
                                    mode === 'rejecting'
                                        ? 'What needs to change?'
                                        : 'Optional note for the member'
                                }
                            />
                        </div>
                    )}
                </div>

                {submitted && (
                    <footer className="sheet-footer">
                        {mode === 'idle' ? (
                            <>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setMode('rejecting')}
                                >
                                    Request changes
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => approve.mutate()}
                                    disabled={approve.isPending}
                                >
                                    {approve.isPending ? 'Approving…' : 'Approve'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => {
                                        setMode('idle');
                                        setComment('');
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => reject.mutate()}
                                    disabled={reject.isPending || !comment.trim()}
                                >
                                    {reject.isPending ? 'Sending…' : 'Send request'}
                                </button>
                            </>
                        )}
                    </footer>
                )}
            </aside>
        </div>
    );
}