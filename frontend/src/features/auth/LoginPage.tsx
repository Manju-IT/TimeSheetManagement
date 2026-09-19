import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authApi } from './api';
import { useAuth } from './useAuth';
import { ASSIGNED_OFFICE, recordLoginEvent } from '@/features/attendance/attendanceStore';

export function LoginPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { setUser } = useAuth();
    const configQuery = useQuery({ queryKey: ['auth', 'config'], queryFn: authApi.config });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(params.get('error'));

    const [email, setEmail] = useState('yasaswini@ezmedtech.ai');
    const [fullName, setFullName] = useState('Yasaswini');
    const [emailError, setEmailError] = useState<string | null>(null);

    const isEzMedTechEmail = (e: string) => e.trim().toLowerCase().endsWith('@ezmedtech.ai');

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedEmail = email.trim().toLowerCase();

        if (!trimmedEmail) {
            setEmailError('Please enter your company email address.');
            return;
        }

        if (!isEzMedTechEmail(trimmedEmail)) {
            setEmailError('Access Denied: Only @ezmedtech.ai company email addresses are authorized to log in.');
            return;
        }

        setEmailError(null);

        const name = fullName.trim() || trimmedEmail.split('@')[0].replace(/^\w/, (c) => c.toUpperCase());

        // 1. Record Login Event with Office Address and Timestamp
        recordLoginEvent(trimmedEmail, name);

        // 2. Set authenticated user context
        setUser({
            id: 'user-' + trimmedEmail.replace(/[^a-zA-Z0-9]/g, '_'),
            email: trimmedEmail,
            full_name: name,
            timezone: 'Asia/Kolkata',
            org_id: 'org-ezmedtech',
            github_login: '214G1A05C2',
            roles: ['admin', 'manager', 'member'],
            permissions: ['*'],
        });

        // 3. Navigate to Today / Dashboard
        navigate('/today');
    };

    async function startSso() {
        setError(null);
        setBusy(true);
        try {
            const { authorize_url } = await authApi.startLogin(window.location.origin + '/');
            window.location.href = authorize_url;
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    }

    return (
        <div className="auth-shell">
            <div className="auth-card" style={{ maxWidth: 440, width: '100%' }}>
                <div className="auth-brand">
                    <div className="auth-logo">EZ</div>
                    <div>
                        <h1>EZMedTech AI</h1>
                        <p className="muted">Time Sheet & Attendance Management</p>
                    </div>
                </div>

                {/* Assigned Corporate Office Address Display */}
                <div
                    style={{
                        margin: '16px 0',
                        padding: '12px 14px',
                        background: 'rgba(30, 41, 59, 0.7)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: 8,
                        fontSize: '0.85rem',
                    }}
                >
                    <div style={{ fontWeight: 600, color: '#60a5fa', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>🏢 Assigned Office:</span> {ASSIGNED_OFFICE.name}
                    </div>
                    <div style={{ color: '#94a3b8', lineHeight: 1.4 }}>
                        {ASSIGNED_OFFICE.address}
                    </div>
                    <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#10b981' }}>
                        📍 Geofence Radius: {ASSIGNED_OFFICE.radiusMeters}m · Timezone: {ASSIGNED_OFFICE.timezone}
                    </div>
                </div>

                {error && <div className="alert alert-error">{error}</div>}
                {emailError && (
                    <div className="alert alert-error" style={{ marginBottom: 12 }}>
                        {emailError}
                    </div>
                )}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 500 }}>
                            Corporate Email (@ezmedtech.ai)
                        </label>
                        <input
                            type="email"
                            className="input"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                if (emailError) setEmailError(null);
                            }}
                            placeholder="username@ezmedtech.ai"
                            required
                            style={{
                                width: '100%',
                                borderColor: email && !isEzMedTechEmail(email) ? '#ef4444' : undefined,
                            }}
                        />
                        <div style={{ marginTop: 4, fontSize: '0.75rem' }}>
                            {email && isEzMedTechEmail(email) ? (
                                <span style={{ color: '#10b981', fontWeight: 500 }}>
                                    ✓ Authorized @ezmedtech.ai company account
                                </span>
                            ) : email ? (
                                <span style={{ color: '#ef4444' }}>
                                    ✕ Must be a valid @ezmedtech.ai email address
                                </span>
                            ) : (
                                <span className="muted">Only @ezmedtech.ai users are allowed</span>
                            )}
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 500 }}>
                            Full Name
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. Yasaswini"
                            style={{ width: '100%' }}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-block"
                        disabled={!isEzMedTechEmail(email)}
                        style={{ marginTop: 6 }}
                    >
                        🚀 Sign In & Record Login Time
                    </button>
                </form>

                {configQuery.data?.oidc_enabled && (
                    <div style={{ marginTop: 16 }}>
                        <button className="btn btn-secondary btn-block" onClick={startSso} disabled={busy}>
                            Continue with Corporate SSO
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}