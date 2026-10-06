import { useState } from 'react';
import {
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';

import { adminApi } from '../api';
import type { WorkSite } from '../types';

const EMPTY = {
    name: '',
    latitude: 0,
    longitude: 0,
    radius_m: 200,
    is_active: true,
};

export function WorkSitesAdminPage() {
    const qc = useQueryClient();

    const [editing, setEditing] =
        useState<WorkSite | null>(null);

    const [creating, setCreating] =
        useState(false);

    const [draft, setDraft] =
        useState({ ...EMPTY });

    const query = useQuery({
        queryKey: ['admin', 'work-sites'],
        queryFn: adminApi.listWorkSites,
    });

    const create = useMutation({
        mutationFn: () =>
            adminApi.createWorkSite(draft),

        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ['admin', 'work-sites'],
            });

            setCreating(false);
            setDraft({ ...EMPTY });
        },
    });

    const update = useMutation({
        mutationFn: (site: WorkSite) =>
            adminApi.updateWorkSite(
                site.id,
                draft
            ),

        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ['admin', 'work-sites'],
            });

            setEditing(null);
        },
    });

    const deactivate = useMutation({
        mutationFn: (id: string) =>
            adminApi.deactivateWorkSite(id),

        onSuccess: () =>
            qc.invalidateQueries({
                queryKey: ['admin', 'work-sites'],
            }),
    });

    const closeEditor = () => {
        setCreating(false);
        setEditing(null);
    };

    const openEditor = (site: WorkSite) => {
        setEditing(site);

        setDraft({
            name: site.name,
            latitude: site.latitude,
            longitude: site.longitude,
            radius_m: site.radius_m,
            is_active: site.is_active,
        });
    };

    return (
        <div className="work-sites-page">

            <header className="work-sites-page-header">

                <div>
                    <h1>Work sites</h1>

                    <p>
                        Configure approved physical locations
                        used for location-based attendance.
                    </p>
                </div>

                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                        setDraft({ ...EMPTY });
                        setCreating(true);
                    }}
                >
                    + New site
                </button>

            </header>

            <section className="work-sites-card">

                {query.isLoading && (
                    <div className="work-sites-empty">
                        Loading…
                    </div>
                )}

                {query.data &&
                    query.data.length === 0 && (
                        <div className="work-sites-empty">
                            <strong>
                                No sites configured
                            </strong>
                            <span>
                                Create a work site to define
                                an approved attendance location.
                            </span>
                        </div>
                    )}

                {query.data &&
                    query.data.length > 0 && (
                        <div className="work-sites-table-wrapper">

                            <table className="work-sites-table">

                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Coordinates</th>
                                        <th>Radius</th>
                                        <th>Status</th>
                                        <th />
                                    </tr>
                                </thead>

                                <tbody>
                                    {query.data.map((site) => (
                                        <tr key={site.id}>

                                            <td>
                                                <span className="work-site-name">
                                                    {site.name}
                                                </span>
                                            </td>

                                            <td>
                                                <span className="work-site-coordinates">
                                                    {site.latitude.toFixed(
                                                        5
                                                    )}
                                                    ,{' '}
                                                    {site.longitude.toFixed(
                                                        5
                                                    )}
                                                </span>
                                            </td>

                                            <td>
                                                {Math.round(
                                                    site.radius_m
                                                )}{' '}
                                                m
                                            </td>

                                            <td>
                                                <span
                                                    className={`work-site-status ${site.is_active
                                                        ? 'work-site-status-active'
                                                        : 'work-site-status-inactive'
                                                        }`}
                                                >
                                                    {site.is_active
                                                        ? 'Active'
                                                        : 'Inactive'}
                                                </span>
                                            </td>

                                            <td className="work-sites-actions">

                                                <button
                                                    type="button"
                                                    className="work-site-action-button"
                                                    onClick={() =>
                                                        openEditor(
                                                            site
                                                        )
                                                    }
                                                >
                                                    Edit
                                                </button>

                                                {site.is_active && (
                                                    <button
                                                        type="button"
                                                        className="work-site-action-button work-site-danger"
                                                        onClick={() =>
                                                            deactivate.mutate(
                                                                site.id
                                                            )
                                                        }
                                                    >
                                                        Deactivate
                                                    </button>
                                                )}

                                            </td>

                                        </tr>
                                    ))}
                                </tbody>

                            </table>

                        </div>
                    )}

            </section>

            {(creating || editing !== null) && (
                <div
                    className="work-sites-drawer-backdrop"
                    onClick={closeEditor}
                >
                    <aside
                        className="work-sites-drawer"
                        onClick={(e) =>
                            e.stopPropagation()
                        }
                    >

                        <header className="work-sites-drawer-header">

                            <div>
                                <span>
                                    Work site
                                </span>

                                <h2>
                                    {editing
                                        ? 'Edit work site'
                                        : 'New work site'}
                                </h2>
                            </div>

                            <button
                                type="button"
                                className="work-sites-close"
                                onClick={closeEditor}
                            >
                                ×
                            </button>

                        </header>

                        <div className="work-sites-drawer-body">

                            <label className="work-sites-field">
                                <span>Name</span>

                                <input
                                    value={draft.name}
                                    onChange={(e) =>
                                        setDraft({
                                            ...draft,
                                            name: e.target.value,
                                        })
                                    }
                                    placeholder="e.g. Hyderabad Office"
                                />
                            </label>

                            <div className="work-sites-coordinate-grid">

                                <label className="work-sites-field">
                                    <span>Latitude</span>

                                    <input
                                        type="number"
                                        step="0.000001"
                                        value={
                                            draft.latitude
                                        }
                                        onChange={(e) =>
                                            setDraft({
                                                ...draft,
                                                latitude:
                                                    Number(
                                                        e.target.value
                                                    ),
                                            })
                                        }
                                    />
                                </label>

                                <label className="work-sites-field">
                                    <span>Longitude</span>

                                    <input
                                        type="number"
                                        step="0.000001"
                                        value={
                                            draft.longitude
                                        }
                                        onChange={(e) =>
                                            setDraft({
                                                ...draft,
                                                longitude:
                                                    Number(
                                                        e.target.value
                                                    ),
                                            })
                                        }
                                    />
                                </label>

                            </div>

                            <label className="work-sites-field">
                                <span>Radius</span>

                                <div className="work-sites-radius-row">

                                    <input
                                        type="number"
                                        min={10}
                                        value={
                                            draft.radius_m
                                        }
                                        onChange={(e) =>
                                            setDraft({
                                                ...draft,
                                                radius_m:
                                                    Number(
                                                        e.target.value
                                                    ),
                                            })
                                        }
                                    />

                                    <span>meters</span>

                                </div>
                            </label>

                            <label className="work-sites-checkbox">

                                <input
                                    type="checkbox"
                                    checked={
                                        draft.is_active
                                    }
                                    onChange={(e) =>
                                        setDraft({
                                            ...draft,
                                            is_active:
                                                e.target.checked,
                                        })
                                    }
                                />

                                <span>
                                    <strong>
                                        Active
                                    </strong>

                                    <small>
                                        Allow this work site
                                        to be used for attendance.
                                    </small>
                                </span>

                            </label>

                            {draft.latitude !== 0 &&
                                draft.longitude !== 0 && (
                                    <div className="work-sites-map-section">

                                        <div className="work-sites-map-title">
                                            Location preview
                                        </div>

                                        <SiteMapPreview
                                            lat={
                                                draft.latitude
                                            }
                                            lon={
                                                draft.longitude
                                            }
                                            radius={
                                                draft.radius_m
                                            }
                                        />

                                    </div>
                                )}

                        </div>

                        <footer className="work-sites-drawer-footer">

                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={closeEditor}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={
                                    create.isPending ||
                                    update.isPending ||
                                    !draft.name.trim()
                                }
                                onClick={() =>
                                    editing
                                        ? update.mutate(
                                            editing
                                        )
                                        : create.mutate()
                                }
                            >
                                {create.isPending ||
                                    update.isPending
                                    ? 'Saving…'
                                    : 'Save'}
                            </button>

                        </footer>

                    </aside>
                </div>
            )}

        </div>
    );
}

function SiteMapPreview({
    lat,
    lon,
    radius,
}: {
    lat: number;
    lon: number;
    radius: number;
}) {
    const zoom = 16;
    const n = Math.pow(2, zoom);

    const xTile = Math.floor(
        ((lon + 180) / 360) * n
    );

    const latRad =
        (lat * Math.PI) / 180;

    const yTile = Math.floor(
        ((1 -
            Math.log(
                Math.tan(latRad) +
                1 / Math.cos(latRad)
            ) /
            Math.PI) /
            2) *
        n
    );

    const url =
        `https://tile.openstreetmap.org/` +
        `${zoom}/${xTile}/${yTile}.png`;

    const diamPx = Math.min(
        180,
        Math.max(
            40,
            Math.log10(radius + 1) * 30
        )
    );

    return (
        <div className="work-site-map">

            <img
                src={url}
                alt=""
                width={280}
                height={200}
                referrerPolicy="no-referrer"
            />

            <div
                className="work-site-map-circle"
                style={{
                    width: diamPx,
                    height: diamPx,
                }}
            />

            <div className="work-site-map-pin" />

        </div>
    );
}