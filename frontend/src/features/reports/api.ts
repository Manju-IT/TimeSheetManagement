import { apiClient } from '@/lib/apiClient';
import type { ReportFilterUser, ReportSummary } from './types';

export interface ReportQuery {
    from_date: string;
    to_date: string;
    project_id?: string;
    user_id?: string;
    billable?: boolean;
}

function qs(params: ReportQuery): string {
    const q = new URLSearchParams();
    q.set('from_date', params.from_date);
    q.set('to_date', params.to_date);
    if (params.project_id) q.set('project_id', params.project_id);
    if (params.user_id) q.set('user_id', params.user_id);
    if (params.billable !== undefined) q.set('billable', String(params.billable));
    return q.toString();
}

export const reportsApi = {
    users: () => apiClient.get<ReportFilterUser[]>('/api/v1/reports/users'),
    summary: (params: ReportQuery) =>
        apiClient.get<ReportSummary>(`/api/v1/reports/summary?${qs(params)}`),
    exportCsvUrl: (params: ReportQuery, report: 'projects' | 'members' | 'trend' | 'attendance') =>
        `/api/v1/reports/export.csv?${qs(params)}&report=${report}`,
    exportXlsxUrl: (params: ReportQuery) =>
        `/api/v1/reports/export.xlsx?${qs(params)}`,
};