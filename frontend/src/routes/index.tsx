import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppShell } from '@/layouts/AppShell';
import { TodayPage } from '@/features/today/TodayPage';
import { RequireRole } from '@/features/auth/RequireRole';
import { AdminLandingPage } from '@/features/admin/AdminLandingPage';
import { TeamPage } from '@/features/team/TeamPage';
import { ApprovalsPage } from '@/features/approvals/ApprovalsPage';
import { LocationHistoryPage } from '@/features/attendance/LocationHistoryPage';

export function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                    <Route path="/" element={<Navigate to="/today" replace />} />
                    <Route path="/today" element={<TodayPage />} />
                    <Route path="/timesheet" element={<Placeholder name="My Timesheet" />} />
                    <Route path="/tasks" element={<Placeholder name="Tasks" />} />
                    <Route path="/reports" element={<Placeholder name="Reports" />} />
                    <Route path="/location-history" element={<LocationHistoryPage />} />
                    <Route
                        path="/team"
                        element={
                            <RequireRole roles={['manager', 'admin']}>
                                <TeamPage />
                            </RequireRole>
                        }
                    />
                    <Route
                        path="/approvals"
                        element={
                            <RequireRole roles={['manager', 'admin']}>
                                <ApprovalsPage />
                            </RequireRole>
                        }
                    />
                    <Route
                        path="/admin/*"
                        element={
                            <RequireRole roles={['admin']}>
                                <AdminLandingPage />
                            </RequireRole>
                        }
                    />
                </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function Placeholder({ name }: { name: string }) {
    return (
        <div className="page">
            <header className="page-header">
                <h1>{name}</h1>
            </header>
            <div className="card">Coming in a later phase.</div>
        </div>
    );
}