import { Outlet } from "react-router-dom";
import Sidebar from "../components/common/Sidebar";

function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="min-h-screen md:ml-64">
        <Outlet />
      </main>
    </div>
  );
}
export default AppLayout;