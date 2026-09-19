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
import { TimesheetPage } from '@/features/timesheet/TimesheetPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { ReportsPage } from '@/features/reports/ReportsPage';

export function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                    <Route path="/" element={<Navigate to="/today" replace />} />
                    <Route path="/today" element={<TodayPage />} />
                    <Route path="/timesheet" element={<TimesheetPage />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/reports" element={<ReportsPage />} />
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