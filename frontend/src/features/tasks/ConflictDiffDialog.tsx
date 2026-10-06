import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from './api';
import type { Task } from './types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { useToast } from '@/components/ui/Toast';
import { classifyError } from '@/lib/errors';

export function ConflictDiffDialog({ task, onClose }: { task: Task; onClose: () => void }) {
    const qc = useQueryClient();
    const toast = useToast();

    const preview = useQuery({
        queryKey: ['task-conflict', task.id],
        queryFn: () => tasksApi.conflictPreview(task.id),
    });

    const resolve = useMutation({
        mutationFn: (strategy: 'keep_mine' | 'use_github') => tasksApi.resolveConflict(task.id, strategy),
        onSuccess: (_data, strategy) => {
            qc.invalidateQueries({ queryKey: ['tasks'] });
            qc.invalidateQueries({ queryKey: ['task-conflict', task.id] });
            toast.success(strategy === 'keep_mine' ? 'Local version pushed' : 'Local version replaced');
            onClose();
        },
        onError: (e) => {
            const c = classifyError(e);
            if (c.code === 'REMOTE_STILL_CHANGING') {
                toast.warn('Remote changed again', 'Refresh the diff and try again.');
                qc.invalidateQueries({ queryKey: ['task-conflict', task.id] });
            } else {
                toast.error('Resolution failed', c.message);
            }
        },
    });

    const remoteChangedAgain =
        preview.data?.conflict_remote_updated_at &&
        preview.data?.remote_updated_at_now &&
        new Date(preview.data.remote_updated_at_now) > new Date(preview.data.conflict_remote_updated_at);

    return (
        <Modal open onClose={onClose} title={`Conflict — ${task.title}`} size="lg">
            {preview.isLoading && <div className="muted">Loading diff…</div>}
            {preview.isError && <Banner tone="danger" title="Failed to load remote state" />}
            {preview.data && (
                <>
                    <div className="muted small" style={{ marginBottom: 12 }}>
                        Detected {preview.data.detected_at ? new Date(preview.data.detected_at).toLocaleString() : '—'}
                        {preview.data.remote_updated_at_now && (
                            <> · Remote now: {new Date(preview.data.remote_updated_at_now).toLocaleTimeString()}</>
                        )}
                    </div>

                    {preview.data.remote_deleted && (
                        <Banner tone="danger" title="The GitHub item no longer exists">
                            Use <strong>Use GitHub</strong> to abandon the local edit and mark the task inactive.
                        </Banner>
                    )}
                    {remoteChangedAgain && (
                        <Banner tone="warning" title="Remote changed again since detection">
                            Reopen the diff or choose <strong>Use GitHub</strong>.
                        </Banner>
                    )}

                    <div className="conflict-grid">
                        <div>
                            <h4>Local (yours)</h4>
                            <div className="muted small">Status: {preview.data.local.status}</div>
                            <pre className="pre">{preview.data.local.description || '—'}</pre>
                        </div>
                        <div>
                            <h4>GitHub (remote)</h4>
                            <div className="muted small">Status: {preview.data.remote.status || '—'}</div>
                            <pre className="pre">{preview.data.remote.description || '—'}</pre>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <Button variant="secondary" onClick={() => resolve.mutate('use_github')} loading={resolve.isPending && resolve.variables === 'use_github'}>
                            Use GitHub
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => resolve.mutate('keep_mine')}
                            loading={resolve.isPending && resolve.variables === 'keep_mine'}
                            disabled={preview.data.remote_deleted}
                        >
                            Keep mine
                        </Button>
                    </div>
                </>
            )}
        </Modal>
    );
}