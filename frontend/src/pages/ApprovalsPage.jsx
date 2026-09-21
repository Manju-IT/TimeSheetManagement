import Header from "../components/common/Header";
import EmptyState from "../components/common/EmptyState";

function ApprovalsPage() {
  return <div className="mx-auto max-w-7xl p-5 md:p-8"><Header title="Approvals" subtitle="Review submitted weekly timesheets" /><EmptyState title="Approval API not enabled" description="The backend currently has no timesheet submission or approval endpoints, so no fabricated approval records are shown." /></div>;
}

export default ApprovalsPage;
