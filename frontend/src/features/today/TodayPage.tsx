import { CheckInCard } from '@/features/attendance/CheckInCard';
import { useAuth } from '@/features/auth/useAuth';
import { Link } from 'react-router-dom';

export function TodayPage() {
    const { user } = useAuth();
    return (
        <div className="page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1>Today</h1>
                    <span className="muted">{new Date().toDateString()}</span>
                </div>
                <Link to="/timesheet" className="btn btn-primary">
                    📅 Open Weekly Timesheet & Calendar
                </Link>
            </header>

            <CheckInCard />

            <div className="card" style={{ marginTop: 20 }}>
                <h3 style={{ marginBottom: 8 }}>Welcome, {user?.full_name ?? 'User'} 👋</h3>
                <p className="muted" style={{ marginBottom: 16 }}>
                    Track your daily attendance above, or jump straight to your weekly timesheet, task board, and reports:
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <Link to="/timesheet" className="btn btn-secondary">
                        📅 Weekly Timesheet (Calendar & Table)
                    </Link>
                    <Link to="/tasks" className="btn btn-secondary">
                        📋 Interactive Task Board
                    </Link>
                    <Link to="/reports" className="btn btn-secondary">
                        📊 KPI & Summary Reports
                    </Link>
                    <Link to="/approvals" className="btn btn-secondary">
                        ✅ Manager Approvals
                    </Link>
                </div>
            </div>
        </div>
    );
}