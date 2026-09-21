import Header from "../components/common/Header";
import EmptyState from "../components/common/EmptyState";

function TasksPage() {
  return <div className="mx-auto max-w-7xl p-5 md:p-8"><Header title="Tasks" subtitle="GitHub-synced work will appear here" /><EmptyState title="Task API not enabled" description="The backend currently has no task or GitHub synchronization endpoints. This view will populate when that contract is available." /></div>;
}

export default TasksPage;
