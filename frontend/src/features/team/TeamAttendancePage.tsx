import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { teamApi } from './api';
import { AttendanceTimeline } from './AttendanceTimeline';
import { PageHeader } from '@/layouts/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, THead, TBody, TH, TD } from '@/components/ui/Table';
import { Select, Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ErrorState, PermissionDenied } from '@/components/ui/ErrorState';
import { classifyError } from '@/lib/errors';

function isoToday(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(seconds: number | null): string {
    if (!seconds || seconds <= 0) return '0h 00m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

const FLAG_TONE: Record<string, 'warning' | 'danger' | 'info'> = {
    location_denied: 'warning',
    location_unavailable: 'info',
    outside_geofence: 'warning',
    no_logout: 'warning',
    open_session: 'info',
    no_activity: 'info',
    missing_attendance: 'warning',
    variance_exceeds_threshold: 'warning',
};
const FLAG_LABEL: Record<string, string> = {
    location_denied: 'Location denied',
    location_unavailable: 'Location unavailable',
    outside_geofence: 'Outside geofence',
    no_logout: 'No logout',
    open_session: 'Open session',
    no_activity: 'No activity',
    missing_attendance: 'No attendance',
    variance_exceeds_threshold: 'Variance',
};

export function TeamAttendancePage() {
    const teams = useQuery({ queryKey: ['team', 'mine'], queryFn: teamApi.myTeams });
    const [teamId, setTeamId] = useState('');
    const [date, setDate] = useState(isoToday());
    const [expanded, setExpanded] = useState<string | null>(null);

    const effectiveTeam = teamId || teams.data?.[0]?.id || '';
    const attendance = useQuery({
        queryKey: ['team', 'attendance', effectiveTeam, date],
        queryFn: () => teamApi.attendance(effectiveTeam, date),
        enabled: !!effectiveTeam,
        refetchInterval: 60_000,
    });

    if (teams.isLoading) {
        return <div className="page"><PageHeader title="Team attendance" /><Card><SkeletonTable rows={5} cols={8} /></Card></div>;
    }
    if (teams.isError) {
        const c = classifyError(teams.error);
        if (c.kind === 'forbidden') return <div className="page"><PermissionDenied message="You do not have access to team attendance." /></div>;
        return <div className="page"><ErrorState onRetry={() => teams.refetch()} /></div>;
    }
    if ((teams.data ?? []).length === 0) {
        return (
            <div className="page">
                <PageHeader title="Team attendance" />
                <Card><EmptyState icon="users" title="No teams assigned" description="You are not a manager of any team yet." /></Card>
            </div>
        );
    }

    return (
        <div className="page">
            <PageHeader
                title="Team attendance"
                subtitle={attendance.data?.team_name}
                actions={
                    <div className="row">
                        <Select value={effectiveTeam} onChange={(e) => setTeamId(e.target.value)} aria-label="Team">
                            {teams.data!.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </Select>
                        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
                    </div>
                }
            />

            <Card padded={false}>
                {attendance.isLoading && <div style={{ padding: 16 }}><SkeletonTable rows={5} cols={8} /></div>}
                {attendance.isError && (
                    <div style={{ padding: 16 }}>
                        <ErrorState message={classifyError(attendance.error).message} onRetry={() => attendance.refetch()} />
                    </div>
                )}
                {attendance.data && attendance.data.rows.length === 0 && (
                    <EmptyState icon="users" title="No members on this team" />
                )}
                {attendance.data && attendance.data.rows.length > 0 && (
                    <Table className="team-attendance">
                        <THead>
                            <tr>
                                <TH style={{ width: 30 }} />
                                <TH>Member</TH>
                                <TH style={{ width: 100 }}>First login</TH>
                                <TH style={{ width: 160 }}>Location</TH>
                                <TH style={{ width: 100 }}>Last logout</TH>
                                <TH style={{ width: 90 }}>Session</TH>
                                <TH style={{ width: 90 }}>Logged</TH>
                                <TH style={{ width: 60 }}>Entries</TH>
                                <TH style={{ width: 90 }}>Status</TH>
                                <TH>Flags</TH>
                            </tr>
                        </THead>
                        <TBody>
                            {attendance.data.rows.map((r) => {
                                const isOpen = expanded === r.user_id;
                                const locationLabel =
                                    r.first_login_event?.place_label ??
                                    (r.first_login_event?.inside_site === true ? 'On site'
                                        : r.first_login_event?.inside_site === false ? 'Off site' : '—');
                                return (
                                    <React.Fragment key={r.user_id}>
                                        <tr className={isOpen ? 'row-open' : ''} onClick={() => setExpanded(isOpen ? null : r.user_id)}>
                                            <TD className="expand-cell">
                                                <Icon
                                                    name="chevron-right"
                                                    size={12}
                                                    style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}
                                                />
                                            </TD>
                                            <TD>
                                                <div>{r.full_name}</div>
                                                <div className="muted small">{r.email}</div>
                                            </TD>
                                            <TD className="num">{fmtTime(r.first_login_at)}</TD>
                                            <TD>
                                                {locationLabel}
                                                {r.first_login_event?.accuracy_m != null && (
                                                    <span className="muted small num"> ±{Math.round(r.first_login_event.accuracy_m)}m</span>
                                                )}
                                            </TD>
                                            <TD className="num">{fmtTime(r.last_logout_at)}</TD>
                                            <TD className="num">{fmtDuration(r.total_session_seconds)}</TD>
                                            <TD className="num">{fmtDuration(r.logged_seconds)}</TD>
                                            <TD className="num">{r.entry_count}</TD>
                                            <TD>
                                                {r.attendance_status ? (
                                                    <Badge
                                                        tone={
                                                            r.attendance_status === 'approved' ? 'success'
                                                                : r.attendance_status === 'rejected' ? 'danger'
                                                                    : r.attendance_status === 'submitted' ? 'info'
                                                                        : r.attendance_status === 'open' ? 'warning'
                                                                            : 'neutral'
                                                        }
                                                        size="sm"
                                                    >
                                                        {r.attendance_status}
                                                    </Badge>
                                                ) : <span className="muted">—</span>}
                                            </TD>
                                            <TD>
                                                {r.flags.length === 0 ? <span className="muted small">—</span> : (
                                                    <div className="flag-list">
                                                        {r.flags.map((f) => (
                                                            <Badge key={f} tone={FLAG_TONE[f] ?? 'info'} size="sm">
                                                                {FLAG_LABEL[f] ?? f.replace(/_/g, ' ')}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </TD>
                                        </tr>
                                        {isOpen && (
                                            <tr>
                                                <td colSpan={10} className="timeline-cell">
                                                    <AttendanceTimeline teamId={effectiveTeam} row={r} />
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </TBody>
                    </Table>
                )}
            </Card>
        </div>
    );
}

import React from 'react';