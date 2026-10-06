import { CheckInCard } from '@/features/attendance/CheckInCard';
import { TodayEntriesList } from '@/features/time-entries/TodayEntriesList';
import { PageHeader } from '@/layouts/PageHeader';
import { useAuth } from '@/features/auth/useAuth';

export function TodayPage() {
    const { user } = useAuth();
    return (
        <div className="page">
            <PageHeader
                title="Today"
                subtitle={new Date().toLocaleDateString(undefined, {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })}
            />
            <CheckInCard />
            <div style={{ height: 16 }} />
            <TodayEntriesList />
            <p className="page-foot muted small">
                Signed in as {user?.full_name} · {user?.email}
            </p>
        </div>
    );
}