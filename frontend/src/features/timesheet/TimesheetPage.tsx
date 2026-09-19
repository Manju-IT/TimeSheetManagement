import { useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';

export interface TimeEntryItem {
    id: string;
    work_date: string;
    project_name: string;
    task_title: string;
    description: string;
    duration_minutes: number;
    billable: boolean;
    status: 'draft' | 'submitted' | 'approved' | 'rejected';
}

const DEFAULT_PROJECTS = [
    'EZMedTech - Core Platform',
    'HealthCare Sync API',
    'Provider Portal Redesign',
    'Internal IT & DevOps',
];

export function TimesheetPage() {
    const { user } = useAuth();

    const [entries, setEntries] = useState<TimeEntryItem[]>([
        {
            id: '1',
            work_date: new Date().toISOString().split('T')[0],
            project_name: 'EZMedTech - Core Platform',
            task_title: 'Implement OAuth Token Refresh',
            description: 'Handled token rotation and automatic refresh header interception',
            duration_minutes: 240,
            billable: true,
            status: 'draft',
        },
        {
            id: '2',
            work_date: new Date().toISOString().split('T')[0],
            project_name: 'HealthCare Sync API',
            task_title: 'Fix FHIR resource mapping bug',
            description: 'Resolved null pointer exception on patient sync',
            duration_minutes: 180,
            billable: true,
            status: 'draft',
        },
    ]);

    const [weekOffset, setWeekOffset] = useState<number>(0);
    const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const [formData, setFormData] = useState({
        work_date: new Date().toISOString().split('T')[0],
        project_name: DEFAULT_PROJECTS[0],
        task_title: '',
        description: '',
        hours: '4',
        minutes: '0',
        billable: true,
    });

    const totalMinutes = entries.reduce((acc, curr) => acc + curr.duration_minutes, 0);
    const billableMinutes = entries
        .filter((e) => e.billable)
        .reduce((acc, curr) => acc + curr.duration_minutes, 0);

    const formatHours = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m > 0 ? `${m}m` : '00m'}`;
    };

    function handleAddEntry(e: React.FormEvent) {
        e.preventDefault();
        const duration = (parseInt(formData.hours) || 0) * 60 + (parseInt(formData.minutes) || 0);
        if (duration <= 0) {
            alert('Please enter a valid duration greater than 0.');
            return;
        }

        const newEntry: TimeEntryItem = {
            id: String(Date.now()),
            work_date: formData.work_date,
            project_name: formData.project_name,
            task_title: formData.task_title || 'General Development',
            description: formData.description,
            duration_minutes: duration,
            billable: formData.billable,
            status: 'draft',
        };

        setEntries([newEntry, ...entries]);
        setIsModalOpen(false);
        setFormData({
            work_date: new Date().toISOString().split('T')[0],
            project_name: DEFAULT_PROJECTS[0],
            task_title: '',
            description: '',
            hours: '4',
            minutes: '0',
            billable: true,
        });
    }

    function handleDelete(id: string) {
        if (confirm('Are you sure you want to delete this time entry?')) {
            setEntries(entries.filter((e) => e.id !== id));
        }
    }

    function handleSubmitTimesheet() {
        if (entries.length === 0) {
            alert('No time entries to submit.');
            return;
        }
        setIsSubmitted(true);
        setEntries(entries.map((e) => ({ ...e, status: 'submitted' })));
    }

    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekStart.getDate() + 6);

    const weekLabel = `${currentWeekStart.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    })} – ${currentWeekEnd.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    })}`;

    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(currentWeekStart);
        d.setDate(currentWeekStart.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayEntries = entries.filter((e) => e.work_date === dateStr);
        const dayTotal = dayEntries.reduce((acc, curr) => acc + curr.duration_minutes, 0);
        return {
            date: d,
            dateStr,
            dayName: d.toLocaleDateString(undefined, { weekday: 'short' }),
            dayNum: d.getDate(),
            entries: dayEntries,
            totalMinutes: dayTotal,
            isToday: d.toDateString() === new Date().toDateString(),
        };
    });

    function handleOpenLogForDate(dateStr: string) {
        setFormData((prev) => ({ ...prev, work_date: dateStr }));
        setIsModalOpen(true);
    }

    return (
        <div className="page">
            <header className="page-header">
                <div>
                    <h1>My Timesheet</h1>
                    <span className="muted">Logged in as {user?.full_name || 'Developer'}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" onClick={() => setIsModalOpen(true)}>
                        + Log Time
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSubmitTimesheet}
                        disabled={isSubmitted || entries.length === 0}
                    >
                        {isSubmitted ? 'Submitted for Approval' : 'Submit Timesheet'}
                    </button>
                </div>
            </header>

            {isSubmitted && (
                <div className="alert alert-info" style={{ marginBottom: 16 }}>
                    ✓ Timesheet has been successfully submitted to your manager for review.
                </div>
            )}

            {/* Quick Stats Grid */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 16,
                    marginBottom: 20,
                }}
            >
                <div className="card">
                    <div className="muted small">TOTAL LOGGED</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0' }}>
                        {formatHours(totalMinutes)}
                    </div>
                    <div className="muted small">Target: 40h per week</div>
                </div>

                <div className="card">
                    <div className="muted small">BILLABLE HOURS</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: 'var(--accent)' }}>
                        {formatHours(billableMinutes)}
                    </div>
                    <div className="muted small">
                        {totalMinutes > 0
                            ? `${Math.round((billableMinutes / totalMinutes) * 100)}% of total hours`
                            : '0%'}
                    </div>
                </div>

                <div className="card">
                    <div className="muted small">TIMESHEET STATUS</div>
                    <div style={{ fontSize: 20, fontWeight: 600, margin: '8px 0' }}>
                        <span
                            className="status-pill"
                            style={{
                                textTransform: 'uppercase',
                                color: isSubmitted ? 'var(--success)' : 'var(--warning)',
                                borderColor: isSubmitted ? 'var(--success)' : 'var(--warning)',
                            }}
                        >
                            {isSubmitted ? 'Submitted' : 'Draft in Progress'}
                        </span>
                    </div>
                    <div className="muted small">{entries.length} entries in period</div>
                </div>
            </div>

            {/* Week Navigation & View Switcher */}
            <div
                className="card"
                style={{
                    marginBottom: 16,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(weekOffset - 1)}>
                        ◀ Previous Week
                    </button>
                    <span style={{ fontWeight: 600 }}>{weekLabel}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(weekOffset + 1)}>
                        Next Week ▶
                    </button>
                    {weekOffset !== 0 && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>
                            Today's Week
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                    <button
                        className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setViewMode('table')}
                    >
                        ☷ Table View
                    </button>
                    <button
                        className={`btn btn-sm ${viewMode === 'calendar' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setViewMode('calendar')}
                    >
                        📅 Calendar View
                    </button>
                </div>
            </div>

            {/* View Mode: Table View */}
            {viewMode === 'table' && (
                <div className="card">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Project</th>
                                <th>Task & Description</th>
                                <th>Duration</th>
                                <th>Billable</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0' }} className="muted">
                                        No time entries logged for this period yet. Click <strong>+ Log Time</strong> to create one.
                                    </td>
                                </tr>
                            ) : (
                                entries.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <strong>{item.work_date}</strong>
                                        </td>
                                        <td>{item.project_name}</td>
                                        <td>
                                            <div style={{ fontWeight: 500 }}>{item.task_title}</div>
                                            {item.description && <div className="muted small">{item.description}</div>}
                                        </td>
                                        <td>
                                            <strong>{formatHours(item.duration_minutes)}</strong>
                                        </td>
                                        <td>
                                            {item.billable ? (
                                                <span className="status-pill status-success">Billable</span>
                                            ) : (
                                                <span className="status-pill">Non-billable</span>
                                            )}
                                        </td>
                                        <td>
                                            <span
                                                className="flag-pill"
                                                style={{
                                                    textTransform: 'capitalize',
                                                }}
                                            >
                                                {item.status}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                style={{ color: 'var(--danger)' }}
                                                onClick={() => handleDelete(item.id)}
                                                disabled={item.status === 'approved' || isSubmitted}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* View Mode: Weekly Calendar Timeline View */}
            {viewMode === 'calendar' && (
                <div className="card" style={{ overflowX: 'auto', padding: 12 }}>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, minmax(130px, 1fr))',
                            gap: 10,
                            minWidth: 920,
                        }}
                    >
                        {weekDays.map((day) => (
                            <div
                                key={day.dateStr}
                                style={{
                                    background: day.isToday ? 'rgba(47, 129, 247, 0.08)' : 'var(--bg)',
                                    border: day.isToday ? '1px solid var(--accent)' : '1px solid var(--border)',
                                    borderRadius: 'var(--radius)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    minHeight: 380,
                                }}
                            >
                                {/* Day Column Header */}
                                <div
                                    style={{
                                        padding: '10px 8px',
                                        borderBottom: '1px solid var(--border)',
                                        textAlign: 'center',
                                        background: day.isToday ? 'rgba(47, 129, 247, 0.15)' : '#161b22',
                                        borderTopLeftRadius: 'var(--radius)',
                                        borderTopRightRadius: 'var(--radius)',
                                    }}
                                >
                                    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>
                                        {day.dayName}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 18,
                                            fontWeight: 700,
                                            color: day.isToday ? 'var(--accent)' : 'var(--text)',
                                            margin: '2px 0',
                                        }}
                                    >
                                        {day.dayNum}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: day.totalMinutes > 0 ? 'var(--success)' : 'var(--muted)',
                                        }}
                                    >
                                        {formatHours(day.totalMinutes)}
                                    </div>
                                </div>

                                {/* Day Cards Body */}
                                <div style={{ padding: 8, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {day.entries.map((entry) => (
                                        <div
                                            key={entry.id}
                                            style={{
                                                background: '#1a212d',
                                                border: '1px solid var(--border)',
                                                borderRadius: 6,
                                                padding: '8px 10px',
                                                fontSize: 12,
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: 'var(--accent)',
                                                    marginBottom: 3,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.02em',
                                                }}
                                            >
                                                {entry.project_name.split(' - ')[0]}
                                            </div>
                                            <div style={{ fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>
                                                {entry.task_title}
                                            </div>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    marginTop: 6,
                                                    fontSize: 11,
                                                }}
                                            >
                                                <strong>{formatHours(entry.duration_minutes)}</strong>
                                                <button
                                                    onClick={() => handleDelete(entry.id)}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: 'var(--danger)',
                                                        cursor: 'pointer',
                                                        padding: 0,
                                                        fontSize: 11,
                                                    }}
                                                    title="Delete entry"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Quick Log Button on Day Column */}
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        style={{
                                            marginTop: 'auto',
                                            width: '100%',
                                            borderStyle: 'dashed',
                                            fontSize: 11,
                                            padding: '4px',
                                        }}
                                        onClick={() => handleOpenLogForDate(day.dateStr)}
                                    >
                                        + Log
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modal Dialog for Logging Time */}
            {isModalOpen && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: 16,
                    }}
                >
                    <div
                        className="card"
                        style={{
                            width: '100%',
                            maxWidth: 480,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        }}
                    >
                        <h2 style={{ margin: '0 0 16px 0', fontSize: 18 }}>Log Time Entry</h2>
                        <form onSubmit={handleAddEntry}>
                            <label className="field">
                                <span>Date</span>
                                <input
                                    type="date"
                                    required
                                    value={formData.work_date}
                                    onChange={(e) => setFormData({ ...formData, work_date: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '7px 8px',
                                        background: 'var(--bg)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius)',
                                        color: 'var(--text)',
                                    }}
                                />
                            </label>

                            <label className="field">
                                <span>Project</span>
                                <select
                                    value={formData.project_name}
                                    onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                                >
                                    {DEFAULT_PROJECTS.map((p) => (
                                        <option key={p} value={p}>
                                            {p}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="field">
                                <span>Task Title</span>
                                <input
                                    type="text"
                                    placeholder="e.g. Backend API authentication bugfix"
                                    required
                                    value={formData.task_title}
                                    onChange={(e) => setFormData({ ...formData, task_title: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '7px 8px',
                                        background: 'var(--bg)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius)',
                                        color: 'var(--text)',
                                    }}
                                />
                            </label>

                            <label className="field">
                                <span>Description / Notes</span>
                                <textarea
                                    rows={3}
                                    placeholder="Brief summary of tasks accomplished..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '7px 8px',
                                        background: 'var(--bg)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius)',
                                        color: 'var(--text)',
                                        resize: 'vertical',
                                    }}
                                />
                            </label>

                            <div style={{ display: 'flex', gap: 12 }}>
                                <label className="field" style={{ flex: 1 }}>
                                    <span>Hours</span>
                                    <input
                                        type="number"
                                        min="0"
                                        max="24"
                                        required
                                        value={formData.hours}
                                        onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '7px 8px',
                                            background: 'var(--bg)',
                                            border: '1px solid var(--border)',
                                            borderRadius: 'var(--radius)',
                                            color: 'var(--text)',
                                        }}
                                    />
                                </label>
                                <label className="field" style={{ flex: 1 }}>
                                    <span>Minutes</span>
                                    <input
                                        type="number"
                                        min="0"
                                        max="59"
                                        step="5"
                                        required
                                        value={formData.minutes}
                                        onChange={(e) => setFormData({ ...formData, minutes: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '7px 8px',
                                            background: 'var(--bg)',
                                            border: '1px solid var(--border)',
                                            borderRadius: 'var(--radius)',
                                            color: 'var(--text)',
                                        }}
                                    />
                                </label>
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.billable}
                                    onChange={(e) => setFormData({ ...formData, billable: e.target.checked })}
                                />
                                <span>Billable to client</span>
                            </label>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => setIsModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Save Entry
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
