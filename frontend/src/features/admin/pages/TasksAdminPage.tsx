import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/features/projects/api';
import { tasksApi } from '@/features/tasks/api';
import type { Task } from '@/features/tasks/types';
import { adminApi } from '../api';
import { Card } from '@/components/ui/Card';
import { Table, THead, TBody, TH, TD } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { classifyError } from '@/lib/errors';

const STATUSES = ['Todo', 'In Progress', 'In Review', 'Done'];

interface Draft {
    title: string;
    description: string;
    status: string;
    assignee_user_id: string;
}

const EMPTY: Draft = { title: '', description: '', status: 'Todo', assignee_user_id: '' };

export function TasksAdminPage() {
    const qc = useQueryClient();
    const toast = useToast();
    const [projectId, setProjectId] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<Task | null>(null);
    const [confirmArchive, setConfirmArchive] = useState<Task | null>(null);
    const [draft, setDraft] = useState<Draft>(EMPTY);

    const projects = useQuery({
        queryKey: ['admin', 'projects', { showInactive: false }],
        queryFn: () => projectsApi.list(true),
    });
    const users = useQuery({
        queryKey: ['admin', 'users', 'all'],
        queryFn: () => adminApi.listUsers({ page_size: 100 }),
    });

    // Default to the first project once projects load.
    const effectiveProjectId = projectId || projects.data?.data[0]?.id || '';

    const tasks = useQuery({
        queryKey: ['admin', 'tasks', { projectId: effectiveProjectId, showInactive }],
        queryFn: () =>
            tasksApi.list({
                project_id: effectiveProjectId,
                include_inactive: showInactive,
                page_size: 100,
            }),
        enabled: !!effectiveProjectId,
    });

    const usersById = useMemo(() => {
        const m = new Map<string, string>();
        for (const u of users.data?.data ?? []) m.set(u.id, u.full_name);
        return m;
    }, [users.data]);

    const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'tasks'] });

    const create = useMutation({
        mutationFn: () =>
            tasksApi.create({
                project_id: effectiveProjectId,
                title: draft.title.trim(),
                description: draft.description,
                status: draft.status,
                assignee_user_id: draft.assignee_user_id || null,
            }),
        onSuccess: () => { toast.success('Task created'); invalidate(); closeModal(); },
        onError: (e) => toast.error('Create failed', classifyError(e).message),
    });

    const update = useMutation({
        mutationFn: () =>
            tasksApi.update(editing!.id, {
                expected_updated_at: editing!.updated_at,
                title: draft.title.trim(),
                description: draft.description,
                status: draft.status,
                assignee_user_id: draft.assignee_user_id || null,
            }),
        onSuccess: () => { toast.success('Task updated'); invalidate(); closeModal(); },
        onError: (e) => {
            const c = classifyError(e);
            if (c.kind === 'stale') {
                toast.warn('Task was updated elsewhere', 'Refreshing the latest version.');
                invalidate();
                closeModal();
                return;
            }
            toast.error('Update failed', c.message);
        },
    });

    const archive = useMutation({
        mutationFn: (t: Task) => tasksApi.update(t.id, { expected_updated_at: t.updated_at, is_active: false }),
        onSuccess: () => { toast.success('Task archived'); invalidate(); setConfirmArchive(null); },
        onError: (e) => toast.error('Archive failed', classifyError(e).message),
    });

    const reactivate = useMutation({
        mutationFn: (t: Task) => tasksApi.update(t.id, { expected_updated_at: t.updated_at, is_active: true }),
        onSuccess: () => { toast.success('Task reactivated'); invalidate(); },
        onError: (e) => toast.error('Reactivate failed', classifyError(e).message),
    });

    function openCreate() { setDraft(EMPTY); setCreating(true); }
    function openEdit(t: Task) {
        setDraft({
            title: t.title,
            description: t.description,
            status: t.status,
            assignee_user_id: t.assignee_user_id ?? '',
        });
        setEditing(t);
    }
    function closeModal() { setCreating(false); setEditing(null); }

    const busy = create.isPending || update.isPending;
    const canSave = draft.title.trim().length > 0 && !!effectiveProjectId && !busy;

    if (projects.isLoading) {
        return <Card><SkeletonTable rows={5} cols={4} /></Card>;
    }
    if (projects.data && projects.data.data.length === 0) {
        return (
            <EmptyState
                icon="file-text"
                title="No projects yet"
                description="Create a project first, then you can add tasks to it."
            />
        );
    }

    return (
        <div className="stack-6">
            <Card>
                <div className="row-between">
                    <div className="row" style={{ gap: 12 }}>
                        <Field label="Project">
                            {(id) => (
                                <Select id={id} value={effectiveProjectId} onChange={(e) => setProjectId(e.target.value)}>
                                    {(projects.data?.data ?? []).map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </Select>
                            )}
                        </Field>
                        <label className="field-inline" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
                            <input
                                type="checkbox"
                                checked={showInactive}
                                onChange={(e) => setShowInactive(e.target.checked)}
                            />
                            <span className="small">Show archived</span>
                        </label>
                    </div>
                    <Button
                        variant="primary"
                        size="sm"
                        iconLeft="plus"
                        onClick={openCreate}
                        disabled={!effectiveProjectId}
                    >
                        New task
                    </Button>
                </div>
            </Card>

            <Card padded={false}>
                {tasks.isLoading && <div style={{ padding: 16 }}><SkeletonTable rows={5} cols={5} /></div>}
                {tasks.isError && (
                    <div style={{ padding: 16 }}>
                        <ErrorState message={classifyError(tasks.error).message} onRetry={() => tasks.refetch()} />
                    </div>
                )}
                {tasks.data && tasks.data.data.length === 0 && (
                    <EmptyState
                        icon="inbox"
                        title="No tasks for this project"
                        description="Add a task so members can log time against it."
                        action={
                            <Button variant="primary" size="sm" iconLeft="plus" onClick={openCreate}>
                                New task
                            </Button>
                        }
                    />
                )}
                {tasks.data && tasks.data.data.length > 0 && (
                    <Table>
                        <THead>
                            <tr>
                                <TH>Title</TH>
                                <TH style={{ width: 130 }}>Status</TH>
                                <TH style={{ width: 160 }}>Assignee</TH>
                                <TH style={{ width: 100 }}>Sync</TH>
                                <TH style={{ width: 100 }}>Active</TH>
                                <TH style={{ width: 160 }} />
                            </tr>
                        </THead>
                        <TBody>
                            {tasks.data.data.map((t) => (
                                <tr key={t.id}>
                                    <TD>{t.title}</TD>
                                    <TD><span className="muted">{t.status}</span></TD>
                                    <TD className="clip">
                                        {t.assignee_user_id
                                            ? usersById.get(t.assignee_user_id) ?? t.assignee_user_id.slice(0, 8)
                                            : <span className="muted">—</span>}
                                    </TD>
                                    <TD>
                                        {t.source === 'github'
                                            ? <Badge tone="info" size="sm">{t.sync_state.replace('_', ' ')}</Badge>
                                            : <span className="muted small">manual</span>}
                                    </TD>
                                    <TD>
                                        {t.is_active
                                            ? <Badge tone="success" size="sm">active</Badge>
                                            : <Badge tone="warning" size="sm">archived</Badge>}
                                    </TD>
                                    <TD className="row-actions">
                                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>Edit</Button>
                                        {t.is_active ? (
                                            <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(t)}>Archive</Button>
                                        ) : (
                                            <Button variant="ghost" size="sm" onClick={() => reactivate.mutate(t)}>Reactivate</Button>
                                        )}
                                    </TD>
                                </tr>
                            ))}
                        </TBody>
                    </Table>
                )}
            </Card>

            <Modal
                open={creating || editing !== null}
                onClose={closeModal}
                title={editing ? 'Edit task' : 'New task'}
                size="md"
            >
                <Field label="Title" required>
                    {(id) => (
                        <Input
                            id={id}
                            autoFocus
                            value={draft.title}
                            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                            placeholder="e.g. Fix auth redirect"
                            maxLength={300}
                        />
                    )}
                </Field>
                <Field label="Description">
                    {(id) => (
                        <Textarea
                            id={id}
                            rows={4}
                            value={draft.description}
                            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                            maxLength={20000}
                        />
                    )}
                </Field>
                <div className="grid-2">
                    <Field label="Status">
                        {(id) => (
                            <Select
                                id={id}
                                value={draft.status}
                                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                            >
                                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </Select>
                        )}
                    </Field>
                    <Field label="Assignee">
                        {(id) => (
                            <Select
                                id={id}
                                value={draft.assignee_user_id}
                                onChange={(e) => setDraft({ ...draft, assignee_user_id: e.target.value })}
                            >
                                <option value="">— Unassigned —</option>
                                {(users.data?.data ?? []).map((u) => (
                                    <option key={u.id} value={u.id}>{u.full_name}</option>
                                ))}
                            </Select>
                        )}
                    </Field>
                </div>
                <div className="modal-footer">
                    <Button variant="ghost" onClick={closeModal}>Cancel</Button>
                    <Button
                        variant="primary"
                        disabled={!canSave}
                        loading={busy}
                        onClick={() => (editing ? update.mutate() : create.mutate())}
                    >
                        {editing ? 'Save changes' : 'Create task'}
                    </Button>
                </div>
            </Modal>

            <ConfirmDialog
                open={!!confirmArchive}
                title="Archive task?"
                message={
                    confirmArchive
                        ? `"${confirmArchive.title}" will no longer appear in the time-entry task dropdown. Existing entries keep their reference.`
                        : undefined
                }
                confirmLabel="Archive"
                busy={archive.isPending}
                onCancel={() => setConfirmArchive(null)}
                onConfirm={() => confirmArchive && archive.mutate(confirmArchive)}
            />
        </div>
    );
}