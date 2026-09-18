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

export function AuthProvider({ children }: { children: ReactNode }) {
    const qc = useQueryClient();
    const [user, setUser] = useState<Me | null>(null);

    const meQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: async () => {
            try {
                return await authApi.me();
            } catch (e) {
                const status = (e as { status?: number }).status;
                if (status === 401) return null;
                throw e;
            }
        },
    });

    useEffect(() => {
        setUser(meQuery.data ?? null);
    }, [meQuery.data]);

    const refresh = useCallback(async () => {
        await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    }, [qc]);

    const value = useMemo<AuthContextValue>(
        () => ({ user, loading: meQuery.isLoading, refresh, setUser }),
        [user, meQuery.isLoading, refresh],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}