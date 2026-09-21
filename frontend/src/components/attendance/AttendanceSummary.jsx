import {
  Clock3,
  LogIn,
  LogOut,
} from "lucide-react";

import StatCard from "../common/StatCard";

function AttendanceSummary({ data }) {
  const attendanceDay = data?.attendance_day;
  const activeSession = data?.active_session;
  const firstEvent = data?.first_login_event;
  const lastEvent = data?.last_logout_event;
  const loggedMinutes = attendanceDay?.logged_seconds
    ? Math.floor(attendanceDay.logged_seconds / 60)
    : activeSession?.session_seconds
      ? Math.floor(activeSession.session_seconds / 60)
    : 0;
  const formatTime = (value) => value
    ? new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "--";

  const hours = Math.floor(loggedMinutes / 60);

  const minutes = loggedMinutes % 60;

  const percentage = Math.min(
    (loggedMinutes / 480) *
      100,
    100
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="First Login"
          value={formatTime(firstEvent?.occurred_at || attendanceDay?.first_login_at)}
          subtitle={firstEvent ? `Accuracy ±${Math.round(firstEvent.accuracy_m || 0)} m` : "No check-in recorded"}
          icon={LogIn}
        />

        <StatCard
          title="Last Logout"
          value={formatTime(lastEvent?.occurred_at || attendanceDay?.last_logout_at)}
          subtitle={activeSession ? "Active session" : "Session closed"}
          icon={LogOut}
        />

        <StatCard
          title="Logged Today"
          value={`${hours}h ${minutes}m`}
          subtitle="of 8h target"
          icon={Clock3}
        />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-medium text-slate-700">
            Daily progress
          </span>

          <span className="text-slate-500">
            {Math.round(percentage)}%
          </span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{
              width: `${percentage}%`,
            }}
          />
        </div>
      </div>
    </>
  );
}

export default AttendanceSummary;