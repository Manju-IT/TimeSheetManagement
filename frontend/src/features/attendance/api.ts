import { apiClient } from '@/lib/apiClient';
import type {
    AttendanceToday,
    CheckInResult,
    CheckOutResult,
    GeoEvent,
    GeoPermission,
    TeamAttendanceRow,
    WorkSession,
} from './types';

export interface LocationBody {
    latitude: number | null;
    longitude: number | null;
    accuracy_m: number | null;
    geo_permission: GeoPermission;
    client_reported_at: string;
    device_id?: string;
}

export const attendanceApi = {
    today: () => apiClient.get<AttendanceToday>('/api/v1/attendance/today'),
    checkIn: (body: LocationBody) =>
        apiClient.post<CheckInResult>('/api/v1/attendance/check-in', body),
    checkOut: (body: LocationBody) =>
        apiClient.post<CheckOutResult>('/api/v1/attendance/check-out', body),
    myEvents: (limit = 100) =>
        apiClient.get<GeoEvent[]>(`/api/v1/attendance/events?limit=${limit}`),
    mySessions: (limit = 100) =>
        apiClient.get<WorkSession[]>(`/api/v1/attendance/sessions?limit=${limit}`),
    team: (opts: { teamId?: string; workDate?: string } = {}) => {
        const q = new URLSearchParams();
        if (opts.teamId) q.set('team_id', opts.teamId);
        if (opts.workDate) q.set('work_date', opts.workDate);
        const qs = q.toString();
        return apiClient.get<TeamAttendanceRow[]>(
            `/api/v1/team/attendance${qs ? `?${qs}` : ''}`,
        );
    },
};