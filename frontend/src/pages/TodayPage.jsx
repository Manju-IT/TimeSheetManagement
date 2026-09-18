import { useEffect, useState } from "react";

import {
  LogOut,
  Plus,
} from "lucide-react";

import Header from "../components/common/Header";
import AttendanceSummary from "../components/attendance/AttendanceSummary";
import EmptyState from "../components/common/EmptyState";
import { attendanceService } from "../services/attendanceService";

function TodayPage() {
  const [attendance, setAttendance] = useState(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    attendanceService.getToday()
      .then(setAttendance)
      .catch((error) => setActionError(error.message));
  }, []);

  function requestPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not available in this browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("Location permission is required.")));
    });
  }

  async function checkIn() {
    try {
      setActionError("");
      const result = await attendanceService.checkIn(await requestPosition());
      setAttendance((current) => ({ ...current, attendance_day: result.attendance_day, active_session: result.work_session, first_login_event: result.login_event }));
    } catch (error) { setActionError(error.message); }
  }

  async function checkout() {
    try {
      setActionError("");
      const result = await attendanceService.checkOut(await requestPosition());
      setAttendance((current) => ({ ...current, attendance_day: result.attendance_day, active_session: null, last_logout_event: result.logout_event }));
    } catch (error) { setActionError(error.message); }
  }

  return (
    <div className="mx-auto max-w-7xl p-5 md:p-8">
      <Header
        title="Today"
        subtitle="Friday, 4 September 2026"
      >
        <button
          onClick={checkIn}
          disabled={Boolean(attendance?.active_session)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={17} />
          Check In
        </button>

        <button
          onClick={checkout}
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          <LogOut size={17} />
          Check Out
        </button>
      </Header>

      <AttendanceSummary data={attendance} />

      {actionError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Today's Entries
            </h2>

            <p className="text-sm text-slate-500">
              Time entries are not available in the current backend API
            </p>
          </div>
        </div>

        <EmptyState
          title="No time entries yet"
          description="The backend currently exposes attendance sessions only. Time-entry persistence can be enabled when its API is added."
        />
      </section>

    </div>
  );
}

export default TodayPage;