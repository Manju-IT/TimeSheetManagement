import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/features/projects/api';
import type { Project } from '@/features/projects/types';
import { Card } from '@/components/ui/Card';
import { Table, THead, TBody, TH, TD } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input } from '@/components/ui/Field';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { classifyError } from '@/lib/errors';

export function ProjectsAdminPage() {
    const qc = useQueryClient();
    const toast = useToast();
    const [showInactive, setShowInactive] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<Project | null>(null);
    const [confirmArchive, setConfirmArchive] = useState<Project | null>(null);
    const [draftName, setDraftName] = useState('');
    const [draftCode, setDraftCode] = useState('');

    const query = useQuery({
        queryKey: ['admin', 'projects', { showInactive }],
        queryFn: () => projectsApi.list(!showInactive),
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'projects'] });

    const create = useMutation({
        mutationFn: () => projectsApi.create({ name: draftName.trim(), code: draftCode.trim() || null }),
        onSuccess: () => { toast.success('Project created'); invalidate(); closeModal(); },
        onError: (e) => toast.error('Create failed', classifyError(e).message),
    });

    const update = useMutation({
        mutationFn: () => projectsApi.update(editing!.id, {
            name: draftName.trim(),
            code: draftCode.trim() || null,
        }),
        onSuccess: () => { toast.success('Project updated'); invalidate(); closeModal(); },
        onError: (e) => toast.error('Update failed', classifyError(e).message),
    });

    const archive = useMutation({
        mutationFn: (id: string) => projectsApi.update(id, { is_active: false }),
        onSuccess: () => { toast.success('Project archived'); invalidate(); setConfirmArchive(null); },
        onError: (e) => toast.error('Archive failed', classifyError(e).message),
    });

    const reactivate = useMutation({
        mutationFn: (id: string) => projectsApi.update(id, { is_active: true }),
        onSuccess: () => { toast.success('Project reactivated'); invalidate(); },
        onError: (e) => toast.error('Reactivate failed', classifyError(e).message),
    });

    function openCreate() { setDraftName(''); setDraftCode(''); setCreating(true); }
    function openEdit(p: Project) { setDraftName(p.name); setDraftCode(p.code ?? ''); setEditing(p); }
    function closeModal() { setCreating(false); setEditing(null); }

    const busy = create.isPending || update.isPending;
    const canSave = draftName.trim().length > 0 && !busy;

    return (
        <div className="stack-6">
            <Card>
                <div className="row-between">
                    <div className="row">
                        <label className="field-inline">
                            <input
                                type="checkbox"
                                checked={showInactive}
                                onChange={(e) => setShowInactive(e.target.checked)}
                            />
                            <span className="small">Show archived</span>
                        </label>
                    </div>
                    <Button variant="primary" size="sm" iconLeft="plus" onClick={openCreate}>
                        New project
                    </Button>
                </div>
            </Card>

            <Card padded={false}>
                {query.isLoading && <div style={{ padding: 16 }}><SkeletonTable rows={5} cols={4} /></div>}
                {query.isError && (
                    <div style={{ padding: 16 }}>
                        <ErrorState message={classifyError(query.error).message} onRetry={() => query.refetch()} />
                    </div>
                )}
                {query.data && query.data.data.length === 0 && (
                    <EmptyState
                        icon="file-text"
                        title="No projects yet"
                        description="Create a project so members can log time against it."
                        action={
                            <Button variant="primary" size="sm" iconLeft="plus" onClick={openCreate}>
                                New project
                            </Button>
                        }
                    />
                )}
                {query.data && query.data.data.length > 0 && (
                    <Table>
                        <THead>
                            <tr>
                                <TH>Name</TH>
                                <TH style={{ width: 120 }}>Code</TH>
                                <TH style={{ width: 110 }}>Source</TH>
                                <TH style={{ width: 100 }}>Status</TH>
                                <TH style={{ width: 180 }} />
                            </tr>
                        </THead>
                        <TBody>
                            {query.data.data.map((p) => (
                                <tr key={p.id}>
                                    <TD>{p.name}</TD>
                                    <TD className="mono small">{p.code ?? <span className="muted">—</span>}</TD>
                                    <TD>
                                        {p.source === 'github'
                                            ? <Badge tone="info" size="sm">github</Badge>
                                            : <Badge tone="neutral" size="sm">manual</Badge>}
                                    </TD>
                                    <TD>
                                        {p.is_active
                                            ? <Badge tone="success" size="sm">active</Badge>
                                            : <Badge tone="warning" size="sm">archived</Badge>}
                                    </TD>
                                    <TD className="row-actions">
                                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                                        {p.is_active ? (
                                            <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(p)}>Archive</Button>
                                        ) : (
                                            <Button variant="ghost" size="sm" onClick={() => reactivate.mutate(p.id)}>Reactivate</Button>
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
                title={editing ? 'Edit project' : 'New project'}
                size="sm"
            >
                <Field label="Name" required hint="Shown in the time-entry project dropdown.">
                    {(id) => (
                        <Input
                            id={id}
                            autoFocus
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            placeholder="e.g. Apollo"
                            maxLength={120}
                        />
                    )}
                </Field>
                <Field label="Code" hint="Short label used in exports and reports. Optional.">
                    {(id) => (
                        <Input
                            id={id}
                            value={draftCode}
                            onChange={(e) => setDraftCode(e.target.value)}
                            placeholder="e.g. APL"
                            maxLength={40}
                        />
                    )}
                </Field>
                <div className="modal-footer">
                    <Button variant="ghost" onClick={closeModal}>Cancel</Button>
                    <Button
                        variant="primary"
                        disabled={!canSave}
                        loading={busy}
                        onClick={() => (editing ? update.mutate() : create.mutate())}
                    >
                        {editing ? 'Save changes' : 'Create project'}
                    </Button>
                </div>
            </Modal>

            <ConfirmDialog
                open={!!confirmArchive}
                title="Archive project?"
                message={
                    confirmArchive
                        ? `"${confirmArchive.name}" will no longer appear in the time-entry dropdown. Existing entries keep their project reference.`
                        : undefined
                }
                confirmLabel="Archive"
                busy={archive.isPending}
                onCancel={() => setConfirmArchive(null)}
                onConfirm={() => confirmArchive && archive.mutate(confirmArchive.id)}
            />
        </div>
    );
}