import { apiClient } from '@/lib/apiClient';
import type { SyncState, Task } from './types';

interface Page<T> {
    data: T[];
    pagination: {
        page: number;
        page_size: number;
        total: number;
        has_next: boolean;
    };
}

export interface ConflictPreview {
    task_id: string;
    detected_at: string | null;
    conflict_remote_updated_at: string | null;
    remote_updated_at_now: string | null;
    remote_deleted: boolean;
    local: { title: string; description: string; status: string };
    remote: { title: string; description: string; status: string };
}

export const tasksApi = {
    list: (
        params: {
            project_id?: string;
            assignee_user_id?: string;
            status?: string;
            sync_state?: SyncState;
            include_inactive?: boolean;
            page?: number;
            page_size?: number;
        } = {},
    ) => {
        const q = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                q.set(key, String(value));
            }
        }

        return apiClient.get<Page<Task>>(
            `/api/v1/tasks?${q.toString()}`,
        );
    },

    get: (id: string) =>
        apiClient.get<Task>(
            `/api/v1/tasks/${id}`,
        ),

    create: (body: {
        project_id: string;
        title: string;
        description?: string;
        status?: string;
        assignee_user_id?: string | null;
    }) =>
        apiClient.post<Task>(
            '/api/v1/tasks',
            body,
        ),

    update: (
        id: string,
        body: Partial<Task> & {
            expected_updated_at?: string;
        },
    ) =>
        apiClient.patch<Task>(
            `/api/v1/tasks/${id}`,
            body,
        ),

    syncNow: (id: string) =>
        apiClient.post<Task>(
            `/api/v1/tasks/${id}/sync`,
        ),

    conflictPreview: (id: string) =>
        apiClient.get<ConflictPreview>(
            `/api/v1/tasks/${id}/conflict`,
        ),

    resolveConflict: (
        id: string,
        strategy: 'keep_mine' | 'use_github',
    ) =>
        apiClient.post<Task>(
            `/api/v1/tasks/${id}/conflict/resolve`,
            {
                strategy,
            },
        ),
};

