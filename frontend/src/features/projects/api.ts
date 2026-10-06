import { apiClient } from '@/lib/apiClient';
import type { Project } from './types';

interface Page<T> {
    data: T[];
    pagination: { page: number; page_size: number; total: number; has_next: boolean };
}

export const projectsApi = {
    list: (activeOnly = true) =>
        apiClient.get<Page<Project>>(
            `/api/v1/projects?active_only=${activeOnly}&page_size=100`,
        ),
    get: (id: string) => apiClient.get<Project>(`/api/v1/projects/${id}`),
    create: (body: { name: string; code?: string | null }) =>
        apiClient.post<Project>('/api/v1/projects', body),
    update: (id: string, body: Partial<{ name: string; code: string | null; is_active: boolean }>) =>
        apiClient.patch<Project>(`/api/v1/projects/${id}`, body),
};