
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { authApi } from './api';
import { useAuth } from './useAuth';

import { useToast } from '@/components/ui/Toast';
import { Field, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Icon } from '@/components/ui/Icon';
import { useEmbedded } from '@/lib/EmbeddedProvider';

const DEMO_USERS = [
    { email: 'member@example.com', label: 'Milo Member', role: 'Member' },
    { email: 'manager@example.com', label: 'Mira Manager', role: 'Manager' },
    { email: 'admin@example.com', label: 'Ada Admin', role: 'Administrator' },
];

export function LoginPage() {
    const [params] = useSearchParams();
    const { user, refresh, setUser } = useAuth();
    const toast = useToast();
    const { embedded } = useEmbedded();

    const configQuery = useQuery({
        queryKey: ['auth', 'config'],
        queryFn: authApi.config,
    });

    const [devEmail, setDevEmail] = useState(DEMO_USERS[0].email);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(
        params.get('error') ? 'Sign-in failed. Please try again.' : null,
    );

    const config = configQuery.data;
    const selectedDemo = DEMO_USERS.find((u) => u.email === devEmail);

    useEffect(() => {
        if (user) {
            window.location.replace('/');
        }
    }, [user]);

    async function startSso() {
        setError(null);
        setBusy(true);

        try {
            const { authorize_url } = await authApi.startLogin(
                `${window.location.origin}/`,
            );

            window.location.href = authorize_url;
        } catch (e) {
            setError((e as Error).message || 'Unable to start sign-in.');
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

            toast.success('Signed in', `Welcome, ${me.full_name}`);
            window.location.replace('/');
        } catch (e) {
            setError((e as Error).message || 'Unable to sign in.');
            setBusy(false);
        }
    }

    return (
        <main className={`login-page ${embedded ? 'login-embedded' : ''}`}>
            {!embedded && (
                <aside className="login-showcase">
                    <div className="login-showcase-content">
                        <div className="login-brand login-brand-light">
                            <div className="brand-mark brand-mark-lg">TS</div>
                            <span className="login-brand-name">
                                {config?.app_name ?? 'Team Timesheet'}
                            </span>
                        </div>

                        <div className="login-showcase-copy">
                            <span className="login-eyebrow">
                                WORK MANAGEMENT
                            </span>

                            <h1>
                                Your workday,
                                <br />
                                <span>in sync.</span>
                            </h1>

                            <p>
                                A simpler way to manage attendance, track
                                your time, and keep your team moving forward.
                            </p>
                        </div>

                        <div className="login-feature-list">
                            <div className="login-feature">
                                <span className="login-feature-icon">
                                    <Icon name="clock" size={19} />
                                </span>
                                <div>
                                    <strong>Time, clearly tracked</strong>
                                    <span>Keep daily entries organized.</span>
                                </div>
                            </div>

                            <div className="login-feature">
                                <span className="login-feature-icon">
                                    <Icon name="users" size={19} />
                                </span>
                                <div>
                                    <strong>Teams, better aligned</strong>
                                    <span>Make reviews and approvals simpler.</span>
                                </div>
                            </div>

                            <div className="login-feature">
                                <span className="login-feature-icon">
                                    <Icon name="shield-check" size={19} />
                                </span>
                                <div>
                                    <strong>Access with confidence</strong>
                                    <span>Sign in through your organization.</span>
                                </div>
                            </div>
                        </div>

                        <div className="login-showcase-footer">
                            <span className="login-status-dot" />
                            Built for focused, accountable work.
                        </div>
                    </div>

                    <div className="login-orbit login-orbit-one" />
                    <div className="login-orbit login-orbit-two" />
                    <div className="login-orbit login-orbit-three" />
                </aside>
            )}

            <section className="login-main">
                <div className="login-panel">
                    {embedded && (
                        <div className="login-embedded-title">
                            <div className="brand-mark">TS</div>
                            <span>{config?.app_name ?? 'Team Timesheet'}</span>
                        </div>
                    )}

                    <div className="login-heading">
                        <span className="login-eyebrow login-eyebrow-dark">
                            YOUR WORKSPACE AWAITS
                        </span>

                        <h2>Welcome back</h2>

                        <p>
                            Sign in to access your timesheet and workspace.
                        </p>
                    </div>

                    {error && (
                        <div className="login-error">
                            <Banner tone="danger" title="Sign-in failed">
                                {error}
                            </Banner>
                        </div>
                    )}

                    <div className="login-body">
                        {config?.oidc_enabled ? (
                            <div className="login-sso-section">
                                <Button
                                    variant="primary"
                                    iconLeft="shield"
                                    onClick={startSso}
                                    loading={busy}
                                    className="btn-block"
                                >
                                    Continue with IMS
                                </Button>

                                <div className="login-divider">
                                    <span>SECURE ORGANIZATION ACCESS</span>
                                </div>

                                <p className="login-hint">
                                    You'll be redirected to your
                                    organization's identity provider to
                                    authenticate securely.
                                </p>
                            </div>
                        ) : (
                            <Banner tone="info" title="SSO is not enabled">
                                Ask an administrator to enable IMS in{' '}
                                <strong>Admin → SSO</strong>.
                            </Banner>
                        )}

                        {config?.local_dev_auth && (
                            <div className="login-dev">
                                <div className="login-dev-header">
                                    <span className="login-dev-rule" />
                                    <span className="login-dev-label">
                                        DEVELOPER ACCESS
                                    </span>
                                    <span className="login-dev-rule" />
                                </div>

                                <p className="login-dev-description">
                                    Use a demo account to explore the
                                    application locally.
                                </p>

                                <Field
                                    label="Choose a demo account"
                                    hint="Available only when local development authentication is enabled."
                                >
                                    {(id) => (
                                        <Select
                                            id={id}
                                            value={devEmail}
                                            onChange={(e) =>
                                                setDevEmail(e.target.value)
                                            }
                                        >
                                            {DEMO_USERS.map((u) => (
                                                <option
                                                    key={u.email}
                                                    value={u.email}
                                                >
                                                    {u.label} · {u.role}
                                                </option>
                                            ))}
                                        </Select>
                                    )}
                                </Field>

                                <Button
                                    variant="secondary"
                                    iconLeft="arrow-right"
                                    onClick={devLogin}
                                    loading={busy}
                                    className="btn-block"
                                >
                                    Continue as {selectedDemo?.label ?? 'demo user'}
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="login-privacy">
                        <span className="login-privacy-icon">
                            <Icon name="map-pin" size={15} />
                        </span>
                        <p>
                            <strong>Your location stays private.</strong>
                            <span>
                                We record location only during check-in and
                                check-out, never continuously.
                            </span>
                        </p>
                    </div>
                </div>

                <footer className="login-main-footer">
                    <span>TEAM WORKSPACE</span>
                    <span className="login-footer-separator">·</span>
                    <span>SECURE SIGN-IN</span>
                </footer>
            </section>
        </main>
    );
}
