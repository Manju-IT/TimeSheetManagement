import {
    createContext,
    useCallback,
    useMemo,
    type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from './api';
import type { Me } from './types';

interface AuthContextValue {
    user: Me | null;
    loading: boolean;
    refresh: () => Promise<void>;
    setUser: (u: Me | null) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
    undefined,
);

export function AuthProvider({ children }: { children: ReactNode }) {
    const qc = useQueryClient();

    const meQuery = useQuery<Me | null>({
        queryKey: ['auth', 'me'],
        queryFn: async () => {
            try {
                return await authApi.me();
            } catch (e) {
                const status = (e as { status?: number }).status;

                if (status === 401) {
                    return null;
                }

                throw e;
            }
        },
        retry: false,
        staleTime: 30_000,
    });

    const setUser = useCallback(
        (user: Me | null) => {
            qc.setQueryData(['auth', 'me'], user);
        },
        [qc],
    );

    const refresh = useCallback(async () => {
        await qc.invalidateQueries({
            queryKey: ['auth', 'me'],
        });
    }, [qc]);

    const value = useMemo<AuthContextValue>(
        () => ({
            user: meQuery.data ?? null,
            loading: meQuery.isLoading,
            refresh,
            setUser,
        }),
        [
            meQuery.data,
            meQuery.isLoading,
            refresh,
            setUser,
        ],
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
