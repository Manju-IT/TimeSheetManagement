import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authApi } from './api';
import { useAuth } from './useAuth';

export function LoginPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { setUser } = useAuth();
    const configQuery = useQuery({ queryKey: ['auth', 'config'], queryFn: authApi.config });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(params.get('error'));

    async function startSso() {
        setError(null);
        setBusy(true);
        try {
            const { authorize_url } = await authApi.startLogin(window.location.origin + '/');
            window.location.href = authorize_url;
        } catch (e) {
            setError((e as Error).message);
            setBusy(false);
        }
    }

    return (
        <div className="auth-shell">
            <div className="auth-card">
                <div className="auth-brand">
                    <div className="auth-logo">TS</div>
                    <div>
                        <h1>{configQuery.data?.app_name ?? 'Team Timesheet'}</h1>
                        <p className="muted">Sign in to continue</p>
                    </div>
                </div>

                {error && <div className="alert alert-error">{error}</div>}

                {configQuery.data?.oidc_enabled ? (
                    <button className="btn btn-primary btn-block" onClick={startSso} disabled={busy}>
                        Continue with IMS
                    </button>
                ) : (
                    <div className="alert alert-info">
                        IMS SSO is disabled. Configure OIDC env vars to enable it.
                    </div>
                )}

                <div style={{ marginTop: 16 }}>
                    <button
                        className="btn btn-primary btn-block"
                        onClick={() => {
                            setUser({
                                id: 'demo-admin-id',
                                email: 'yasaswini@ezmedtech.ai',
                                full_name: 'Yasaswini',
                                timezone: 'Asia/Kolkata',
                                org_id: 'org-1',
                                github_login: '214G1A05C2',
                                roles: ['admin', 'manager', 'member'],
                                permissions: ['*'],
                            });
                            navigate('/timesheet');
                        }}
                    >
                        🚀 Enter Application Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}