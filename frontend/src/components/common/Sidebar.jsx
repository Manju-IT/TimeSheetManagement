import { NavLink, useNavigate } from "react-router-dom";

import {
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  Clock3,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const memberLinks = [
    {
      name: "Today",
      path: "/today",
      icon: LayoutDashboard,
    },
    {
      name: "My Timesheet",
      path: "/timesheet",
      icon: CalendarDays,
    },
    {
      name: "Tasks",
      path: "/tasks",
      icon: CheckSquare,
    },
    {
      name: "Reports",
      path: "/reports",
      icon: Clock3,
    },
  ];

  const managerLinks = [
    {
      name: "Team",
      path: "/team",
      icon: Users,
    },
    {
      name: "Approvals",
      path: "/approvals",
      icon: ClipboardCheck,
    },
  ];

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="border-b border-slate-200 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            T
          </div>

          <div>
            <h1 className="font-bold text-slate-900">
              Team Timesheet
            </h1>

            <p className="text-xs text-slate-500">
              Work management
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Workspace
        </p>

        {memberLinks.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              <Icon size={18} />

              {item.name}
            </NavLink>
          );
        })}

        {(user?.roles?.includes("manager") ||
          user?.roles?.includes("admin")) && (
          <>
            <p className="mb-2 mt-7 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Management
            </p>

            {managerLinks.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-100"
                    }`
                  }
                >
                  <Icon size={18} />
                  {item.name}
                </NavLink>
              );
            })}
          </>
        )}

        {user?.roles?.includes("admin") && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`
            }
          >
            <Settings size={18} />
            Admin
          </NavLink>
        )}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
            {user?.full_name?.charAt(0) || "U"}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {user?.full_name}
            </p>

            <p className="capitalize text-xs text-slate-500">
              {user?.roles?.join(", ")}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-red-50 hover:text-red-600"
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;