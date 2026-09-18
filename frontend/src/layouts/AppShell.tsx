import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';
import { authApi } from '@/features/auth/api';

const NAV: { to: string; label: string; anyRole?: string[] }[] = [
    { to: '/today', label: 'Today' },
    { to: '/timesheet', label: 'My Timesheet' },
    { to: '/tasks', label: 'Tasks' },
    { to: '/team', label: 'Team', anyRole: ['manager', 'admin'] },
    { to: '/approvals', label: 'Approvals', anyRole: ['manager', 'admin'] },
    { to: '/reports', label: 'Reports' },
    { to: '/location-history', label: 'My location history' },
    { to: '/admin', label: 'Admin', anyRole: ['admin'] },
];

export function AppShell() {
    const { user, setUser } = useAuth();
    const nav = useNavigate();

    const visible = NAV.filter(
        (item) =>
            !item.anyRole ||
            item.anyRole.some((role) => user?.roles.includes(role)),
    );

    async function onLogout() {
        await authApi.logout();
        setUser(null);
        nav('/login', { replace: true });
    }

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="sidebar-brand">Timesheet</div>

                <nav className="sidebar-nav">
                    {visible.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                'nav-link' + (isActive ? ' active' : '')
                            }
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-chip">
                        <div className="avatar">
                            {user?.full_name?.[0] ?? '?'}
                        </div>

                        <div className="user-meta">
                            <div className="user-name">
                                {user?.full_name}
                            </div>

                            <div className="user-roles">
                                {user?.roles.join(', ')}
                            </div>
                        </div>
                    </div>

                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={onLogout}
                    >
                        Sign out
                    </button>
                </div>
            </aside>

            <main className="content">
                <Outlet />
            </main>
        </div>
    );
}