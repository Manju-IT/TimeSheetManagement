import { useEffect, useState } from 'react';
import {
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';

import { adminApi } from '../api';
import type { Organization } from '../types';

import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { classifyError } from '@/lib/errors';

const TIMEZONES = [
    'UTC',

    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',

    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Madrid',

    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Tokyo',

    'Australia/Sydney',
];

export function OrganizationAdminPage() {
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: ['admin', 'organization'],
        queryFn: adminApi.getOrganization,
    });

    const update = useMutation({
        mutationFn: (
            body: Partial<Organization> & {
                clear_workday_cutoff?: boolean;
            }
        ) => adminApi.updateOrganization(body),

        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ['admin', 'organization'],
            });
        },
    });

    const [draft, setDraft] =
        useState<Partial<Organization>>({});

    const [cutoff, setCutoff] = useState('');

    useEffect(() => {
        if (query.data) {
            setDraft(query.data);
            setCutoff(query.data.workday_cutoff ?? '');
        }
    }, [query.data]);

    if (query.isLoading) {
        return <SkeletonCards count={2} />;
    }

    if (query.isError || !query.data) {
        const c = query.isError
            ? classifyError(query.error)
            : null;

        return (
            <ErrorState
                title="Failed to load organization"
                message={
                    c
                        ? `${c.message} (${c.status || 'n/a'})`
                        : 'The server returned no data.'
                }
                onRetry={() => query.refetch()}
            />
        );
    }

    return (
        <div className="organization-page">

            {/* PAGE HEADER */}
            <header className="organization-page-header">
                <div>
                    <h1>Organization</h1>

                    <p>
                        Manage organization-wide settings used
                        throughout the application.
                    </p>
                </div>
            </header>

            {/* SETTINGS CARD */}
            <section className="organization-card">

                <div className="organization-card-header">
                    <div>
                        <h2>General settings</h2>

                        <p>
                            Configure your organization's name,
                            timezone, and workday behavior.
                        </p>
                    </div>
                </div>

                <div className="organization-card-body">

                    {/* ORGANIZATION NAME */}
                    <label className="organization-field">

                        <span>Organization name</span>

                        <input
                            value={draft.name ?? ''}
                            onChange={(e) =>
                                setDraft({
                                    ...draft,
                                    name: e.target.value,
                                })
                            }
                            placeholder="Organization name"
                        />

                    </label>

                    {/* TIMEZONE */}
                    <label className="organization-field">

                        <span>Default timezone</span>

                        <select
                            value={
                                draft.default_timezone ?? 'UTC'
                            }
                            onChange={(e) =>
                                setDraft({
                                    ...draft,
                                    default_timezone:
                                        e.target.value,
                                })
                            }
                        >
                            {TIMEZONES.map((tz) => (
                                <option
                                    key={tz}
                                    value={tz}
                                >
                                    {tz}
                                </option>
                            ))}
                        </select>

                        <small>
                            Used when a user has no personal
                            timezone configured.
                        </small>

                    </label>

                    {/* WORKDAY CUTOFF */}
                    <div className="organization-field">

                        <span>Workday cutoff</span>

                        <div className="organization-cutoff-row">

                            <input
                                type="time"
                                value={cutoff}
                                onChange={(e) =>
                                    setCutoff(e.target.value)
                                }
                            />

                            <button
                                type="button"
                                className="organization-clear-button"
                                onClick={() =>
                                    setCutoff('')
                                }
                                disabled={!cutoff}
                            >
                                Clear
                            </button>

                        </div>

                        <small>
                            Optional local cutoff time. Logins
                            before this time are bucketed to
                            the previous work date for night-shift
                            handling.
                        </small>

                    </div>

                </div>

            </section>

            {/* ACTIONS */}
            <div className="organization-actions">

                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={update.isPending}
                    onClick={() =>
                        update.mutate({
                            name: draft.name,
                            default_timezone:
                                draft.default_timezone,
                            workday_cutoff:
                                cutoff || null,
                            clear_workday_cutoff:
                                !cutoff,
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