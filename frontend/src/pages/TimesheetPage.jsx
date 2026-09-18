import Header from "../components/common/Header";
import EmptyState from "../components/common/EmptyState";

function TimesheetPage() {
  return <div className="mx-auto max-w-7xl p-5 md:p-8"><Header title="My Timesheet" subtitle="Weekly time entries and submissions" /><EmptyState title="Timesheet API not enabled" description="The backend currently exposes attendance sessions only. Weekly time-entry and submission endpoints are still needed for this view." /></div>;
}

export default TimesheetPage;
