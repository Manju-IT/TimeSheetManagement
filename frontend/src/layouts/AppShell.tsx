import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';
import { useHasRole } from '@/features/auth/useAuth';
import { authApi } from '@/features/auth/api';
import { Icon, type IconName } from '@/components/ui/Icon';
import { OfflineBanner } from '@/components/system/OfflineBanner';
import { useState } from 'react';
import { useOfflineQueue } from '@/features/time-entries/useOfflineQueue';
import { EmbeddedHeader } from './EmbeddedHeader';
import { useEmbedded } from '@/lib/EmbeddedProvider';
import { bestEffortCheckout } from '@/features/attendance/logoutCheckout';

interface NavItem {
    to: string;
    label: string;
    icon: IconName;
    anyRole?: string[];
}

const NAV: NavItem[] = [
    { to: '/today', label: 'Today', icon: 'clock' },
    { to: '/timesheet', label: 'My Timesheet', icon: 'calendar' },
    { to: '/tasks', label: 'Tasks', icon: 'file-text' },
    { to: '/team', label: 'Team', icon: 'users', anyRole: ['manager', 'admin'] },
    { to: '/approvals', label: 'Approvals', icon: 'check-circle', anyRole: ['manager', 'admin'] },
    { to: '/reports', label: 'Reports', icon: 'bar-chart' },
    { to: '/location-history', label: 'My location history', icon: 'map-pin' },
];

export function AppShell() {
    useOfflineQueue();

    const { user, setUser } = useAuth();
    const isAdmin = useHasRole('admin');
    const navigate = useNavigate();
    const { embedded } = useEmbedded();
    const [signingOut, setSigningOut] = useState(false);


    // inside AppShell:
    async function onLogout() {
        setSigningOut(true);
        try {
            await bestEffortCheckout();
            await authApi.logout();
            setUser(null);
            navigate('/login', { replace: true });
        } finally {
            setSigningOut(false);
        }
    }

    const visible = NAV.filter((item) => !item.anyRole || item.anyRole.some((r) => user?.roles.includes(r)));
    if (embedded) {
        return (
            <div className="shell shell-embedded">
                <EmbeddedHeader />
                <main className="shell-main">
                    <OfflineBanner />
                    <Outlet />
                </main>
            </div>
        );
    }


    return (
        <div className={`shell ${embedded ? 'shell-embedded' : ''}`}>
            {!embedded && (
                <aside className="shell-side">
                    <div className="shell-brand">
                        <div className="brand-mark">TS</div>
                        <div className="brand-name">Timesheet</div>
                    </div>

                    <nav className="shell-nav" aria-label="Main">
                        {visible.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            >
                                <Icon name={item.icon} size={14} />
                                <span>{item.label}</span>
                            </NavLink>
                        ))}

                        {isAdmin && (
                            <>
                                <div className="nav-divider" />
                                <NavLink
                                    to="/admin"
                                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                >
                                    <Icon name="shield" size={14} />
                                    <span>Admin</span>
                                </NavLink>
                            </>
                        )}
                    </nav>

                    <div className="shell-foot">
                        <div className="user-chip">
                            <div className="avatar" aria-hidden>{user?.full_name?.[0] ?? '?'}</div>
                            <div className="user-chip-body">
                                <div className="user-chip-name">{user?.full_name}</div>
                                <div className="user-chip-roles">{user?.roles.join(' · ')}</div>
                            </div>
                        </div>
                        <button
                            className="nav-item sign-out"
                            onClick={onLogout}
                            disabled={signingOut}
                        >
                            <Icon name="logout" size={14} />
                            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
                        </button>
                    </div>
                </aside>
            )}

            <main className="shell-main">
                <OfflineBanner />
                <Outlet />
            </main>
        </div>
    );
}