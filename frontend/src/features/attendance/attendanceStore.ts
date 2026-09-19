// Assigned Office Address and Geofence for EZMedTech AI
export const ASSIGNED_OFFICE = {
    name: 'EZMedTech Headquarters',
    code: 'BLR-HQ-01',
    address: 'Tower B, 4th Floor, RMZ Ecoworld, Outer Ring Road, Bellandur, Bengaluru, Karnataka 560103, India',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560103',
    latitude: 12.9237,
    longitude: 77.6836,
    radiusMeters: 300,
    timezone: 'Asia/Kolkata',
};

export interface AttendanceEvent {
    id: string;
    email: string;
    name: string;
    eventType: 'login' | 'logout';
    timestamp: string;
    officeName: string;
    officeAddress: string;
    latitude: number;
    longitude: number;
    insideSite: boolean;
}

export interface StoredSession {
    email: string;
    name: string;
    loginTime: string;
    logoutTime: string | null;
    officeName: string;
    officeAddress: string;
    isActive: boolean;
    date: string;
}

const STORAGE_KEY_SESSION = 'ezmedtech_active_session';
const STORAGE_KEY_EVENTS = 'ezmedtech_attendance_events';

export function getStoredSession(): StoredSession | null {
    try {
        const data = localStorage.getItem(STORAGE_KEY_SESSION);
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

export function getStoredEvents(): AttendanceEvent[] {
    try {
        const data = localStorage.getItem(STORAGE_KEY_EVENTS);
        if (data) return JSON.parse(data);
    } catch {
        // ignore
    }
    const today = new Date().toISOString().split('T')[0];
    return [
        {
            id: 'seed-event-1',
            email: 'yasaswini@ezmedtech.ai',
            name: 'Yasaswini',
            eventType: 'login',
            timestamp: `${today}T09:30:00.000Z`,
            officeName: ASSIGNED_OFFICE.name,
            officeAddress: ASSIGNED_OFFICE.address,
            latitude: ASSIGNED_OFFICE.latitude,
            longitude: ASSIGNED_OFFICE.longitude,
            insideSite: true,
        },
    ];
}

export function recordLoginEvent(email: string, name: string): StoredSession {
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const session: StoredSession = {
        email,
        name,
        loginTime: now,
        logoutTime: null,
        officeName: ASSIGNED_OFFICE.name,
        officeAddress: ASSIGNED_OFFICE.address,
        isActive: true,
        date: today,
    };

    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));

    const events = getStoredEvents();
    const newEvent: AttendanceEvent = {
        id: 'evt-' + Date.now(),
        email,
        name,
        eventType: 'login',
        timestamp: now,
        officeName: ASSIGNED_OFFICE.name,
        officeAddress: ASSIGNED_OFFICE.address,
        latitude: ASSIGNED_OFFICE.latitude,
        longitude: ASSIGNED_OFFICE.longitude,
        insideSite: true,
    };

    events.unshift(newEvent);
    localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(events.slice(0, 50)));

    return session;
}

export function recordLogoutEvent(): StoredSession | null {
    const session = getStoredSession();
    const now = new Date().toISOString();

    if (session) {
        session.logoutTime = now;
        session.isActive = false;
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));

        const events = getStoredEvents();
        const newEvent: AttendanceEvent = {
            id: 'evt-' + Date.now(),
            email: session.email,
            name: session.name,
            eventType: 'logout',
            timestamp: now,
            officeName: ASSIGNED_OFFICE.name,
            officeAddress: ASSIGNED_OFFICE.address,
            latitude: ASSIGNED_OFFICE.latitude,
            longitude: ASSIGNED_OFFICE.longitude,
            insideSite: true,
        };

        events.unshift(newEvent);
        localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(events.slice(0, 50)));
        return session;
    }

    return null;
}
