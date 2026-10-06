import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppShell } from '@/layouts/AppShell';
import { TodayPage } from '@/features/today/TodayPage';
import { TimesheetPage } from '@/features/timesheet/TimesheetPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { TeamPage } from '@/features/team/TeamPage';
import { ApprovalsPage } from '@/features/approvals/ApprovalsPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { AdminLandingPage } from '@/features/admin/AdminLandingPage';
import { LocationHistoryPage } from '@/features/attendance/LocationHistoryPage';
import { RequireRole } from '@/features/auth/RequireRole';
import { NotFound } from '@/components/ui/ErrorState';

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
                    <Route element={<RequireRole roles={['manager', 'admin']} />}>
                        <Route path="/team" element={<TeamPage />} />
                        <Route path="/approvals" element={<ApprovalsPage />} />
                    </Route>
                    <Route element={<RequireRole roles={['admin']} />}>
                        <Route path="/admin/*" element={<AdminLandingPage />} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                </Route>
            </Route>
        </Routes>
    );
}