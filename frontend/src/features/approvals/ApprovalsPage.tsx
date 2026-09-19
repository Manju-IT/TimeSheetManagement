import { useState } from 'react';

interface TimesheetSubmission {
    id: string;
    employeeName: string;
    email: string;
    period: string;
    totalHours: number;
    billableHours: number;
    submittedAt: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    notes?: string;
}

export function ApprovalsPage() {
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    const [submissions, setSubmissions] = useState<TimesheetSubmission[]>([
        {
            id: 'sub-1',
            employeeName: 'Sarah Chen',
            email: 'schen@ezmedtech.ai',
            period: 'Sep 15, 2026 – Sep 21, 2026',
            totalHours: 40.0,
            billableHours: 36.0,
            submittedAt: 'Yesterday at 5:14 PM',
            status: 'Pending',
            notes: 'Completed sprint 14 deliverables including FHIR mapping.',
        },
        {
            id: 'sub-2',
            employeeName: 'David Kim',
            email: 'dkim@ezmedtech.ai',
            period: 'Sep 15, 2026 – Sep 21, 2026',
            totalHours: 38.5,
            billableHours: 32.0,
            submittedAt: 'Today at 9:02 AM',
            status: 'Pending',
            notes: 'Backend database migration and redis session worker testing.',
        },
        {
            id: 'sub-3',
            employeeName: 'Alex Rivera',
            email: 'arivera@ezmedtech.ai',
            period: 'Sep 08, 2026 – Sep 14, 2026',
            totalHours: 41.5,
            billableHours: 38.0,
            submittedAt: 'Sep 15, 2026',
            status: 'Approved',
        },
    ]);

    function handleApprove(id: string, name: string) {
        setSubmissions(
            submissions.map((s) => (s.id === id ? { ...s, status: 'Approved' } : s)),
        );
        setActionMessage(`✓ Successfully approved timesheet for ${name}.`);
        setTimeout(() => setActionMessage(null), 4000);
    }

    function handleReject(id: string, name: string) {
        const reason = prompt(`Enter rejection comments for ${name}:`);
        if (reason !== null) {
            setSubmissions(
                submissions.map((s) =>
                    s.id === id ? { ...s, status: 'Rejected', notes: `Rejected: ${reason}` } : s,
                ),
            );
            setActionMessage(`Rejected timesheet for ${name}. Comments sent.`);
            setTimeout(() => setActionMessage(null), 4000);
        }
    }

    const pendingList = submissions.filter((s) => s.status === 'Pending');
    const historyList = submissions.filter((s) => s.status !== 'Pending');
    const currentList = activeTab === 'pending' ? pendingList : historyList;

    return (
        <div className="page">
            <header className="page-header">
                <div>
                    <h1>Timesheet Approvals</h1>
                    <span className="muted">Review and authorize team hours for payroll and billing</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        className={`btn btn-sm ${activeTab === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setActiveTab('pending')}
                    >
                        Pending ({pendingList.length})
                    </button>
                    <button
                        className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setActiveTab('history')}
                    >
                        Review History ({historyList.length})
                    </button>
                </div>
            </header>

            {actionMessage && <div className="alert alert-info">{actionMessage}</div>}

            {/* Quick Metrics */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 16,
                    marginBottom: 20,
                }}
            >
                <div className="card">
                    <div className="muted small">AWAITING REVIEW</div>
                    <div
                        style={{
                            fontSize: 24,
                            fontWeight: 700,
                            margin: '6px 0',
                            color: pendingList.length > 0 ? 'var(--warning)' : 'var(--muted)',
                        }}
                    >
                        {pendingList.length} Timesheets
                    </div>
                    <div className="muted small">Requires manager approval</div>
                </div>

                <div className="card">
                    <div className="muted small">PENDING HOURS</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0' }}>
                        {pendingList.reduce((acc, curr) => acc + curr.totalHours, 0)} hrs
                    </div>
                    <div className="muted small">
                        {pendingList.reduce((acc, curr) => acc + curr.billableHours, 0)} billable hrs
                    </div>
                </div>

                <div className="card">
                    <div className="muted small">APPROVED THIS MONTH</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: 'var(--success)' }}>
                        {submissions.filter((s) => s.status === 'Approved').length} Timesheets
                    </div>
                    <div className="muted small">Ready for payroll export</div>
                </div>
            </div>

            {/* Submissions Table */}
            <div className="card">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Team Member</th>
                            <th>Timesheet Period</th>
                            <th>Total Logged</th>
                            <th>Billable Ratio</th>
                            <th>Submitted</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {currentList.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0' }} className="muted">
                                    {activeTab === 'pending'
                                        ? 'No pending timesheet submissions awaiting your approval.'
                                        : 'No past approval history records found.'}
                                </td>
                            </tr>
                        ) : (
                            currentList.map((item) => (
                                <tr key={item.id}>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{item.employeeName}</div>
                                        <div className="muted small">{item.email}</div>
                                        {item.notes && (
                                            <div className="small" style={{ color: 'var(--muted)', marginTop: 4 }}>
                                                <em>"{item.notes}"</em>
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <strong>{item.period}</strong>
                                    </td>
                                    <td>
                                        <strong>{item.totalHours} hrs</strong>
                                    </td>
                                    <td>
                                        <span className="status-pill">
                                            {Math.round((item.billableHours / item.totalHours) * 100)}% ({item.billableHours}h)
                                        </span>
                                    </td>
                                    <td className="muted small">{item.submittedAt}</td>
                                    <td>
                                        <span
                                            className="status-pill"
                                            style={{
                                                color:
                                                    item.status === 'Approved'
                                                        ? 'var(--success)'
                                                        : item.status === 'Rejected'
                                                        ? 'var(--danger)'
                                                        : 'var(--warning)',
                                                borderColor:
                                                    item.status === 'Approved'
                                                        ? 'var(--success)'
                                                        : item.status === 'Rejected'
                                                        ? 'var(--danger)'
                                                        : 'var(--warning)',
                                            }}
                                        >
                                            {item.status}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        {item.status === 'Pending' ? (
                                            <div style={{ display: 'inline-flex', gap: 6 }}>
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => handleApprove(item.id, item.employeeName)}
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    style={{ color: 'var(--danger)' }}
                                                    onClick={() => handleReject(item.id, item.employeeName)}
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="muted small">Completed</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}