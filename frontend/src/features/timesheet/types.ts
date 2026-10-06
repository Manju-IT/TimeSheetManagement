export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type AttendanceStatus =
    | 'open'
    | 'closed'
    | 'submitted'
    | 'approved'
    | 'rejected';

export interface TimesheetPeriod {
    id: string;
    user_id: string;
    period_start: string;
    period_end: string;
    status: TimesheetStatus;
    submitted_at: string | null;
    approved_by: string | null;
    approved_at: string | null;
    comment: string | null;
    version: number;
}

export interface WeekCell {
    minutes: number;
    entry_ids: string[];
}

export interface WeekRow {
    project_id: string;
    project_name: string;
    project_code: string | null;
    task_id: string | null;
    task_title: string | null;
    cells: Record<string, WeekCell>;
    total_minutes: number;
}

export interface WeekDay {
    work_date: string;
    weekday: string;
    is_future: boolean;
    first_login_at: string | null;
    last_logout_at: string | null;
    total_session_seconds: number;
    logged_seconds: number;
    attendance_status: AttendanceStatus | null;
    has_open_session: boolean;
    missing_attendance: boolean;
    variance_seconds: number;
    variance_exceeds_threshold: boolean;
}

export interface TimesheetWeek {
    period: TimesheetPeriod;
    days: WeekDay[];
    rows: WeekRow[];
    daily_totals: Record<string, number>;
    weekly_total_minutes: number;
    variance_threshold_minutes: number;
}

export interface ReviewUser {
    id: string;
    email: string;
    full_name: string;
}

export interface ReviewItem {
    period: TimesheetPeriod;
    user: ReviewUser;
}

export interface ReviewDetail {
    period: TimesheetPeriod;
    user: ReviewUser;
    week: TimesheetWeek;
}