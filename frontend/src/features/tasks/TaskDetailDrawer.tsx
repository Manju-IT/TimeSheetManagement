import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from './api';
import type { Task } from './types';
import { ConflictDiffDialog } from './ConflictDiffDialog';
import { SyncBadge } from '@/components/ui/SyncBadge';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { classifyError } from '@/lib/errors';

export function TaskDetailDrawer({ task, onClose }: { task: Task; onClose: () => void }) {
    const qc = useQueryClient();
    const toast = useToast();
    const [showDiff, setShowDiff] = useState(false);

    const syncNow = useMutation({
        mutationFn: () => tasksApi.syncNow(task.id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['tasks'] });
            toast.success('Sync complete');
        },
        onError: (e) => {
            const c = classifyError(e);
            toast.error('Sync failed', c.message);
        },
    });

    return (
        <>
            <Drawer
                open
                onClose={onClose}
                title={task.title}
                subtitle={task.gh_repo ? `${task.gh_repo}${task.gh_issue_number ? ` #${task.gh_issue_number}` : ''}` : undefined}
                width={640}
                footer={
                    <>
                        {task.sync_state === 'conflict' && (
                            <Button variant="primary" onClick={() => setShowDiff(true)} iconLeft="alert-triangle">
                                Resolve conflict
                            </Button>
                        )}
                        {task.source === 'github' && task.sync_state !== 'syncing' && (
                            <Button
                                variant="secondary"
                                iconLeft="refresh"
                                onClick={() => syncNow.mutate()}
                                loading={syncNow.isPending}
                            >
                                Sync now
                            </Button>
                        )}
                    </>
                }
            >
                {task.sync_state === 'conflict' && (
                    <Banner tone="warning" title="GitHub changed after your local edit">
                        Both versions are preserved. Open the diff to choose which to keep.
                    </Banner>
                )}

                <div className="kv-grid">
                    <div className="kv">
                        <span className="muted small">Status</span>
                        <span>{task.status}</span>
                    </div>
                    <div className="kv">
                        <span className="muted small">Sync state</span>
                        <SyncBadge state={task.sync_state} errorCode={task.sync_last_error_code} />
                    </div>
                    <div className="kv">
                        <span className="muted small">Local updated</span>
                        <span className="num">{new Date(task.local_updated_at).toLocaleString()}</span>
                    </div>
                    <div className="kv">
                        <span className="muted small">Remote updated</span>
                        <span className="num">{task.gh_updated_at ? new Date(task.gh_updated_at).toLocaleString() : '—'}</span>
                    </div>
                </div>

                <div className="field">
                    <div className="field-label">Description</div>
                    <pre className="pre">{task.description || '—'}</pre>
                </div>

                {task.gh_url && (
                    <a href={task.gh_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 6 }}>
                        <Icon name="external-link" size={12} />
                        <span>Open in GitHub</span>
                    </a>
                )}
            </Drawer>

            {showDiff && (
                <ConflictDiffDialog task={task} onClose={() => { setShowDiff(false); onClose(); }} />
            )}
        </>
    );
}