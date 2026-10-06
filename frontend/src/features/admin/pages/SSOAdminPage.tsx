import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api';
import type { SSOConfig } from '../types';

export function SSOAdminPage() {
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: ['admin', 'sso'],
        queryFn: adminApi.getSSO,
    });

    const update = useMutation({
        mutationFn: (body: Partial<SSOConfig>) => adminApi.updateSSO(body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['admin', 'sso'] });
        },
    });

    const [draft, setDraft] = useState<Partial<SSOConfig>>({});
    const [originsText, setOriginsText] = useState('');

    useEffect(() => {
        if (query.data) {
            setDraft(query.data);
            setOriginsText(
                (query.data.allowed_embed_origins ?? []).join('\n')
            );
        }
    }, [query.data]);

    if (query.isLoading) {
        return (
            <div className="sso-page">
                <div className="sso-card sso-loading">
                    Loading…
                </div>
            </div>
        );
    }

    if (query.isError || !query.data) {
        return (
            <div className="sso-page">
                <div className="sso-card">
                    <div className="alert alert-error">
                        Failed to load.
                    </div>
                </div>
            </div>
        );
    }

    const env = query.data;

    return (
        <div className="sso-page">

            {/* PAGE HEADER */}
            <header className="sso-page-header">
                <div>
                    <h1>SSO / IMS configuration</h1>
                    <p>
                        Configure organization-level single sign-on and
                        embedded IMS access.
                    </p>
                </div>
            </header>

            {/* ENVIRONMENT CONFIGURATION */}
            <section className="sso-card">

                <div className="sso-card-header">
                    <div>
                        <h2>Identity provider</h2>
                        <p>
                            Read-only configuration loaded from the backend
                            environment.
                        </p>
                    </div>

                    <span className="sso-readonly-badge">
                        Read-only
                    </span>
                </div>

                <div className="sso-card-body">

                    <div className="sso-kv-grid">

                        <Kv
                            k="OIDC enabled in environment"
                            v={env.env_oidc_enabled ? 'Yes' : 'No'}
                        />

                        <Kv
                            k="Issuer"
                            v={env.env_issuer ?? '—'}
                        />

                        <Kv
                            k="Client ID"
                            v={env.env_client_id ?? '—'}
                        />

                        <Kv
                            k="Redirect URI"
                            v={env.env_redirect_uri ?? '—'}
                        />

                        <Kv
                            k="Scopes"
                            v={env.env_scopes}
                        />

                    </div>

                    <div className="sso-info">
                        <span className="sso-info-icon">i</span>

                        <p>
                            Secrets such as the client secret and signing
                            keys are never stored here. Change them in your
                            environment and restart the backend.
                        </p>
                    </div>

                </div>
            </section>

            {/* SIGN-IN CONFIGURATION */}
            <section className="sso-card">

                <div className="sso-card-header">
                    <div>
                        <h2>Sign-in behavior</h2>
                        <p>
                            Control how users authenticate through your
                            organization's identity provider.
                        </p>
                    </div>
                </div>

                <div className="sso-card-body">

                    {/* CHECKBOX */}
                    <label className="sso-checkbox-row">
                        <input
                            type="checkbox"
                            checked={draft.enabled ?? false}
                            onChange={(e) =>
                                setDraft({
                                    ...draft,
                                    enabled: e.target.checked,
                                })
                            }
                        />

                        <span>
                            Enable SSO sign-in for this organization
                        </span>
                    </label>

                    {/* CLAIM MAPPINGS */}
                    <div className="sso-section">

                        <div className="sso-section-header">
                            <h3>Claim mappings</h3>
                            <p>
                                Map identity-provider groups to application
                                roles.
                            </p>
                        </div>

                        <div className="sso-form-grid">

                            <label className="sso-field">
                                <span>Group claim name</span>

                                <input
                                    value={draft.group_claim ?? ''}
                                    onChange={(e) =>
                                        setDraft({
                                            ...draft,
                                            group_claim: e.target.value,
                                        })
                                    }
                                    placeholder="groups"
                                />
                            </label>

                            <label className="sso-field">
                                <span>Admin group</span>

                                <input
                                    value={draft.group_to_role_admin ?? ''}
                                    onChange={(e) =>
                                        setDraft({
                                            ...draft,
                                            group_to_role_admin: e.target.value,
                                        })
                                    }
                                    placeholder="admins"
                                />
                            </label>

                            <label className="sso-field">
                                <span>Manager group</span>

                                <input
                                    value={draft.group_to_role_manager ?? ''}
                                    onChange={(e) =>
                                        setDraft({
                                            ...draft,
                                            group_to_role_manager: e.target.value,
                                        })
                                    }
                                    placeholder="managers"
                                />
                            </label>

                            <label className="sso-field">
                                <span>Member group</span>

                                <input
                                    value={draft.group_to_role_member ?? ''}
                                    onChange={(e) =>
                                        setDraft({
                                            ...draft,
                                            group_to_role_member: e.target.value,
                                        })
                                    }
                                    placeholder="members"
                                />
                            </label>

                        </div>

                        <p className="sso-helper">
                            Users who are not in any configured group receive
                            the <strong>member</strong> role.
                        </p>

                    </div>

                    {/* EMBED ORIGINS */}
                    <div className="sso-section">

                        <div className="sso-section-header">
                            <h3>Allowed embed origins</h3>
                            <p>
                                Configure the origins that are allowed to
                                embed the application in an iframe.
                            </p>
                        </div>

                        <label className="sso-field">

                            <span>Allowed origins</span>

                            <textarea
                                rows={5}
                                value={originsText}
                                onChange={(e) =>
                                    setOriginsText(e.target.value)
                                }
                                placeholder="https://ims.example.com"
                            />

                        </label>

                        <p className="sso-helper">
                            Enter one origin per line.
                        </p>

                    </div>

                </div>
            </section>

            {/* ACTIONS */}
            <div className="sso-actions">

                <button
                    className="btn btn-primary"
                    disabled={update.isPending}
                    onClick={() =>
                        update.mutate({
                            enabled: draft.enabled,
                            group_claim: draft.group_claim,
                            group_to_role_admin:
                                draft.group_to_role_admin,
                            group_to_role_manager:
                                draft.group_to_role_manager,
                            group_to_role_member:
                                draft.group_to_role_member,
                            allowed_embed_origins: originsText
                                .split('\n')
                                .map((s) => s.trim())
                                .filter(Boolean),
                        })
                    }
                >
                    {update.isPending ? 'Saving…' : 'Save changes'}
                </button>

            </div>

        </div>
    );
}

function Kv({
    k,
    v,
}: {
    k: string;
    v: string;
}) {
    return (
        <div className="sso-kv">

            <span className="sso-kv-label">
                {k}
            </span>

            <span className="sso-kv-value">
                {v}
            </span>

        </div>
    );
}