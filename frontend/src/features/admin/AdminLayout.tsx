
import { NavLink, Outlet } from 'react-router-dom';
import { Icon, type IconName } from '@/components/ui/Icon';

const TABS: {
    to: string;
    label: string;
    icon: IconName;
}[] = [
        { to: 'organization', label: 'Organization', icon: 'settings' },
        { to: 'users', label: 'Users & roles', icon: 'users' },
        { to: 'teams', label: 'Teams', icon: 'users' },
        { to: 'projects', label: 'Projects', icon: 'file-text' },
        { to: 'tasks', label: 'Tasks', icon: 'inbox' },
        { to: 'github', label: 'GitHub', icon: 'github' },
        { to: 'sync-logs', label: 'Sync log', icon: 'refresh' },
        { to: 'sso', label: 'SSO / IMS', icon: 'shield' },
        { to: 'work-sites', label: 'Work sites', icon: 'map-pin' },
        { to: 'policies', label: 'Policies', icon: 'file-text' },
        { to: 'audit', label: 'Audit log', icon: 'eye' },
    ];

export function AdminLayout() {
    return (
        <div className="admin-root">
            <header className="admin-root-header">
                <div className="admin-heading">
                    <div className="admin-heading-icon">
                        <Icon name="settings" size={21} />
                    </div>

                    <div className="admin-heading-copy">
                        <div className="admin-eyebrow">
                            WORKSPACE SETTINGS
                        </div>
                        <h1>Administration</h1>
                        <p>
                            Manage your organization, access, integrations,
                            and workspace policies.
                        </p>
                    </div>
                </div>
            </header>

            <nav
                className="admin-navigation"
                aria-label="Admin sections"
            >
                <div className="admin-navigation-inner">
                    {TABS.map((tab) => (
                        <NavLink
                            key={tab.to}
                            to={tab.to}
                            className={({ isActive }) =>
                                `admin-navigation-tab${isActive ? ' active' : ''}`
                            }
                        >
                            <Icon name={tab.icon} size={16} />
                            <span>{tab.label}</span>
                        </NavLink>
                    ))}
                </div>
            </nav>

            <main className="admin-root-content">
                <Outlet />
            </main>
        </div>
    );
}