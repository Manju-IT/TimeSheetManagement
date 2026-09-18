import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import AppLayout from "./layouts/AppLayout.jsx";
import { useAuth } from "./context/AuthContext";

import LoginPage from "./pages/LoginPage";
import TodayPage from "./pages/TodayPage";
import TimesheetPage from "./pages/TimesheetPage";
import TasksPage from "./pages/TasksPage";
import TeamPage from "./pages/TeamPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import ReportsPage from "./pages/ReportsPage";
import AdminPage from "./pages/AdminPage";
import NotFoundPage from "./pages/NotFoundPage";

function App() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading workspace...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/today" replace /> : <LoginPage />} />

        <Route element={user ? <AppLayout /> : <Navigate to="/login" replace />}>
          <Route
            path="/"
            element={<Navigate to="/today" replace />}
          />

          <Route path="/today" element={<TodayPage />} />

          <Route
            path="/timesheet"
            element={<TimesheetPage />}
          />

          <Route path="/tasks" element={<TasksPage />} />

          <Route path="/reports" element={<ReportsPage />} />

          <Route path="/team" element={<TeamPage />} />

          <Route
            path="/approvals"
            element={<ApprovalsPage />}
          />

          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;