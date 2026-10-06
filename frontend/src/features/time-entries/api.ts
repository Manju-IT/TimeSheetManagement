import { apiClient } from '@/lib/apiClient';
import type { CodeLinkPreview, TimeEntry, TimeEntryStatus } from './types';

interface Page<T> {
    data: T[];
    pagination: { page: number; page_size: number; total: number; has_next: boolean };
}

export interface CreateTimeEntryBody {
    project_id: string;
    task_id?: string | null;
    description?: string;
    started_at?: string | null;
    ended_at?: string | null;
    duration_minutes?: number | null;
    billable?: boolean;
    work_date?: string | null;
    code_links?: { url: string; note?: string | null }[];
    client_idempotency_key?: string | null;
}

export { newIdempotencyKey } from '@/lib/apiClient';

export interface UpdateTimeEntryBody {
    expected_version: number;
    project_id?: string;
    task_id?: string | null;
    clear_task?: boolean;
    description?: string;
    started_at?: string | null;
    ended_at?: string | null;
    duration_minutes?: number;
    billable?: boolean;
    work_date?: string;
    code_links?: { url: string; note?: string | null }[];
}

export const timeEntriesApi = {
    list: (params: {
        from_date?: string;
        to_date?: string;
        project_id?: string;
        status?: TimeEntryStatus;
        page?: number;
        page_size?: number;
    } = {}) => {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null) q.set(k, String(v));
        }
        return apiClient.get<Page<TimeEntry>>(`/api/v1/time-entries?${q.toString()}`);
    },
    get: (id: string) => apiClient.get<TimeEntry>(`/api/v1/time-entries/${id}`),
    create: (body: CreateTimeEntryBody) =>
        apiClient.post<TimeEntry>('/api/v1/time-entries', body),
    update: (id: string, body: UpdateTimeEntryBody) =>
        apiClient.patch<TimeEntry>(`/api/v1/time-entries/${id}`, body),
    delete: (id: string) => apiClient.delete<{ ok: boolean }>(`/api/v1/time-entries/${id}`),
    previewLink: (url: string) =>
        apiClient.get<CodeLinkPreview>(
            `/api/v1/time-entries/preview-link?url=${encodeURIComponent(url)}`,
        ),
};