import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from './api';
import type { Me } from './types';

interface AuthContextValue {
    user: Me | null;
    loading: boolean;
    refresh: () => Promise<void>;
    setUser: (u: Me | null) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEMO_USER: Me = {
    id: 'demo-admin-id',
    email: 'yasaswini@ezmedtech.ai',
    full_name: 'Yasaswini',
    timezone: 'Asia/Kolkata',
    org_id: 'org-1',
    github_login: '214G1A05C2',
    roles: ['admin', 'manager', 'member'],
    permissions: ['*'],
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const qc = useQueryClient();
    const [user, setUserState] = useState<Me | null>(() => {
        try {
            const saved = localStorage.getItem('timesheet_user');
            return saved ? JSON.parse(saved) : DEMO_USER;
        } catch {
            return DEMO_USER;
        }
    });

    const setUser = useCallback((u: Me | null) => {
        setUserState(u);
        if (u) {
            localStorage.setItem('timesheet_user', JSON.stringify(u));
        } else {
            localStorage.removeItem('timesheet_user');
        }
    }, []);

    const meQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: async () => {
            try {
                return await authApi.me();
            } catch {
                return null;
            }
        },
        retry: false,
    });

    useEffect(() => {
        if (meQuery.data) {
            setUser(meQuery.data);
        }
    }, [meQuery.data, setUser]);

    const refresh = useCallback(async () => {
        await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    }, [qc]);

    const value = useMemo<AuthContextValue>(
        () => ({ user, loading: false, refresh, setUser }),
        [user, refresh, setUser],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}