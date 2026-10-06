export interface GeoEventSummary {
    id: string;
    event_type: 'login' | 'logout' | 'heartbeat';
    occurred_at: string;
    latitude: number | null;
    longitude: number | null;
    accuracy_m: number | null;
    place_label: string | null;
    inside_site: boolean | null;
    geo_permission: 'granted' | 'denied' | 'unavailable';
    site_id: string | null;
}

export interface WorkSessionSummary {
    id: string;
    login_at: string;
    logout_at: string | null;
    logout_reason: string | null;
    session_seconds: number | null;
}

export interface TeamAttendanceRow {
    user_id: string;
    email: string;
    full_name: string;
    timezone: string | null;
    work_date: string;
    first_login_at: string | null;
    last_logout_at: string | null;
    first_login_event: GeoEventSummary | null;
    last_logout_event: GeoEventSummary | null;
    active_session: WorkSessionSummary | null;
    total_session_seconds: number;
    logged_seconds: number;
    entry_count: number;
    billable_minutes: number;
    attendance_status: string | null;
    flags: string[];
}

export interface TeamAttendancePage {
    team_id: string;
    team_name: string;
    work_date: string;
    variance_threshold_minutes: number;
    rows: TeamAttendanceRow[];
}

export interface TimelineEntry {
    kind: 'login' | 'logout';
    occurred_at: string;
    latitude: number | null;
    longitude: number | null;
    accuracy_m: number | null;
    place_label: string | null;
    inside_site: boolean | null;
    geo_permission: 'granted' | 'denied' | 'unavailable';
    ip: string | null;
    device_id: string | null;
    session_id: string | null;
}

export interface Timeline {
    user: { user_id: string; email: string; full_name: string; timezone: string | null };
    work_date: string;
    attendance_day_id: string | null;
    attendance_status: string | null;
    first_login_at: string | null;
    last_logout_at: string | null;
    total_session_seconds: number;
    logged_seconds: number;
    events: TimelineEntry[];
    sessions: WorkSessionSummary[];
}

export interface TeamOption {
    id: string;
    name: string;
}