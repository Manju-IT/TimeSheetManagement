import { useQuery } from '@tanstack/react-query';
import { attendanceApi } from './api';

function fmt(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function formatDistance(distanceM: number | null | undefined) {
    if (distanceM == null) {
        return '—';
    }

    if (distanceM < 1000) {
        return `${Math.round(distanceM)} m`;
    }

    return `${(distanceM / 1000).toFixed(2)} km`;
}

function getPlaceLabel(
    insideSite: boolean | null | undefined,
    placeLabel?: string | null,
) {
    if (placeLabel) return placeLabel;

    if (insideSite === true) return 'On site';

    if (insideSite === false) return 'Off site';

    return 'Unknown';
}

function getPlaceClass(
    insideSite: boolean | null | undefined,
) {
    if (insideSite === true) {
        return 'location-badge location-badge-success';
    }

    if (insideSite === false) {
        return 'location-badge location-badge-muted';
    }

    return 'location-badge location-badge-neutral';
}

function getEventClass(eventType: string) {
    const type = eventType.toLowerCase();

    if (
        type === 'login' ||
        type === 'check_in' ||
        type === 'check-in'
    ) {
        return 'location-event-badge location-event-login';
    }

    if (
        type === 'logout' ||
        type === 'check_out' ||
        type === 'check-out'
    ) {
        return 'location-event-badge location-event-logout';
    }

    return 'location-event-badge location-event-default';
}

function formatEventType(eventType: string) {
    return eventType
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPermission(permission: string) {
    return permission
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function LocationHistoryPage() {
    const q = useQuery({
        queryKey: ['attendance', 'events'],
        queryFn: () => attendanceApi.myEvents(200),
    });

    const events = q.data ?? [];

    return (
        <div className="page location-history-page">
            {/* =====================================================
                PAGE HEADER
               ===================================================== */}
            <header className="page-header location-history-header">
                <div className="location-history-header-content">
                    <div>
                        <div className="location-history-eyebrow">
                            Attendance &amp; privacy
                        </div>

                        <h1 className="location-history-title">
                            My location history
                        </h1>

                        <p className="location-history-subtitle">
                            Review the location information recorded during your
                            attendance activity.
                        </p>
                    </div>

                    {!q.isLoading && !q.isError && (
                        <div className="location-history-count">
                            <span className="location-history-count-value">
                                {events.length}
                            </span>

                            <span className="location-history-count-label">
                                {events.length === 1 ? 'event' : 'events'}
                            </span>
                        </div>
                    )}
                </div>
            </header>

            {/* =====================================================
                PRIVACY INFORMATION
               ===================================================== */}
            <section
                className="location-privacy-card"
                aria-label="Location privacy information"
            >
                <div
                    className="location-privacy-icon"
                    aria-hidden="true"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M12 21s7-4.35 7-10V5l-7-3-7 3v6c0 5.65 7 10 7 10Z" />
                        <path d="M9.5 12.5 11 14l3.5-4" />
                    </svg>
                </div>

                <div className="location-privacy-content">
                    <div className="location-privacy-title">
                        Your location privacy
                    </div>

                    <p>
                        Location is recorded only when you check in or check out.
                        Continuous location tracking is never performed.
                    </p>

                    <span className="location-privacy-note">
                        Only you and your organization&apos;s administrators can
                        view these records.
                    </span>
                </div>
            </section>

            {/* =====================================================
                MAIN CONTENT
               ===================================================== */}
            <section className="card location-history-card">
                <div className="location-history-card-header">
                    <div>
                        <h2>Location events</h2>

                        <p>
                            A record of locations captured during attendance
                            activity.
                        </p>
                    </div>
                </div>

                {/* =================================================
                    LOADING
                   ================================================= */}
                {q.isLoading && (
                    <div className="location-history-loading">
                        <div className="location-history-spinner" />

                        <div>
                            <div className="location-history-loading-title">
                                Loading location history
                            </div>

                            <div className="location-history-loading-text">
                                Retrieving your attendance location records…
                            </div>
                        </div>
                    </div>
                )}

                {/* =================================================
                    ERROR
                   ================================================= */}
                {q.isError && (
                    <div className="location-history-error">
                        <div className="location-history-error-icon">
                            !
                        </div>

                        <div>
                            <div className="location-history-error-title">
                                Unable to load location history
                            </div>

                            <div className="location-history-error-text">
                                Something went wrong while retrieving your
                                location records. Please try again.
                            </div>
                        </div>

                        <button
                            type="button"
                            className="btn btn-secondary location-history-retry"
                            onClick={() => q.refetch()}
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* =================================================
                    EMPTY STATE
                   ================================================= */}
                {!q.isLoading &&
                    !q.isError &&
                    events.length === 0 && (
                        <div className="location-history-empty">
                            <div className="location-history-empty-icon">
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                                    <circle cx="12" cy="10" r="2.5" />
                                </svg>
                            </div>

                            <h3>No location events yet</h3>

                            <p>
                                Location records will appear here after you
                                check in or check out with location permission
                                enabled.
                            </p>
                        </div>
                    )}

                {/* =================================================
                    TABLE
                   ================================================= */}
                {!q.isLoading &&
                    !q.isError &&
                    events.length > 0 && (
                        <>
                            <div className="location-history-table-wrap">
                                <table className="table location-history-table">
                                    <thead>
                                        <tr>
                                            <th>When</th>
                                            <th>Type</th>
                                            <th>Place</th>
                                            <th>Distance</th>
                                            <th>Coordinates</th>
                                            <th>Accuracy</th>
                                            <th>Permission</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {events.map((e) => (
                                            <tr key={e.id}>
                                                {/* WHEN */}
                                                <td>
                                                    <div className="location-date">
                                                        {fmt(e.occurred_at)}
                                                    </div>
                                                </td>

                                                {/* TYPE */}
                                                <td>
                                                    <span
                                                        className={getEventClass(
                                                            e.event_type,
                                                        )}
                                                    >
                                                        <span className="location-event-dot" />

                                                        {formatEventType(
                                                            e.event_type,
                                                        )}
                                                    </span>
                                                </td>

                                                {/* PLACE */}
                                                <td>
                                                    <span
                                                        className={getPlaceClass(
                                                            e.inside_site,
                                                        )}
                                                    >
                                                        {getPlaceLabel(
                                                            e.inside_site,
                                                            e.place_label,
                                                        )}
                                                    </span>
                                                </td>

                                                {/* DISTANCE */}
                                                <td>
                                                    {e.distance_to_site_m !=
                                                        null ? (
                                                        <span className="location-distance">
                                                            {formatDistance(
                                                                e.distance_to_site_m,
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span className="location-missing">
                                                            —
                                                        </span>
                                                    )}
                                                </td>

                                                {/* COORDINATES */}
                                                <td>
                                                    {e.latitude != null &&
                                                        e.longitude != null ? (
                                                        <div className="location-coordinates">
                                                            <span>
                                                                {Number(
                                                                    e.latitude,
                                                                ).toFixed(6)}
                                                            </span>

                                                            <span className="location-coordinate-separator">
                                                                ,
                                                            </span>

                                                            <span>
                                                                {Number(
                                                                    e.longitude,
                                                                ).toFixed(6)}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="location-missing">
                                                            —
                                                        </span>
                                                    )}
                                                </td>

                                                {/* ACCURACY */}
                                                <td>
                                                    {e.accuracy_m != null ? (
                                                        <span className="location-accuracy">
                                                            ±
                                                            {Number(
                                                                e.accuracy_m,
                                                            ).toFixed(0)}{' '}
                                                            m
                                                        </span>
                                                    ) : (
                                                        <span className="location-missing">
                                                            —
                                                        </span>
                                                    )}
                                                </td>

                                                {/* PERMISSION */}
                                                <td>
                                                    <span
                                                        className={
                                                            e.geo_permission ===
                                                                'granted'
                                                                ? 'permission-badge permission-granted'
                                                                : 'permission-badge permission-other'
                                                        }
                                                    >
                                                        <span className="permission-dot" />

                                                        {formatPermission(
                                                            e.geo_permission,
                                                        )}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* =================================================
                                FOOTER
                               ================================================= */}
                            <div className="location-history-footer">
                                <span>
                                    Showing{' '}
                                    <strong>{events.length}</strong>{' '}
                                    {events.length === 1
                                        ? 'event'
                                        : 'events'}
                                </span>

                                <span className="location-history-footer-note">
                                    Location is captured only during attendance
                                    actions.
                                </span>
                            </div>
                        </>
                    )}
            </section>
        </div>
    );
}