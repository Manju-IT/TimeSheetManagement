import { apiClient } from '@/lib/apiClient';
import type {
    ReviewDetail,
    ReviewItem,
    TimesheetPeriod,
    TimesheetStatus,
    TimesheetWeek,
} from './types';

interface Page<T> {
    data: T[];
    pagination: { page: number; page_size: number; total: number; has_next: boolean };
}

function isoDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const timesheetApi = {
    myWeek: (anchor: Date | string) => {
        const a = typeof anchor === 'string' ? anchor : isoDate(anchor);
        return apiClient.get<TimesheetWeek>(`/api/v1/timesheets/week?anchor=${a}`);
    },
    myPeriod: (id: string) => apiClient.get<TimesheetWeek>(`/api/v1/timesheets/${id}`),
    mine: (page = 1, pageSize = 25) =>
        apiClient.get<Page<TimesheetPeriod>>(
            `/api/v1/timesheets/mine?page=${page}&page_size=${pageSize}`,
        ),
    submit: (periodId: string, expectedVersion: number) =>
        apiClient.post<TimesheetPeriod>(`/api/v1/timesheets/${periodId}/submit`, {
            expected_version: expectedVersion,
        }),
    reopen: (periodId: string, expectedVersion: number) =>
        apiClient.post<TimesheetPeriod>(`/api/v1/timesheets/${periodId}/reopen`, {
            expected_version: expectedVersion,
        }),

    reviewQueue: (status: TimesheetStatus | '' = 'submitted', page = 1, pageSize = 25) => {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        params.set('page', String(page));
        params.set('page_size', String(pageSize));
        return apiClient.get<Page<ReviewItem>>(`/api/v1/timesheets/review/queue?${params}`);
    },
    reviewDetail: (periodId: string) =>
        apiClient.get<ReviewDetail>(`/api/v1/timesheets/review/${periodId}`),
    approve: (periodId: string, expectedVersion: number, comment?: string) =>
        apiClient.post<TimesheetPeriod>(`/api/v1/timesheets/${periodId}/approve`, {
            expected_version: expectedVersion,
            comment: comment ?? null,
        }),
    reject: (periodId: string, expectedVersion: number, comment: string) =>
        apiClient.post<TimesheetPeriod>(`/api/v1/timesheets/${periodId}/reject`, {
            expected_version: expectedVersion,
            comment,
        }),
};