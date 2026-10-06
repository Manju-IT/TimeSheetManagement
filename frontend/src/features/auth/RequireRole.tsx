import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { PermissionDenied } from '@/components/ui/ErrorState';
import { SkeletonTable } from '@/components/ui/Skeleton';

export function RequireRole({ roles }: { roles: string[] }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <div className="page"><SkeletonTable rows={4} cols={3} /></div>;
    }
    if (!user) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    const allowed = roles.some((r) => user.roles.includes(r));
    if (!allowed) return <PermissionDenied />;
    return <Outlet />;
}