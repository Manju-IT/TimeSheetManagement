import { apiClient } from '@/lib/apiClient';
import type {
    AdminUser, AuditLog, Organization, Page, Policy, SSOConfig, SyncLog, WorkSite,
} from './types';

function qs(params: Record<string, unknown>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    }
    const s = q.toString();
    return s ? `?${s}` : '';
}

export const adminApi = {
    // Users
    listUsers: (params: { q?: string; status?: string; page?: number; page_size?: number } = {}) =>
        apiClient.get<Page<AdminUser>>(`/api/v1/admin/users${qs(params)}`),
    patchUser: (id: string, body: Partial<{ full_name: string; status: string; timezone: string | null; github_login: string | null }>) =>
        apiClient.patch<AdminUser>(`/api/v1/admin/users/${id}`, body),
    grantRole: (id: string, role: string) =>
        apiClient.post<{ ok: boolean }>(`/api/v1/admin/users/${id}/roles`, { role }),
    revokeRole: (id: string, role: string) =>
        apiClient.delete<{ ok: boolean }>(`/api/v1/admin/users/${id}/roles/${role}`),

    // Work sites
    listWorkSites: () => apiClient.get<WorkSite[]>('/api/v1/admin/work-sites'),
    createWorkSite: (body: { name: string; latitude: number; longitude: number; radius_m: number; is_active: boolean }) =>
        apiClient.post<WorkSite>('/api/v1/admin/work-sites', body),
    updateWorkSite: (id: string, body: Partial<WorkSite>) =>
        apiClient.patch<WorkSite>(`/api/v1/admin/work-sites/${id}`, body),
    deactivateWorkSite: (id: string) =>
        apiClient.delete<{ ok: boolean }>(`/api/v1/admin/work-sites/${id}`),

    // Policies
    getPolicy: () => apiClient.get<Policy>('/api/v1/admin/policies'),
    updatePolicy: (body: Partial<Policy>) =>
        apiClient.patch<Policy>('/api/v1/admin/policies', body),

    // Organization
    getOrganization: () => apiClient.get<Organization>('/api/v1/admin/organization'),
    updateOrganization: (body: Partial<Organization> & { clear_workday_cutoff?: boolean }) =>
        apiClient.patch<Organization>('/api/v1/admin/organization', body),

    // SSO
    getSSO: () => apiClient.get<SSOConfig>('/api/v1/admin/sso'),
    updateSSO: (body: Partial<SSOConfig>) =>
        apiClient.patch<SSOConfig>('/api/v1/admin/sso', body),

    // Audit
    listAudit: (params: {
        action?: string; entity?: string; actor_user_id?: string;
        since?: string; until?: string; page?: number; page_size?: number;
    } = {}) =>
        apiClient.get<Page<AuditLog>>(`/api/v1/admin/audit-logs${qs(params)}`),

    // Sync logs
    listSyncLogs: (params: {
        direction?: string; entity?: string; trigger?: string; status?: string;
        since?: string; until?: string; page?: number; page_size?: number;
    } = {}) =>
        apiClient.get<Page<SyncLog>>(`/api/v1/admin/sync-logs${qs(params)}`),
    retrySync: (taskId: string) =>
        apiClient.post<{ task_id: string; queued: boolean; previous_state: string }>(
            `/api/v1/admin/sync-logs/retry/${taskId}`,
        ),
};