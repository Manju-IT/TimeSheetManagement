import { useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';

export interface TaskItem {
    id: string;
    title: string;
    description: string;
    project_name: string;
    status: 'Todo' | 'In Progress' | 'Completed';
    assignee: string;
    priority: 'Low' | 'Medium' | 'High';
    due_date: string;
}

const DEFAULT_PROJECTS = [
    'EZMedTech - Core Platform',
    'HealthCare Sync API',
    'Provider Portal Redesign',
    'Internal IT & DevOps',
];

export function TasksPage() {
    const { user } = useAuth();

    const [tasks, setTasks] = useState<TaskItem[]>([
        {
            id: 't-1',
            title: 'Implement Geofencing Radius Validation',
            description: 'Ensure check-in coordinates are within 150m of configured work site.',
            project_name: 'EZMedTech - Core Platform',
            status: 'In Progress',
            assignee: user?.full_name || 'Developer',
            priority: 'High',
            due_date: '2026-09-22',
        },
        {
            id: 't-2',
            title: 'Add Session Inactivity Timeout Background Worker',
            description: 'Auto-terminate idle user sessions after 30 minutes of inactivity.',
            project_name: 'EZMedTech - Core Platform',
            status: 'Completed',
            assignee: user?.full_name || 'Developer',
            priority: 'Medium',
            due_date: '2026-09-18',
        },
        {
            id: 't-3',
            title: 'Design FHIR Bundle Exporter Endpoint',
            description: 'Export weekly timesheet hours to FHIR format for hospital auditing.',
            project_name: 'HealthCare Sync API',
            status: 'Todo',
            assignee: 'Unassigned',
            priority: 'Medium',
            due_date: '2026-09-26',
        },
    ]);

    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        project_name: DEFAULT_PROJECTS[0],
        assignee: user?.full_name || 'Developer',
        priority: 'Medium' as 'Low' | 'Medium' | 'High',
        due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    });

    const filteredTasks = tasks.filter((t) => {
        const matchesStatus = filterStatus === 'All' || t.status === filterStatus;
        const matchesSearch =
            t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.project_name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    function handleCreateTask(e: React.FormEvent) {
        e.preventDefault();
        const newTask: TaskItem = {
            id: `t-${Date.now()}`,
            title: formData.title,
            description: formData.description,
            project_name: formData.project_name,
            status: 'Todo',
            assignee: formData.assignee,
            priority: formData.priority,
            due_date: formData.due_date,
        };
        setTasks([newTask, ...tasks]);
        setIsModalOpen(false);
        setFormData({
            title: '',
            description: '',
            project_name: DEFAULT_PROJECTS[0],
            assignee: user?.full_name || 'Developer',
            priority: 'Medium',
            due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        });
    }

    function handleCycleStatus(taskId: string) {
        setTasks(
            tasks.map((t) => {
                if (t.id !== taskId) return t;
                const nextStatus: 'Todo' | 'In Progress' | 'Completed' =
                    t.status === 'Todo'
                        ? 'In Progress'
                        : t.status === 'In Progress'
                        ? 'Completed'
                        : 'Todo';
                return { ...t, status: nextStatus };
            }),
        );
    }

    function handleDelete(taskId: string) {
        if (confirm('Delete this task?')) {
            setTasks(tasks.filter((t) => t.id !== taskId));
        }
    }

    const todoCount = tasks.filter((t) => t.status === 'Todo').length;
    const inProgressCount = tasks.filter((t) => t.status === 'In Progress').length;
    const completedCount = tasks.filter((t) => t.status === 'Completed').length;

    return (
        <div className="page">
            <header className="page-header">
                <div>
                    <h1>Tasks</h1>
                    <span className="muted">Track assigned deliverables and engineering tasks</span>
                </div>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    + Create Task
                </button>
            </header>

            {/* Metrics */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 16,
                    marginBottom: 20,
                }}
            >
                <div className="card">
                    <div className="muted small">TOTAL TASKS</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0' }}>{tasks.length}</div>
                </div>
                <div className="card">
                    <div className="muted small">TODO</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: 'var(--muted)' }}>
                        {todoCount}
                    </div>
                </div>
                <div className="card">
                    <div className="muted small">IN PROGRESS</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: 'var(--accent)' }}>
                        {inProgressCount}
                    </div>
                </div>
                <div className="card">
                    <div className="muted small">COMPLETED</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: 'var(--success)' }}>
                        {completedCount}
                    </div>
                </div>
            </div>

            {/* Search and Filters */}
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
                <input
                    type="text"
                    placeholder="Search tasks or projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        padding: '7px 12px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        color: 'var(--text)',
                        minWidth: 260,
                    }}
                />

                <div style={{ display: 'flex', gap: 6 }}>
                    {['All', 'Todo', 'In Progress', 'Completed'].map((s) => (
                        <button
                            key={s}
                            className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setFilterStatus(s)}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tasks List */}
            <div className="card">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Task Title</th>
                            <th>Project</th>
                            <th>Status</th>
                            <th>Priority</th>
                            <th>Assignee</th>
                            <th>Due Date</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTasks.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0' }} className="muted">
                                    No tasks found matching your filter criteria.
                                </td>
                            </tr>
                        ) : (
                            filteredTasks.map((task) => (
                                <tr key={task.id}>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{task.title}</div>
                                        {task.description && (
                                            <div className="muted small" style={{ marginTop: 2 }}>
                                                {task.description}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <span className="muted small">{task.project_name}</span>
                                    </td>
                                    <td>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleCycleStatus(task.id)}
                                            title="Click to cycle status"
                                            style={{
                                                borderColor:
                                                    task.status === 'Completed'
                                                        ? 'var(--success)'
                                                        : task.status === 'In Progress'
                                                        ? 'var(--accent)'
                                                        : 'var(--border)',
                                            }}
                                        >
                                            {task.status === 'Completed' && '✓ '}
                                            {task.status === 'In Progress' && '⏳ '}
                                            {task.status === 'Todo' && '○ '}
                                            {task.status}
                                        </button>
                                    </td>
                                    <td>
                                        <span
                                            className="flag-pill"
                                            style={{
                                                borderColor:
                                                    task.priority === 'High'
                                                        ? 'var(--danger)'
                                                        : task.priority === 'Medium'
                                                        ? 'var(--warning)'
                                                        : 'var(--border)',
                                                color:
                                                    task.priority === 'High'
                                                        ? 'var(--danger)'
                                                        : task.priority === 'Medium'
                                                        ? 'var(--warning)'
                                                        : 'var(--muted)',
                                            }}
                                        >
                                            {task.priority}
                                        </span>
                                    </td>
                                    <td>{task.assignee}</td>
                                    <td className="muted small">{task.due_date}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ color: 'var(--danger)' }}
                                            onClick={() => handleDelete(task.id)}
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

            {/* Create Task Modal */}
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
                        <h2 style={{ margin: '0 0 16px 0', fontSize: 18 }}>Create New Task</h2>
                        <form onSubmit={handleCreateTask}>
                            <label className="field">
                                <span>Task Title</span>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Implement Geofencing check"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
                                <span>Description</span>
                                <textarea
                                    rows={3}
                                    placeholder="Detailed technical specifications or acceptance criteria..."
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
                                    <span>Priority</span>
                                    <select
                                        value={formData.priority}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                priority: e.target.value as 'Low' | 'Medium' | 'High',
                                            })
                                        }
                                    >
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                    </select>
                                </label>

                                <label className="field" style={{ flex: 1 }}>
                                    <span>Due Date</span>
                                    <input
                                        type="date"
                                        required
                                        value={formData.due_date}
                                        onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
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

                            <label className="field">
                                <span>Assignee</span>
                                <input
                                    type="text"
                                    value={formData.assignee}
                                    onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
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

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => setIsModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Create Task
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
