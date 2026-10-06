import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/features/projects/api';
import { tasksApi } from '@/features/tasks/api';
import { timeEntriesApi, type UpdateTimeEntryBody, newIdempotencyKey } from './api';
import type { TimeEntry } from './types';
import { offlineQueue, type QueuedPayload } from '@/lib/offlineQueue';
import { toQueueError, isRetryable } from './queueHelpers';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Banner';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { classifyError } from '@/lib/errors';

interface Props {
    open: boolean;
    onClose: () => void;
    entry?: TimeEntry | null;
    defaultDate?: string;
    defaultProjectId?: string;
    defaultTaskId?: string;
}

interface DraftLink { url: string; note: string }

type SaveResult =
    | { kind: 'saved'; entry: TimeEntry }
    | { kind: 'updated'; entry: TimeEntry }
    | { kind: 'queued'; key: string };

const QUICK = [15, 30, 60, 120, 240];

export function TimeEntryDrawer({
    open,
    onClose,
    entry,
    defaultDate,
    defaultProjectId,
    defaultTaskId,
}: Props) {
    const qc = useQueryClient();
    const toast = useToast();
    const isEdit = !!entry;

    const projectsQuery = useQuery({
        queryKey: ['projects', { activeOnly: true }],
        queryFn: () => projectsApi.list(true),
        enabled: open,
    });
    const projects = projectsQuery.data?.data ?? [];

    const [projectId, setProjectId] = useState('');
    const [taskId, setTaskId] = useState('');
    const [description, setDescription] = useState('');
    const [mode, setMode] = useState<'duration' | 'times'>('duration');
    const [durationMinutes, setDurationMinutes] = useState(60);
    const [startedAt, setStartedAt] = useState('');
    const [endedAt, setEndedAt] = useState('');
    const [billable, setBillable] = useState(false);
    const [links, setLinks] = useState<DraftLink[]>([]);
    const [formError, setFormError] = useState<string | null>(null);
    const [projectSearch, setProjectSearch] = useState('');

    useEffect(() => {
        if (!open) return;
        setFormError(null);
        setProjectSearch('');
        if (entry) {
            setProjectId(entry.project_id);
            setTaskId(entry.task_id ?? '');
            setDescription(entry.description);
            setBillable(entry.billable);
            if (entry.started_at && entry.ended_at) {
                setMode('times');
                setStartedAt(toLocal(entry.started_at));
                setEndedAt(toLocal(entry.ended_at));
            } else {
                setMode('duration');
                setDurationMinutes(entry.duration_minutes);
            }
            setLinks(entry.code_links.map((l) => ({ url: l.url, note: l.note ?? '' })));
        } else {
            setProjectId(defaultProjectId ?? projects[0]?.id ?? '');
            setTaskId(defaultTaskId ?? '');
            setDescription('');
            setBillable(false);
            setMode('duration');
            setDurationMinutes(60);
            setStartedAt('');
            setEndedAt('');
            setLinks([]);
        }
    }, [open, entry, projects.length, defaultProjectId, defaultTaskId]);

    const tasksQuery = useQuery({
        queryKey: ['tasks', { project_id: projectId, page_size: 100 }],
        queryFn: () => tasksApi.list({ project_id: projectId, page_size: 100 }),
        enabled: open && !!projectId,
    });
    const tasks = tasksQuery.data?.data ?? [];

    const filteredProjects = useMemo(() => {
        const q = projectSearch.trim().toLowerCase();
        if (!q) return projects;
        return projects.filter(
            (p) =>
                p.name.toLowerCase().includes(q) ||
                (p.code ?? '').toLowerCase().includes(q),
        );
    }, [projects, projectSearch]);

    const durationDerived = useMemo(() => {
        if (mode === 'times' && startedAt && endedAt) {
            const s = new Date(startedAt).getTime();
            const e = new Date(endedAt).getTime();
            if (isFinite(s) && isFinite(e) && e > s) return Math.round((e - s) / 60000);
            return null;
        }
        return durationMinutes;
    }, [mode, startedAt, endedAt, durationMinutes]);

    const durationError =
        mode === 'times' && startedAt && endedAt && durationDerived === null
            ? 'End time must be after start time.'
            : durationDerived != null && (durationDerived < 1 || durationDerived > 1440)
                ? 'Duration must be between 1 minute and 24 hours.'
                : null;

    function buildCreatePayload(): QueuedPayload {
        const codeLinks = links
            .filter((l) => l.url.trim())
            .map((l) => ({ url: l.url.trim(), note: l.note.trim() || null }));
        return {
            project_id: projectId,
            task_id: taskId || null,
            description,
            billable,
            code_links: codeLinks,
            work_date: defaultDate ?? null,
            duration_minutes: mode === 'duration' ? durationMinutes : null,
            started_at: mode === 'times' && startedAt ? new Date(startedAt).toISOString() : null,
            ended_at: mode === 'times' && endedAt ? new Date(endedAt).toISOString() : null,
        };
    }

    function buildUpdateBody(): UpdateTimeEntryBody {
        const codeLinks = links
            .filter((l) => l.url.trim())
            .map((l) => ({ url: l.url.trim(), note: l.note.trim() || null }));
        const body: UpdateTimeEntryBody = {
            expected_version: entry!.version,
            project_id: projectId,
            task_id: taskId || null,
            clear_task: !taskId,
            description,
            billable,
            code_links: codeLinks,
        };
        if (mode === 'times' && startedAt && endedAt) {
            body.started_at = new Date(startedAt).toISOString();
            body.ended_at = new Date(endedAt).toISOString();
        } else {
            body.duration_minutes = durationMinutes;
        }
        return body;
    }

    const save = useMutation<SaveResult, Error, void>({
        mutationFn: async () => {
            if (isEdit && entry) {
                // Edits need the current server version; they are not queueable.
                const updated = await timeEntriesApi.update(entry.id, buildUpdateBody());
                return { kind: 'updated', entry: updated };
            }

            const payload = buildCreatePayload();
            const key = newIdempotencyKey();

            // Fast path: browser already knows we're offline.
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                offlineQueue.enqueue(payload, key);
                return { kind: 'queued', key };
            }

            try {
                const saved = await timeEntriesApi.create({
                    ...payload,
                    client_idempotency_key: key,
                });
                return { kind: 'saved', entry: saved };
            } catch (err) {
                const c = classifyError(err);
                if (isRetryable(c)) {
                    offlineQueue.enqueue(payload, key, toQueueError(err, c));
                    return { kind: 'queued', key };
                }
                throw err;
            }
        },
        onSuccess: (result) => {
            if (result.kind === 'saved') {
                toast.success('Entry saved');
            } else if (result.kind === 'updated') {
                toast.success('Entry updated');
            } else {
                toast.info(
                    'Saved on this device',
                    'We will sync it automatically when the connection returns.',
                );
            }
            qc.invalidateQueries({ queryKey: ['time-entries'] });
            qc.invalidateQueries({ queryKey: ['attendance'] });
            qc.invalidateQueries({ queryKey: ['timesheet'] });
            onClose();
        },
        onError: (e) => {
            const c = classifyError(e);
            if (c.kind === 'stale') {
                setFormError('This entry was modified in another session. Reload the page and try again.');
            } else if (c.code === 'TIME_ENTRY_OVERLAP') {
                setFormError('This entry overlaps an existing one.');
            } else if (c.code === 'TIMESHEET_LOCKED') {
                setFormError('This week has been submitted and cannot accept new entries.');
            } else if (c.kind === 'offline' || c.kind === 'network') {
                setFormError('You appear to be offline. Try again, or reopen the form to queue the entry.');
            } else {
                setFormError(c.message);
            }
        },
    });

    function submit() {
        setFormError(null);
        if (!projectId) return setFormError('Select a project.');
        if (durationError) return setFormError(durationError);
        if (isEdit && typeof navigator !== 'undefined' && navigator.onLine === false) {
            return setFormError('Editing requires a connection. Save changes when you are back online.');
        }
        save.mutate();
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={isEdit ? 'Edit time entry' : 'Add time entry'}
            subtitle={isEdit ? 'Changes are audited' : 'Log time against a project and task'}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button
                        variant="primary"
                        onClick={submit}
                        loading={save.isPending}
                        disabled={!!durationError}
                    >
                        {isEdit ? 'Save changes' : 'Save entry'}
                    </Button>
                </>
            }
        >
            <Field label="Project" required hint="Use search to narrow the list.">
                {(id) => (
                    <>
                        <div className="input-with-icon">
                            <Icon name="search" size={12} />
                            <input
                                className="input"
                                placeholder="Search projects…"
                                value={projectSearch}
                                onChange={(e) => setProjectSearch(e.target.value)}
                            />
                        </div>
                        <select
                            id={id}
                            className="input select"
                            value={projectId}
                            onChange={(e) => { setProjectId(e.target.value); setTaskId(''); }}
                        >
                            <option value="">Select project…</option>
                            {filteredProjects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.source === 'github' ? '⌥ ' : ''}{p.name}{p.code ? ` · ${p.code}` : ''}
                                </option>
                            ))}
                        </select>
                    </>
                )}
            </Field>

            <Field label="Task" hint={projectId ? undefined : 'Select a project first'}>
                {(id) => (
                    <select
                        id={id}
                        className="input select"
                        value={taskId}
                        onChange={(e) => setTaskId(e.target.value)}
                        disabled={!projectId || tasksQuery.isLoading}
                    >
                        <option value="">— No task —</option>
                        {tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.gh_issue_number ? `#${t.gh_issue_number} ` : ''}{t.title}
                            </option>
                        ))}
                    </select>
                )}
            </Field>

            <Field label="Description" hint={`${description.length} / 10000`}>
                {(id) => (
                    <Textarea
                        id={id}
                        rows={4}
                        maxLength={10000}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What did you work on?"
                    />
                )}
            </Field>

            <div className="field">
                <span className="field-label">Duration</span>
                <div className="segmented" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'duration'}
                        className={mode === 'duration' ? 'active' : ''}
                        onClick={() => setMode('duration')}
                    >Duration</button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'times'}
                        className={mode === 'times' ? 'active' : ''}
                        onClick={() => setMode('times')}
                    >Start / End</button>
                </div>
            </div>

            {mode === 'duration' ? (
                <div className="quick-duration">
                    {QUICK.map((m) => (
                        <button
                            key={m}
                            type="button"
                            className={`chip ${durationMinutes === m ? 'active' : ''}`}
                            onClick={() => setDurationMinutes(m)}
                        >
                            {m >= 60 ? `${m / 60}h` : `${m}m`}
                        </button>
                    ))}
                    <input
                        type="number"
                        className="input"
                        min={1}
                        max={1440}
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(Number(e.target.value))}
                        style={{ width: 90 }}
                    />
                    <span className="muted small">minutes</span>
                </div>
            ) : (
                <div className="grid-2">
                    <Field label="Start">
                        {(id) => <Input id={id} type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />}
                    </Field>
                    <Field label="End">
                        {(id) => <Input id={id} type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />}
                    </Field>
                    {durationDerived != null && (
                        <div className="duration-derived muted small" style={{ gridColumn: '1 / -1' }}>
                            Computed: <strong>{Math.floor(durationDerived / 60)}h {String(durationDerived % 60).padStart(2, '0')}m</strong>
                        </div>
                    )}
                </div>
            )}

            <label className="field field-inline">
                <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
                <span>Billable</span>
            </label>

            <div className="field">
                <div className="field-label">Code links</div>
                <div className="stack">
                    {links.map((l, idx) => (
                        <CodeLinkRow
                            key={idx}
                            value={l}
                            onChange={(next) => {
                                const copy = [...links];
                                copy[idx] = next;
                                setLinks(copy);
                            }}
                            onRemove={() => setLinks(links.filter((_, i) => i !== idx))}
                        />
                    ))}
                    <Button
                        variant="ghost"
                        size="sm"
                        iconLeft="plus"
                        onClick={() => setLinks([...links, { url: '', note: '' }])}
                        type="button"
                    >
                        Add link
                    </Button>
                </div>
            </div>

            {formError && <Banner tone="danger" title="Cannot save">{formError}</Banner>}
        </Drawer>
    );
}

function CodeLinkRow({
    value,
    onChange,
    onRemove,
}: {
    value: DraftLink;
    onChange: (v: DraftLink) => void;
    onRemove: () => void;
}) {
    const preview = useQuery({
        queryKey: ['link-preview', value.url],
        queryFn: () => timeEntriesApi.previewLink(value.url),
        enabled: value.url.length > 8 && value.url.startsWith('http'),
        staleTime: 60_000,
    });

    return (
        <div className="code-link-row">
            <input
                type="url"
                className="input"
                placeholder="https://github.com/owner/repo/commit/…"
                value={value.url}
                onChange={(e) => onChange({ ...value, url: e.target.value })}
            />
            {preview.data && (
                <span className="link-badge">
                    {preview.data.link_type.replace('_', ' ')}
                    {preview.data.repo ? ` · ${preview.data.repo}` : ''}
                    {preview.data.number ? ` #${preview.data.number}` : ''}
                </span>
            )}
            <input
                type="text"
                className="input"
                placeholder="Note (optional)"
                value={value.note}
                onChange={(e) => onChange({ ...value, note: e.target.value })}
            />
            <button type="button" className="icon-btn" aria-label="Remove link" onClick={onRemove}>
                <Icon name="trash" size={12} />
            </button>
        </div>
    );
}

function toLocal(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}