import { CheckInCard } from '@/features/attendance/CheckInCard';
import { useAuth } from '@/features/auth/useAuth';

export function TodayPage() {
    const { user } = useAuth();
    return (
        <div className="page">
            <header className="page-header">
                <h1>Today</h1>
                <span className="muted">{new Date().toDateString()}</span>
            </header>
            <CheckInCard />
            <div className="card" style={{ marginTop: 16 }}>
                <p className="muted small">
                    Welcome, <strong>{user?.full_name}</strong>. Time entries arrive in Phase 5.
                </p>
            </div>
        </div>
    );
}