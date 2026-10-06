export interface ReportFilterUser {
    id: string;
    email: string;
    full_name: string;
}

export interface HoursByProject {
    project_id: string;
    name: string;
    code: string | null;
    minutes: number;
    entries: number;
}

export interface HoursByMember {
    user_id: string;
    full_name: string;
    email: string;
    minutes: number;
    entries: number;
}

export interface DailyTrend {
    work_date: string;
    minutes: number;
    entries: number;
}

export interface AttendanceSummary {
    user_id: string;
    full_name: string;
    email: string;
    days: number;
    session_seconds: number;
    logged_seconds: number;
    variance_seconds: number;
}

export interface ReportSummary {
    from_date: string;
    to_date: string;
    total_minutes: number;
    total_entries: number;
    hours_by_project: HoursByProject[];
    hours_by_member: HoursByMember[];
    daily_trend: DailyTrend[];
    attendance_summary: AttendanceSummary[];
}