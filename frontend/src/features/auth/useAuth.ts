import { useContext } from 'react';
import { AuthContext } from './AuthProvider';

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}

export function useHasRole(...roles: string[]): boolean {
    const { user } = useAuth();
    if (!user) return false;
    return roles.some((r) => user.roles.includes(r));
}

export function useIsAdmin(): boolean {
    return useHasRole('admin');
}

export function useIsManager(): boolean {
    return useHasRole('manager', 'admin');
}