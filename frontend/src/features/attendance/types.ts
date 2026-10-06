export type GeoPermission = 'granted' | 'denied' | 'unavailable';
export type GeoEventType = 'login' | 'logout' | 'heartbeat';

export interface GeoEvent {
    id: string;
    event_type: 'login' | 'logout';
    occurred_at: string;
    client_reported_at: string | null;

    latitude: number | null;
    longitude: number | null;
    accuracy_m: number | null;

    geo_permission: 'granted' | 'denied' | 'unavailable';

    place_label: string | null;

    site_id: string | null;
    inside_site: boolean | null;

    distance_to_site_m: number | null;
}

export interface WorkSession {
    id: string;
    user_id: string;
    login_at: string;
    logout_at: string | null;
    logout_reason: string | null;
    session_seconds: number | null;
}

export interface AttendanceDay {
    id: string;
    user_id: string;
    work_date: string;
    first_login_at: string | null;
    last_logout_at: string | null;
    total_session_seconds: number;
    logged_seconds: number;
    status: 'open' | 'closed' | 'submitted' | 'approved' | 'rejected';
}

export interface AttendanceToday {
    work_date: string;              // NEW: 'YYYY-MM-DD' from the server
    attendance_day: AttendanceDay | null;
    active_session: WorkSession | null;
    stale_session: WorkSession | null;   // NEW
    first_login_event: GeoEvent | null;
    last_logout_event: GeoEvent | null;
}

export interface CheckInResult {
    attendance_day: AttendanceDay;
    work_session: WorkSession;
    login_event: GeoEvent;
    is_duplicate: boolean;
}

export interface CheckOutResult {
    attendance_day: AttendanceDay | null;
    work_session: WorkSession | null;
    logout_event: GeoEvent | null;
    is_duplicate: boolean;
}


export interface TeamAttendanceRow {
    user_id: string;
    email: string;
    full_name: string;
    attendance_day: AttendanceDay | null;
    active_session: WorkSession | null;
    first_login_event: GeoEvent | null;
    last_logout_event: GeoEvent | null;
    entry_count: number;
    flags: string[];
}