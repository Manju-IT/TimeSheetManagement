import { useState } from 'react';

interface ProjectReportRow {
    projectName: string;
    totalHours: number;
    billableHours: number;
    contributors: number;
}

interface MemberReportRow {
    memberName: string;
    role: string;
    loggedHours: number;
    daysActive: number;
    status: 'Submitted' | 'Approved' | 'Draft';
}

export function ReportsPage() {
    const [dateRange, setDateRange] = useState<'week' | 'month' | 'last_month'>('week');

    const projectData: ProjectReportRow[] = [
        {
            projectName: 'EZMedTech - Core Platform',
            totalHours: 84.5,
            billableHours: 72.0,
            contributors: 4,
        },
        {
            projectName: 'HealthCare Sync API',
            totalHours: 52.0,
            billableHours: 48.0,
            contributors: 3,
        },
        {
            projectName: 'Provider Portal Redesign',
            totalHours: 36.5,
            billableHours: 36.5,
            contributors: 2,
        },
        {
            projectName: 'Internal IT & DevOps',
            totalHours: 18.0,
            billableHours: 0.0,
            contributors: 2,
        },
    ];

    const memberData: MemberReportRow[] = [
        {
            memberName: 'Alex Rivera',
            role: 'Lead Architect',
            loggedHours: 41.5,
            daysActive: 5,
            status: 'Approved',
        },
        {
            memberName: 'Sarah Chen',
            role: 'Senior Fullstack Dev',
            loggedHours: 39.0,
            daysActive: 5,
            status: 'Submitted',
        },
        {
            memberName: 'Binny Patel',
            role: 'Developer',
            loggedHours: 40.0,
            daysActive: 5,
            status: 'Approved',
        },
        {
            memberName: 'David Kim',
            role: 'Backend Engineer',
            loggedHours: 38.5,
            daysActive: 5,
            status: 'Submitted',
        },
        {
            memberName: 'Maria Garcia',
            role: 'QA Specialist',
            loggedHours: 32.0,
            daysActive: 4,
            status: 'Draft',
        },
    ];

    const totalHours = projectData.reduce((acc, p) => acc + p.totalHours, 0);
    const totalBillable = projectData.reduce((acc, p) => acc + p.billableHours, 0);
    const billablePercentage = totalHours > 0 ? Math.round((totalBillable / totalHours) * 100) : 0;

    function handleExportCSV() {
        const rows = [
            ['Project', 'Total Hours', 'Billable Hours', 'Contributors'],
            ...projectData.map((p) => [
                p.projectName,
                p.totalHours.toString(),
                p.billableHours.toString(),
                p.contributors.toString(),
            ]),
        ];
        const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `timesheet-report-${dateRange}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    return (
        <div className="page">
            <header className="page-header">
                <div>
                    <h1>Reports & Analytics</h1>
                    <span className="muted">Aggregated timesheet hours, billing breakdowns, and team capacity</span>
                </div>
                <button className="btn btn-secondary" onClick={handleExportCSV}>
                    📥 Export CSV
                </button>
            </header>

            {/* Time Filter Buttons */}
            <div
                className="card"
                style={{
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        className={`btn btn-sm ${dateRange === 'week' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setDateRange('week')}
                    >
                        Current Week
                    </button>
                    <button
                        className={`btn btn-sm ${dateRange === 'month' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setDateRange('month')}
                    >
                        Current Month
                    </button>
                    <button
                        className={`btn btn-sm ${dateRange === 'last_month' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setDateRange('last_month')}
                    >
                        Last Month
                    </button>
                </div>
                <div className="muted small">Report Period: September 2026</div>
            </div>

            {/* KPI Cards */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 16,
                    marginBottom: 24,
                }}
            >
                <div className="card">
                    <div className="muted small">TOTAL HOURS LOGGED</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0' }}>{totalHours} hrs</div>
                    <div className="muted small">Across all active projects</div>
                </div>

                <div className="card">
                    <div className="muted small">BILLABLE RATIO</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: 'var(--accent)' }}>
                        {billablePercentage}%
                    </div>
                    <div className="muted small">{totalBillable} billable hours</div>
                </div>

                <div className="card">
                    <div className="muted small">ACTIVE CONTRIBUTORS</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: 'var(--success)' }}>
                        {memberData.length} Members
                    </div>
                    <div className="muted small">Average {Math.round(totalHours / memberData.length)} hrs / member</div>
                </div>

                <div className="card">
                    <div className="muted small">SUBMISSION STATUS</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0' }}>
                        {memberData.filter((m) => m.status === 'Approved').length} / {memberData.length}
                    </div>
                    <div className="muted small">Timesheets approved</div>
                </div>
            </div>

            {/* Project Distribution Breakdown */}
            <div className="card" style={{ marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Hours by Project</h3>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Total Hours</th>
                            <th>Billable Hours</th>
                            <th>Share of Total</th>
                            <th>Contributors</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projectData.map((p) => {
                            const share = Math.round((p.totalHours / totalHours) * 100);
                            return (
                                <tr key={p.projectName}>
                                    <td>
                                        <strong>{p.projectName}</strong>
                                    </td>
                                    <td>{p.totalHours} hrs</td>
                                    <td>{p.billableHours} hrs</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div
                                                style={{
                                                    flex: 1,
                                                    height: 6,
                                                    background: 'var(--border)',
                                                    borderRadius: 3,
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: `${share}%`,
                                                        height: '100%',
                                                        background: 'var(--accent)',
                                                    }}
                                                />
                                            </div>
                                            <span className="muted small" style={{ width: 35 }}>
                                                {share}%
                                            </span>
                                        </div>
                                    </td>
                                    <td>{p.contributors}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Member Hours Breakdown */}
            <div className="card">
                <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Team Member Breakdown</h3>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Team Member</th>
                            <th>Role</th>
                            <th>Days Active</th>
                            <th>Total Logged</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {memberData.map((m) => (
                            <tr key={m.memberName}>
                                <td>
                                    <strong>{m.memberName}</strong>
                                </td>
                                <td>
                                    <span className="muted small">{m.role}</span>
                                </td>
                                <td>{m.daysActive} days</td>
                                <td>
                                    <strong>{m.loggedHours} hrs</strong>
                                </td>
                                <td>
                                    <span
                                        className="status-pill"
                                        style={{
                                            color:
                                                m.status === 'Approved'
                                                    ? 'var(--success)'
                                                    : m.status === 'Submitted'
                                                    ? 'var(--warning)'
                                                    : 'var(--muted)',
                                            borderColor:
                                                m.status === 'Approved'
                                                    ? 'var(--success)'
                                                    : m.status === 'Submitted'
                                                    ? 'var(--warning)'
                                                    : 'var(--border)',
                                        }}
                                    >
                                        {m.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
