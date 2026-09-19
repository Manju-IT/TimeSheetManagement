import { useState } from 'react';
import { CheckInCard } from '@/features/attendance/CheckInCard';
import { useAuth } from '@/features/auth/useAuth';
import { Link } from 'react-router-dom';

interface CodeLinkItem {
    url: string;
    type: 'commit' | 'pull_request' | 'branch' | 'file' | 'other';
    note?: string;
}

interface TodayEntry {
    id: string;
    project: string;
    task: string;
    description: string;
    duration_minutes: number;
    billable: boolean;
    code_links: CodeLinkItem[];
}

const GITHUB_PROJECTS = [
    { id: 'p1', name: 'EZMedTech - Core Platform', isGh: true },
    { id: 'p2', name: 'HealthCare Sync API', isGh: true },
    { id: 'p3', name: 'Provider Portal Redesign', isGh: true },
    { id: 'p4', name: 'Internal IT & Operations', isGh: false },
];

const PRESET_TASKS: Record<string, string[]> = {
    'EZMedTech - Core Platform': [
        '#142 Fix OAuth token refresh & header interception',
        '#145 Database indexing on geo_event queries',
        '#160 Migrate session worker to Redis pub/sub',
    ],
    'HealthCare Sync API': [
        '#150 Resolve FHIR patient resource mapping bug',
        '#152 HL7 v2 batch ingestion pipeline performance',
    ],
    'Provider Portal Redesign': [
        '#188 Implement Calendar View & Timesheet Grid',
        '#192 Add manager approval history table',
    ],
    'Internal IT & Operations': [
        'Sprint planning and architecture review',
        'DevOps CI/CD workflow hardening',
    ],
};

function detectLinkType(url: string): 'commit' | 'pull_request' | 'branch' | 'file' | 'other' {
    const lower = url.toLowerCase();
    if (lower.includes('/commit/')) return 'commit';
    if (lower.includes('/pull/') || lower.includes('/pr/')) return 'pull_request';
    if (lower.includes('/tree/') || lower.includes('/branch/')) return 'branch';
    if (lower.includes('/blob/')) return 'file';
    return 'other';
}

export function TodayPage() {
    const { user } = useAuth();

    const [entries, setEntries] = useState<TodayEntry[]>([
        {
            id: '1',
            project: 'EZMedTech - Core Platform',
            task: '#142 Fix OAuth token refresh & header interception',
            description: 'Handled token rotation and automatic refresh header interception in Axios client.',
            duration_minutes: 150, // 2h 30m
            billable: true,
            code_links: [
                { url: 'https://github.com/Manju-IT/TimeSheetManagement/commit/a1b2c3d', type: 'commit', note: 'Token refresh hook' },
                { url: 'https://github.com/Manju-IT/TimeSheetManagement/pull/45', type: 'pull_request', note: 'Auth PR' },
            ],
        },
        {
            id: '2',
            project: 'HealthCare Sync API',
            task: '#150 Resolve FHIR patient resource mapping bug',
            description: 'Resolved null pointer exception when patient identifier array was null in FHIR payload.',
            duration_minutes: 120, // 2h 00m
            billable: true,
            code_links: [
                { url: 'https://github.com/Manju-IT/TimeSheetManagement/pull/150', type: 'pull_request', note: 'FHIR Fix' },
            ],
        },
        {
            id: '3',
            project: 'Internal IT & Operations',
            task: 'Sprint planning and architecture review',
            description: 'Participated in bi-weekly technical sprint sync and planned backend REST endpoints.',
            duration_minutes: 60, // 1h 00m
            billable: false,
            code_links: [],
        },
    ]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state matching 5.3 specifications
    const [selectedProject, setSelectedProject] = useState(GITHUB_PROJECTS[0].name);
    const [selectedTask, setSelectedTask] = useState(PRESET_TASKS[GITHUB_PROJECTS[0].name][0]);
    const [customTask, setCustomTask] = useState('');
    const [isCustomTask, setIsCustomTask] = useState(false);
    const [description, setDescription] = useState('');
    const [durationHours, setDurationHours] = useState('1');
    const [durationMins, setDurationMins] = useState('30');
    const [billable, setBillable] = useState(true);
    const [codeLinks, setCodeLinks] = useState<CodeLinkItem[]>([
        { url: 'https://github.com/Manju-IT/TimeSheetManagement/commit/e4f5a6b', type: 'commit', note: 'Core patch' },
    ]);
    const [syncWithGithub, setSyncWithGithub] = useState(true);

    const totalMinutesLogged = entries.reduce((acc, curr) => acc + curr.duration_minutes, 0);
    const targetMinutes = 8 * 60; // 8 hours daily target
    const progressPercent = Math.min(100, Math.round((totalMinutesLogged / targetMinutes) * 100));

    const fmtMins = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m > 0 ? `${m}m` : '00m'}`;
    };

    const handleOpenCreate = () => {
        setModalMode('create');
        setEditingId(null);
        setDescription('');
        setDurationHours('1');
        setDurationMins('0');
        setBillable(true);
        setIsCustomTask(false);
        setCustomTask('');
        setCodeLinks([{ url: '', type: 'commit', note: '' }]);
        setIsModalOpen(true);
    };

    const handleSaveEntry = (andAnother = false) => {
        const totalMins = (parseInt(durationHours) || 0) * 60 + (parseInt(durationMins) || 0);
        if (totalMins <= 0) {
            alert('Please specify a duration greater than 0.');
            return;
        }

        const taskTitle = isCustomTask ? customTask.trim() || 'General Task' : selectedTask;

        const newEntry: TodayEntry = {
            id: editingId || 'entry-' + Date.now(),
            project: selectedProject,
            task: taskTitle,
            description: description.trim() || 'Task work performed',
            duration_minutes: totalMins,
            billable,
            code_links: codeLinks.filter((l) => l.url.trim().length > 0),
        };

        if (editingId) {
            setEntries(entries.map((e) => (e.id === editingId ? newEntry : e)));
        } else {
            setEntries([newEntry, ...entries]);
        }

        if (andAnother) {
            setDescription('');
            setDurationHours('1');
            setDurationMins('0');
            setCodeLinks([{ url: '', type: 'commit', note: '' }]);
        } else {
            setIsModalOpen(false);
        }
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to remove this time entry?')) {
            setEntries(entries.filter((e) => e.id !== id));
        }
    };

    return (
        <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 5.2 Header Strip */}
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0 }}>Today</h1>
                    <span className="muted">{user?.full_name ? `${user.full_name} · ` : ''}{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button className="btn btn-primary" onClick={handleOpenCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>➕</span>
                        <span>Add Time Entry</span>
                    </button>
                    <Link to="/timesheet" className="btn btn-secondary">
                        📅 Weekly Grid & Calendar
                    </Link>
                </div>
            </header>

            {/* Attendance & Geofence Status Card */}
            <CheckInCard />

            {/* 5.2 Top Strip: Daily Target Progress Stat Tile */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(30, 41, 59, 0.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                        <span className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Daily Work Target</span>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 4 }}>
                            Logged today: <span style={{ color: '#60a5fa' }}>{fmtMins(totalMinutesLogged)}</span> of 8h 00m
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <span className="status-pill status-info" style={{ fontSize: '0.85rem' }}>
                            {progressPercent}% Completed ({entries.length} entries)
                        </span>
                    </div>
                </div>

                {/* Visual Progress Bar */}
                <div style={{ width: '100%', height: 10, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 6, overflow: 'hidden' }}>
                    <div
                        style={{
                            width: `${progressPercent}%`,
                            height: '100%',
                            background: progressPercent >= 100 ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                            borderRadius: 6,
                            transition: 'width 0.4s ease',
                        }}
                    />
                </div>
            </div>

            {/* 5.2 Today's Entries List */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>Today's Time Entries</h3>
                    <span className="muted small">{entries.length} tasks logged</span>
                </div>

                {entries.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                        <p style={{ fontSize: '1.1rem', marginBottom: 12 }}>No entries yet today — log your first task.</p>
                        <button className="btn btn-primary" onClick={handleOpenCreate}>
                            ➕ Add Your First Entry
                        </button>
                    </div>
                ) : (
                    <table className="table" style={{ margin: 0 }}>
                        <thead>
                            <tr>
                                <th>Project</th>
                                <th>Task & Issue</th>
                                <th>Description</th>
                                <th>Duration</th>
                                <th>Code Links</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((item) => (
                                <tr key={item.id}>
                                    <td>
                                        <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{item.project}</div>
                                        {item.project.includes('Platform') || item.project.includes('Sync') ? (
                                            <span style={{ fontSize: '0.7rem', color: '#60a5fa' }}>🐙 GitHub Synced</span>
                                        ) : (
                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Internal</span>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{item.task}</div>
                                    </td>
                                    <td>
                                        <div style={{ maxWidth: 280, color: '#94a3b8', fontSize: '0.85rem' }}>
                                            {item.description}
                                        </div>
                                    </td>
                                    <td>
                                        <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                                            {fmtMins(item.duration_minutes)}
                                        </span>
                                    </td>
                                    <td>
                                        {item.code_links.length > 0 ? (
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {item.code_links.map((link, idx) => (
                                                    <a
                                                        key={idx}
                                                        href={link.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        style={{
                                                            fontSize: '0.75rem',
                                                            padding: '2px 8px',
                                                            borderRadius: 4,
                                                            background: 'rgba(59, 130, 246, 0.15)',
                                                            color: '#93c5fd',
                                                            border: '1px solid rgba(59, 130, 246, 0.3)',
                                                            textDecoration: 'none',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                        }}
                                                        title={link.note || link.url}
                                                    >
                                                        <span>{link.type === 'commit' ? '🔀' : link.type === 'pull_request' ? '⚡' : '🌿'}</span>
                                                        <span>{link.note || link.type}</span>
                                                    </a>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="muted small">—</span>
                                        )}
                                    </td>
                                    <td>
                                        {item.billable ? (
                                            <span className="status-pill status-success" style={{ fontSize: '0.75rem' }}>Billable</span>
                                        ) : (
                                            <span className="status-pill" style={{ fontSize: '0.75rem' }}>Non-billable</span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleDelete(item.id)}
                                            style={{ color: '#ef4444' }}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* 5.3 Add / Edit Time Entry Modal (Side Sheet / Modal) */}
            {isModalOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.75)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 3000,
                        padding: 16,
                    }}
                >
                    <div
                        className="card"
                        style={{
                            maxWidth: 580,
                            width: '100%',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            padding: '24px 28px',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            boxShadow: '0 20px 48px rgba(0, 0, 0, 0.8)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ margin: 0 }}>{modalMode === 'create' ? 'Add Time Entry' : 'Edit Time Entry'}</h2>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setIsModalOpen(false)}
                                style={{ fontSize: '1.2rem', padding: '4px 8px' }}
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={(e) => { e.preventDefault(); handleSaveEntry(false); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* 1. Project (Searchable select, GitHub projects grouped first) */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 600 }}>
                                    Project (GitHub Projects v2)
                                </label>
                                <select
                                    className="input"
                                    value={selectedProject}
                                    onChange={(e) => {
                                        setSelectedProject(e.target.value);
                                        const tasks = PRESET_TASKS[e.target.value] || [];
                                        if (tasks.length > 0) setSelectedTask(tasks[0]);
                                    }}
                                    style={{ width: '100%' }}
                                >
                                    <optgroup label="🐙 GitHub Synced Projects">
                                        {GITHUB_PROJECTS.filter((p) => p.isGh).map((p) => (
                                            <option key={p.id} value={p.name}>{p.name}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="📁 Internal & Client Projects">
                                        {GITHUB_PROJECTS.filter((p) => !p.isGh).map((p) => (
                                            <option key={p.id} value={p.name}>{p.name}</option>
                                        ))}
                                    </optgroup>
                                </select>
                            </div>

                            {/* 2. Task (Select filtered by project + manual fallback) */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Task / Issue</label>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        style={{ fontSize: '0.75rem', padding: '2px 6px', color: '#60a5fa' }}
                                        onClick={() => setIsCustomTask(!isCustomTask)}
                                    >
                                        {isCustomTask ? '← Select from GitHub tasks' : '+ Task not listed (Enter manually)'}
                                    </button>
                                </div>

                                {isCustomTask ? (
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder="Enter custom task title..."
                                        value={customTask}
                                        onChange={(e) => setCustomTask(e.target.value)}
                                        style={{ width: '100%' }}
                                        required
                                    />
                                ) : (
                                    <select
                                        className="input"
                                        value={selectedTask}
                                        onChange={(e) => setSelectedTask(e.target.value)}
                                        style={{ width: '100%' }}
                                    >
                                        {(PRESET_TASKS[selectedProject] || ['General Task']).map((t, idx) => (
                                            <option key={idx} value={t}>{t}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* 3. Description (Multiline + Char Counter + GitHub Sync Hint) */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Description</label>
                                    <span className="muted small">{description.length} / 500</span>
                                </div>
                                <textarea
                                    className="input"
                                    rows={3}
                                    maxLength={500}
                                    placeholder="Summary of work performed (syncs to GitHub issue body)..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>
                                    💡 <em>Changes will update the managed block in the GitHub issue body.</em>
                                </div>
                            </div>

                            {/* 4. Code Links (Repeatable Row: URL + Auto-Detected Type Badge + Note) */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>GitHub Code Links</label>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        style={{ fontSize: '0.75rem', color: '#60a5fa' }}
                                        onClick={() => setCodeLinks([...codeLinks, { url: '', type: 'commit', note: '' }])}
                                    >
                                        + Add another link
                                    </button>
                                </div>

                                {codeLinks.map((link, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                        <input
                                            type="url"
                                            className="input"
                                            placeholder="Paste GitHub commit / PR / file URL..."
                                            value={link.url}
                                            onChange={(e) => {
                                                const url = e.target.value;
                                                const detected = detectLinkType(url);
                                                const updated = [...codeLinks];
                                                updated[idx] = { ...updated[idx], url, type: detected };
                                                setCodeLinks(updated);
                                            }}
                                            style={{ flex: 2, fontSize: '0.85rem' }}
                                        />
                                        <span
                                            style={{
                                                fontSize: '0.75rem',
                                                padding: '4px 8px',
                                                borderRadius: 4,
                                                background: 'rgba(255, 255, 255, 0.1)',
                                                textTransform: 'uppercase',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {link.type}
                                        </span>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="Note"
                                            value={link.note || ''}
                                            onChange={(e) => {
                                                const updated = [...codeLinks];
                                                updated[idx] = { ...updated[idx], note: e.target.value };
                                                setCodeLinks(updated);
                                            }}
                                            style={{ flex: 1, fontSize: '0.85rem' }}
                                        />
                                        {codeLinks.length > 1 && (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                style={{ color: '#ef4444' }}
                                                onClick={() => setCodeLinks(codeLinks.filter((_, i) => i !== idx))}
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* 5. Duration (Stepper + Quick Chips 15m/30m/1h/2h) */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 600 }}>Duration</label>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <input
                                            type="number"
                                            className="input"
                                            min="0"
                                            max="24"
                                            value={durationHours}
                                            onChange={(e) => setDurationHours(e.target.value)}
                                            style={{ width: 70 }}
                                        />
                                        <span className="muted small">hours</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <input
                                            type="number"
                                            className="input"
                                            min="0"
                                            max="59"
                                            step="5"
                                            value={durationMins}
                                            onChange={(e) => setDurationMins(e.target.value)}
                                            style={{ width: 70 }}
                                        />
                                        <span className="muted small">mins</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {[
                                        { label: '15m', h: '0', m: '15' },
                                        { label: '30m', h: '0', m: '30' },
                                        { label: '1h', h: '1', m: '0' },
                                        { label: '2h', h: '2', m: '0' },
                                        { label: '4h', h: '4', m: '0' },
                                    ].map((chip) => (
                                        <button
                                            key={chip.label}
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(255, 255, 255, 0.05)' }}
                                            onClick={() => { setDurationHours(chip.h); setDurationMins(chip.m); }}
                                        >
                                            {chip.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 6. Billable Toggle */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={billable}
                                    onChange={(e) => setBillable(e.target.checked)}
                                />
                                <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Billable Client Hours</span>
                            </label>

                            {/* Section 5.3: GitHub Sync Checkbox */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: 6, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                <input
                                    type="checkbox"
                                    checked={syncWithGithub}
                                    onChange={(e) => setSyncWithGithub(e.target.checked)}
                                />
                                <span style={{ fontSize: '0.8rem', color: '#93c5fd' }}>
                                    Also update task description in GitHub (default on) · <span className="muted">Last synced 2m ago</span>
                                </span>
                            </label>

                            {/* Footer Buttons: Save, Save & Add Another, Cancel */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={() => handleSaveEntry(true)}>
                                    Save & Add Another
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