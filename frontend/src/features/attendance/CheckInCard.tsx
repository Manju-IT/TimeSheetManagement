import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceApi } from './api';
import { useGeolocation } from './useGeolocation';
import { useToast } from '@/components/ui/Toast';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Icon } from '@/components/ui/Icon';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { classifyError } from '@/lib/errors';
import type { GeoPermission } from './types';

function isSameLocalDay(
    iso: string | null | undefined,
    ref: string
): boolean {
    if (!iso) return false;

    const a = new Date(iso);
    const b = new Date(ref + 'T00:00:00');

    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function fmtDateTime(
    iso: string | null | undefined,
    refDay: string
): string {
    if (!iso) return '—';

    if (isSameLocalDay(iso, refDay)) {
        return new Date(iso).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    // Different day — always show the date so confusion is impossible.
    return new Date(iso).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function fmtWorkDate(iso: string): string {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function fmtDuration(seconds?: number | null) {
    if (!seconds || seconds <= 0) return '0h 00m';

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);

    return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function CheckInCard() {
    const qc = useQueryClient();
    const toast = useToast();
    const geo = useGeolocation();

    const [actionError, setActionError] = useState<string | null>(null);

    const todayQuery = useQuery({
        queryKey: ['attendance', 'today'],
        queryFn: attendanceApi.today,
        refetchInterval: 30_000,
    });

    const today = todayQuery.data;
    const attendance = today?.attendance_day ?? null;
    const active = today?.active_session ?? null;
    const firstEvent = today?.first_login_event ?? null;

    const serverWorkDate = today?.work_date ?? '';
    const stale = today?.stale_session ?? null;

    async function withLocation() {
        const result = await geo.request();

        const geo_permission: GeoPermission = result.permission;

        return {
            latitude: result.fix?.latitude ?? null,
            longitude: result.fix?.longitude ?? null,
            accuracy_m: result.fix?.accuracy_m ?? null,
            geo_permission,
            client_reported_at: new Date().toISOString(),
        };
    }

    const checkIn = useMutation({
        mutationFn: async () =>
            attendanceApi.checkIn(await withLocation()),

        onSuccess: (res) => {
            toast.success(
                res.is_duplicate ? 'Already checked in' : 'Checked in',
                `at ${new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                })}`
            );

            qc.invalidateQueries({
                queryKey: ['attendance'],
            });

            setActionError(null);
        },

        onError: (e) => {
            const c = classifyError(e);

            setActionError(c.message);
            toast.error('Check-in failed', c.message);
        },
    });

    const checkOut = useMutation({
        mutationFn: async () =>
            attendanceApi.checkOut(await withLocation()),

        onSuccess: (res) => {
            toast.success(
                res.is_duplicate
                    ? 'Nothing to check out'
                    : 'Checked out'
            );

            qc.invalidateQueries({
                queryKey: ['attendance'],
            });

            setActionError(null);
        },

        onError: (e) => {
            const c = classifyError(e);

            setActionError(c.message);
            toast.error('Check-out failed', c.message);
        },
    });

    if (todayQuery.isLoading) {
        return <SkeletonCards count={1} />;
    }

    if (todayQuery.isError) {
        const e = classifyError(todayQuery.error);

        return (
            <ErrorState
                title="Failed to load attendance"
                message={e.message}
                onRetry={() => todayQuery.refetch()}
            />
        );
    }

    const busy =
        checkIn.isPending ||
        checkOut.isPending ||
        geo.loading;

    const place =
        firstEvent?.place_label ??
        (
            firstEvent?.inside_site === true
                ? 'On site'
                : firstEvent?.inside_site === false
                    ? 'Off site'
                    : null
        );

    return (
        <Card>
            <CardHeader
                title="Attendance"
                subtitle={
                    serverWorkDate
                        ? fmtWorkDate(serverWorkDate)
                        : new Date().toDateString()
                }
                actions={
                    active ? (
                        <Button
                            variant="secondary"
                            size="sm"
                            iconLeft="logout"
                            onClick={() => checkOut.mutate()}
                            loading={busy}
                            disabled={busy}
                        >
                            Check out
                        </Button>
                    ) : attendance?.last_logout_at ? (
                        <Badge tone="success" icon="check">
                            Attendance completed
                        </Badge>
                    ) : (
                        <Button
                            variant="primary"
                            size="sm"
                            iconLeft="clock"
                            onClick={() => checkIn.mutate()}
                            loading={busy}
                            disabled={busy}
                        >
                            Check in
                        </Button>
                    )
                }
            />

            <div className="stats-grid">
                <Stat
                    label="First login"
                    value={fmtDateTime(
                        attendance?.first_login_at,
                        serverWorkDate
                    )}
                    sub={place ?? undefined}
                />

                <Stat
                    label="Last logout"
                    value={fmtDateTime(
                        attendance?.last_logout_at,
                        serverWorkDate
                    )}
                    sub={active ? 'session active' : undefined}
                />

                <Stat
                    label="Session time"
                    value={fmtDuration(
                        attendance?.total_session_seconds
                    )}
                />

                <Stat
                    label="Logged"
                    value={fmtDuration(
                        attendance?.logged_seconds
                    )}
                />
            </div>

            {stale && (
                <Banner
                    tone="warning"
                    title="You have an open session from a previous day"
                    action={
                        <Button
                            variant="secondary"
                            size="sm"
                            loading={checkOut.isPending}
                            onClick={() => checkOut.mutate()}
                        >
                            Close it now
                        </Button>
                    }
                >
                    Started{' '}
                    {new Date(stale.login_at).toLocaleString()}.
                    {' '}
                    Closing it will record the checkout at the
                    current time and update the corresponding
                    workday.
                </Banner>
            )}

            {firstEvent?.geo_permission === 'denied' && (
                <Banner
                    tone="warning"
                    title="Location permission was denied"
                >
                    You can still work. Your manager sees a{' '}
                    <em>location denied</em> flag on this day.
                </Banner>
            )}

            {firstEvent?.geo_permission === 'unavailable' && (
                <Banner
                    tone="info"
                    title="Location unavailable"
                >
                    The browser could not determine a location.
                    This does not block work.
                </Banner>
            )}

            {firstEvent?.inside_site === false && (
                <Banner
                    tone="info"
                    title="Outside work-site geofence"
                >
                    The event was still recorded.
                </Banner>
            )}

            {actionError && (
                <Banner
                    tone="danger"
                    title="Action failed"
                >
                    {actionError}
                </Banner>
            )}

            {active && (
                <div className="attendance-active">
                    <Badge tone="success" icon="clock">
                        Active since{' '}
                        {fmtDateTime(
                            active.login_at,
                            serverWorkDate
                        )}
                    </Badge>

                    {active.session_seconds != null && (
                        <span className="muted small">
                            ·{' '}
                            {fmtDuration(
                                active.session_seconds
                            )}{' '}
                            elapsed
                        </span>
                    )}
                </div>
            )}
            {!active && attendance?.last_logout_at && (
                <Banner
                    tone="success"
                    title="Attendance completed for today"
                >
                    You checked out at{' '}
                    {fmtDateTime(
                        attendance.last_logout_at,
                        serverWorkDate
                    )}.
                    {' '}You cannot check in again during this workday.
                </Banner>
            )}

            <div className="attendance-privacy">
                <Icon name="info" size={12} />

                <span>
                    Location is captured only at check-in and
                    check-out. See{' '}
                    <a href="/location-history">
                        your history
                    </a>
                    .
                </span>
            </div>
        </Card>
    );
}

function Stat({
    label,
    value,
    sub,
}: {
    label: string;
    value: string;
    sub?: string;
}) {
    return (
        <div className="stat">
            <div className="stat-label">
                {label}
            </div>

            <div className="stat-value num">
                {value}
            </div>

            {sub && (
                <div className="stat-sub">
                    {sub}
                </div>
            )}
        </div>
    );
}