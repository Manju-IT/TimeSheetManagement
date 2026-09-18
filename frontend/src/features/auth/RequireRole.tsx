import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './useAuth';

export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) return <div className="page-loading">Loading…</div>;
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

    const allowed = roles.some((r) => user.roles.includes(r));
    if (!allowed) {
        return (
            <div className="page">
                <header className="page-header">
                    <h1>Not available</h1>
                </header>
                <div className="card">
                    You do not have permission to view this page. If you believe this is a mistake,
                    contact an administrator.
                </div>
            </div>
        );
    }
    return <>{children}</>;
}