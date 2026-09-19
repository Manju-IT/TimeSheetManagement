import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authApi } from './api';
import { useAuth } from './useAuth';

export function LoginPage() {
    const [params] = useSearchParams();
    const { user, refresh, setUser } = useAuth();
    const configQuery = useQuery({ queryKey: ['auth', 'config'], queryFn: authApi.config });
    const [devEmail, setDevEmail] = useState('member@example.com');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(params.get('error'));

    useEffect(() => {
        if (user) {
            window.location.replace('/');
        }
    }, [user]);

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

    async function devLogin() {
        setError(null);
        setBusy(true);
        try {
            const me = await authApi.devLogin(devEmail);
            setUser(me);
            await refresh();
            window.location.replace('/');
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
                        IMS SSO is disabled.
                    </div>
                )}

                {configQuery.data?.local_dev_auth ? (
                    <div className="dev-block">
                        <div className="dev-divider">Local development</div>
                        <label className="field">
                            <span>Demo email</span>
                            <select value={devEmail} onChange={(e) => setDevEmail(e.target.value)}>
                                <option value="member@example.com">member@example.com</option>
                                <option value="manager@example.com">manager@example.com</option>
                                <option value="admin@example.com">admin@example.com</option>
                            </select>
                        </label>
                        <button className="btn btn-secondary btn-block" onClick={devLogin} disabled={busy}>
                            Continue as {devEmail}
                        </button>
                        <p className="muted small">
                            Development only. Requires <code>LOCAL_DEV_AUTH=true</code>.
                        </p>
                    </div>
                ) : (
                    <div className="dev-block" style={{ marginTop: 16 }}>
                        <div className="dev-divider">Demo UI Preview</div>
                        <p className="muted small" style={{ marginBottom: 12 }}>
                            FastAPI backend is offline. You can preview all UI components using demo roles:
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <button
                                className="btn btn-primary btn-block"
                                onClick={() => {
                                    setUser({
                                        id: 'demo-admin-id',
                                        email: 'admin@ezmedtech.ai',
                                        full_name: 'Admin User',
                                        timezone: 'Asia/Kolkata',
                                        org_id: 'org-1',
                                        github_login: null,
                                        roles: ['admin', 'manager', 'member'],
                                        permissions: ['*'],
                                    });
                                }}
                            >
                                Enter as Admin / Manager
                            </button>
                            <button
                                className="btn btn-secondary btn-block"
                                onClick={() => {
                                    setUser({
                                        id: 'demo-dev-id',
                                        email: 'dev@ezmedtech.ai',
                                        full_name: 'Team Developer',
                                        timezone: 'Asia/Kolkata',
                                        org_id: 'org-1',
                                        github_login: null,
                                        roles: ['member'],
                                        permissions: ['timesheet:write'],
                                    });
                                }}
                            >
                                Enter as Team Developer
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}