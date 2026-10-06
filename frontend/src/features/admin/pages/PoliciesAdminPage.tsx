import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api';
import type { Policy } from '../types';

export function PoliciesAdminPage() {
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: ['admin', 'policies'],
        queryFn: adminApi.getPolicy,
    });

    const update = useMutation({
        mutationFn: (body: Partial<Policy>) =>
            adminApi.updatePolicy(body),
        onSuccess: () =>
            qc.invalidateQueries({
                queryKey: ['admin', 'policies'],
            }),
    });

    const [draft, setDraft] =
        useState<Partial<Policy>>({});

    useEffect(() => {
        if (query.data) {
            setDraft(query.data);
        }
    }, [query.data]);

    if (query.isLoading) {
        return (
            <div className="policies-page">
                <div className="policies-card policies-loading">
                    Loading…
                </div>
            </div>
        );
    }

    if (query.isError || !query.data) {
        return (
            <div className="policies-page">
                <div className="policies-card">
                    <div className="alert alert-error">
                        Failed to load policies.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="policies-page">

            <header className="policies-page-header">
                <div>
                    <h1>Policies</h1>
                    <p>
                        Configure organization-wide time,
                        attendance, and location policies.
                    </p>
                </div>
            </header>

            <section className="policies-card">

                <div className="policies-card-header">
                    <div>
                        <h2>Policy settings</h2>
                        <p>
                            These settings control how work sessions
                            and attendance are handled.
                        </p>
                    </div>
                </div>

                <div className="policies-card-body">

                    <div className="policies-form-grid">

                        <label className="policies-field">
                            <span>Workday length</span>

                            <div className="policies-input-with-unit">
                                <input
                                    type="number"
                                    min={1}
                                    max={24}
                                    value={draft.workday_hours ?? 8}
                                    onChange={(e) =>
                                        setDraft({
                                            ...draft,
                                            workday_hours:
                                                Number(e.target.value),
                                        })
                                    }
                                />
                                <span>hours</span>
                            </div>

                            <small>
                                Expected number of working hours
                                in a standard workday.
                            </small>
                        </label>

                        <label className="policies-field">
                            <span>Variance threshold</span>

                            <div className="policies-input-with-unit">
                                <input
                                    type="number"
                                    min={0}
                                    max={1440}
                                    value={
                                        draft.variance_threshold_minutes ??
                                        60
                                    }
                                    onChange={(e) =>
                                        setDraft({
                                            ...draft,
                                            variance_threshold_minutes:
                                                Number(e.target.value),
                                        })
                                    }
                                />
                                <span>minutes</span>
                            </div>

                            <small>
                                Warn on the Team page when the
                                difference between session time and
                                logged time exceeds this value.
                            </small>
                        </label>

                        <label className="policies-field">
                            <span>Auto logout timeout</span>

                            <div className="policies-input-with-unit">
                                <input
                                    type="number"
                                    min={15}
                                    max={4320}
                                    value={
                                        draft.auto_logout_minutes ??
                                        600
                                    }
                                    onChange={(e) =>
                                        setDraft({
                                            ...draft,
                                            auto_logout_minutes:
                                                Number(e.target.value),
                                        })
                                    }
                                />
                                <span>minutes</span>
                            </div>

                            <small>
                                Stale sessions are closed after
                                this amount of inactivity.
                            </small>
                        </label>

                        <label className="policies-field">
                            <span>Location retention</span>

                            <div className="policies-input-with-unit">
                                <input
                                    type="number"
                                    min={1}
                                    max={3650}
                                    value={
                                        draft.location_retention_days ??
                                        365
                                    }
                                    onChange={(e) =>
                                        setDraft({
                                            ...draft,
                                            location_retention_days:
                                                Number(e.target.value),
                                        })
                                    }
                                />
                                <span>days</span>
                            </div>

                            <small>
                                Coordinates are purged after this
                                retention window while timestamps
                                are retained.
                            </small>
                        </label>

                    </div>

                    <div className="policies-divider" />

                    <label className="policies-checkbox-row">

                        <input
                            type="checkbox"
                            checked={
                                draft.allow_login_without_location ??
                                true
                            }
                            onChange={(e) =>
                                setDraft({
                                    ...draft,
                                    allow_login_without_location:
                                        e.target.checked,
                                })
                            }
                        />

                        <span>
                            <strong>
                                Allow check-in when location permission
                                is denied
                            </strong>

                            <small>
                                Users can continue checking in even
                                when browser location permission is
                                unavailable.
                            </small>
                        </span>

                    </label>

                </div>
            </section>

            <div className="policies-actions">
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={update.isPending}
                    onClick={() =>
                        update.mutate({
                            workday_hours:
                                draft.workday_hours,
                            variance_threshold_minutes:
                                draft.variance_threshold_minutes,
                            auto_logout_minutes:
                                draft.auto_logout_minutes,
                            location_retention_days:
                                draft.location_retention_days,
                            allow_login_without_location:
                                draft.allow_login_without_location,
                        })
                    }
                >
                    {update.isPending
                        ? 'Saving…'
                        : 'Save changes'}
                </button>
            </div>

        </div>
    );
}