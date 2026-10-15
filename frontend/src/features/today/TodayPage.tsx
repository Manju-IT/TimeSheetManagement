import { CheckInCard } from '@/features/attendance/CheckInCard';
import { TodayEntriesList } from '@/features/time-entries/TodayEntriesList';
import { useAuth } from '@/features/auth/useAuth';
import { PageHeader } from '@/layouts/PageHeader';

export function TodayPage() {
    const { user } = useAuth();

    return (
        <div className="page today-page">
            <PageHeader
                title="Today"
                subtitle={new Date().toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                })}
            />

            <div className="today-overview-intro">
                <div className="today-overview-copy">
                    <span className="today-overview-eyebrow">DAILY OVERVIEW</span>
                    <h2>Your workday at a glance</h2>
                    <p>Manage attendance and keep today's work entries up to date.</p>
                </div>
                <div className="today-overview-date">
                    <span className="today-overview-date-label">SIGNED IN AS</span>
                    <strong>{user?.full_name ?? 'Team member'}</strong>
                    <span>{user?.email ?? ''}</span>
                </div>
            </div>

            <section className="today-attendance-section" aria-label="Attendance">
                <CheckInCard />
            </section>

            <section className="today-entries-section" aria-label="Today's time entries">
                <TodayEntriesList />
            </section>

            <footer className="page-foot today-page-foot muted small">
                Signed in as {user?.full_name} · {user?.email}
            </footer>
        </div>
    );
}
