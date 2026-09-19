import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';
import { authApi } from '@/features/auth/api';
import { NotificationCenter } from '@/features/notifications/NotificationCenter';

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

import { recordLogoutEvent } from '@/features/attendance/attendanceStore';

export function AppShell() {
    const { user, setUser } = useAuth();
    const nav = useNavigate();

    const visible = NAV.filter(
        (item) =>
            !item.anyRole ||
            item.anyRole.some((role) => user?.roles.includes(role)),
    );

    async function onLogout() {
        recordLogoutEvent();
        try {
            await authApi.logout();
        } catch {
            // ignore
        }
        setUser(null);
        nav('/login', { replace: true });
    }

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="sidebar-brand" style={{ fontWeight: 700, fontSize: '1rem', color: '#60a5fa' }}>
                    ⚡ EZMedTech AI
                </div>

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

            <main className="content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', padding: 0 }}>
                <header
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 28px',
                        borderBottom: '1px solid var(--border)',
                        background: 'rgba(15, 23, 42, 0.5)',
                        position: 'sticky',
                        top: 0,
                        zIndex: 100,
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                            🏢 <strong>EZMedTech Headquarters</strong> (Bellandur)
                        </span>
                        <span
                            style={{
                                fontSize: '0.75rem',
                                padding: '2px 8px',
                                borderRadius: 12,
                                background: 'rgba(16, 185, 129, 0.2)',
                                color: '#10b981',
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                            }}
                        >
                            ✓ On-Site Verified
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <span className="muted small">
                            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <NotificationCenter align="right" />
                    </div>
                </header>

                <div style={{ flex: 1, padding: '24px 28px' }}>
                    <Outlet />
                </div>
            </main>
        </div>
    );
}