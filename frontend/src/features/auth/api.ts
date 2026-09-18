import { apiClient } from '@/lib/apiClient';
import type { AuthConfig, Me, StartLogin } from './types';

export const authApi = {
    config: () => apiClient.get<AuthConfig>('/api/v1/auth/config'),
    me: () => apiClient.get<Me>('/api/v1/auth/me'),
    startLogin: (returnTo?: string) =>
        apiClient.post<StartLogin>(
            `/api/v1/auth/login${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`,
        ),
    devLogin: (email: string) => apiClient.post<Me>('/api/v1/auth/dev-login', { email }),
    logout: () => apiClient.post<{ ok: boolean; ims_end_session_url: string | null }>('/api/v1/auth/logout'),
};