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
    { email: 'member@example.com', label: 'Milo Member · member' },
    { email: 'manager@example.com', label: 'Mira Manager · manager' },
    { email: 'admin@example.com', label: 'Ada Admin · admin' },
];

export function LoginPage() {
    const [params] = useSearchParams();

    const { user, refresh, setUser } = useAuth();
    const toast = useToast();

    const configQuery = useQuery({
        queryKey: ['auth', 'config'],
        queryFn: authApi.config,
    });

    const [devEmail, setDevEmail] = useState(
        DEMO_USERS[0].email,
    );

    const [busy, setBusy] = useState(false);

    const [error, setError] = useState<string | null>(
        params.get('error')
            ? 'Sign-in failed. Please try again.'
            : null,
    );

    const { embedded } = useEmbedded();

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
                window.location.origin + '/',
            );

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

            toast.success(
                'Signed in',
                `Welcome, ${me.full_name}`,
            );

            window.location.replace('/');
        } catch (e) {
            setError((e as Error).message);
            setBusy(false);
        }
    }

    const config = configQuery.data;

    return (
        <div
            className={`login-page ${embedded ? 'login-embedded' : ''
                }`}
        >
            <div className="login-panel">

                {/* Full branding for normal login */}
                {!embedded && (
                    <div className="login-brand">
                        <div className="brand-mark brand-mark-lg">
                            TS
                        </div>

                        <div>
                            <div className="login-title">
                                {config?.app_name ?? 'Team Timesheet'}
                            </div>

                            <div className="login-subtitle">
                                Sign in to continue
                            </div>
                        </div>
                    </div>
                )}

                {/* Compact branding for embedded login */}
                {embedded && (
                    <div className="login-embedded-title">
                        <div className="brand-mark">
                            TS
                        </div>

                        <span>
                            {config?.app_name ?? 'Team Timesheet'}
                        </span>
                    </div>
                )}

                {error && (
                    <Banner
                        tone="danger"
                        title="Sign-in failed"
                    >
                        {error}
                    </Banner>
                )}

                <div className="login-body">
                    {config?.oidc_enabled ? (
                        <>
                            <Button
                                variant="primary"
                                iconLeft="shield"
                                onClick={startSso}
                                loading={busy}
                                className="btn-block"
                            >
                                Continue with IMS
                            </Button>

                            <p className="login-hint">
                                You will be redirected to your
                                organization's identity provider.
                            </p>
                        </>
                    ) : (
                        <Banner
                            tone="info"
                            title="SSO is not enabled"
                        >
                            Ask an administrator to enable IMS in{' '}
                            <strong>
                                Admin → SSO
                            </strong>
                            .
                        </Banner>
                    )}

                    {config?.local_dev_auth && (
                        <div className="login-dev">
                            <div className="login-dev-header">
                                <span className="login-dev-rule" />

                                <span className="login-dev-label">
                                    Local development
                                </span>

                                <span className="login-dev-rule" />
                            </div>

                            <Field
                                label="Demo account"
                                hint="Dev-only accounts. Not available in production."
                            >
                                {(id) => (
                                    <Select
                                        id={id}
                                        value={devEmail}
                                        onChange={(e) =>
                                            setDevEmail(
                                                e.target.value,
                                            )
                                        }
                                    >
                                        {DEMO_USERS.map((u) => (
                                            <option
                                                key={u.email}
                                                value={u.email}
                                            >
                                                {u.label}
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
                                Continue as {devEmail}
                            </Button>
                        </div>
                    )}
                </div>

                <div className="login-privacy">
                    <Icon
                        name="map-pin"
                        size={12}
                    />

                    <span>
                        We record your location only when you
                        check in and check out — never continuously.
                    </span>
                </div>
            </div>
        </div>
    );
}