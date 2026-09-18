import Header from "../components/common/Header";
import EmptyState from "../components/common/EmptyState";

function ReportsPage() {
  return <div className="mx-auto max-w-7xl p-5 md:p-8"><Header title="Reports" subtitle="Team reporting and exports" /><EmptyState title="Reports API not enabled" description="The backend currently exposes attendance sessions but no reporting or export endpoint." /></div>;
}

export default ReportsPage;
