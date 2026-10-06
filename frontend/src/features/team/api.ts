import { apiClient } from '@/lib/apiClient';
import type { TeamAttendancePage, TeamOption, Timeline } from './types';

export const teamApi = {
    myTeams: () => apiClient.get<TeamOption[]>('/api/v1/team/teams'),
    attendance: (teamId: string, workDate: string) =>
        apiClient.get<TeamAttendancePage>(
            `/api/v1/team/attendance?team_id=${teamId}&work_date=${workDate}`,
        ),
    timeline: (teamId: string, userId: string, workDate: string) =>
        apiClient.get<Timeline>(
            `/api/v1/team/attendance/timeline?team_id=${teamId}&user_id=${userId}&work_date=${workDate}`,
        ),
};