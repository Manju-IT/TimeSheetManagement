import { useState } from 'react';
import {
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';

import { adminApi } from '../api';
import { apiClient } from '@/lib/apiClient';

interface Team {
    id: string;
    name: string;
    org_id: string;
}

interface AdminUserOption {
    id: string;
    email: string;
    full_name: string;
}

interface TeamMember {
    id: string;
    team_id: string;
    user_id: string;
    is_manager: boolean;
}

const teamsApi = {
    list: () =>
        apiClient.get<Team[]>('/api/v1/admin/teams'),

    create: (name: string) =>
        apiClient.post<Team>(
            '/api/v1/admin/teams',
            { name }
        ),

    del: (id: string) =>
        apiClient.delete<{ ok: boolean }>(
            `/api/v1/admin/teams/${id}`
        ),

    addMember: (
        teamId: string,
        user_id: string,
        is_manager: boolean
    ) =>
        apiClient.post(
            `/api/v1/admin/teams/${teamId}/members`,
            {
                user_id,
                is_manager,
            }
        ),

    removeMember: (
        teamId: string,
        userId: string
    ) =>
        apiClient.delete(
            `/api/v1/admin/teams/${teamId}/members/${userId}`
        ),
};

export function TeamsAdminPage() {
    const qc = useQueryClient();

    const [name, setName] = useState('');
    const [openTeam, setOpenTeam] =
        useState<Team | null>(null);

    const list = useQuery({
        queryKey: ['admin', 'teams'],
        queryFn: teamsApi.list,
    });

    const users = useQuery({
        queryKey: ['admin', 'users', 'all'],
        queryFn: () =>
            adminApi.listUsers({
                page_size: 100,
            }),
    });

    const create = useMutation({
        mutationFn: () =>
            teamsApi.create(name.trim()),

        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ['admin', 'teams'],
            });

            setName('');
        },
    });

    const del = useMutation({
        mutationFn: (id: string) =>
            teamsApi.del(id),

        onSuccess: () =>
            qc.invalidateQueries({
                queryKey: ['admin', 'teams'],
            }),
    });

    return (
        <div className="teams-page">

            <header className="teams-page-header">
                <div>
                    <h1>Teams</h1>
                    <p>
                        Create teams and manage their members
                        and manager assignments.
                    </p>
                </div>
            </header>

            <section className="teams-card">

                <div className="teams-create">

                    <input
                        placeholder="New team name"
                        value={name}
                        onChange={(e) =>
                            setName(e.target.value)
                        }
                    />

                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={
                            !name.trim() ||
                            create.isPending
                        }
                        onClick={() =>
                            create.mutate()
                        }
                    >
                        {create.isPending
                            ? 'Creating…'
                            : 'Create team'}
                    </button>

                </div>

                {!list.data ||
                    (list.data.length === 0 && (
                        <div className="teams-empty">
                            No teams yet.
                        </div>
                    ))}

                {list.data &&
                    list.data.length > 0 && (
                        <div className="teams-table-wrapper">

                            <table className="teams-table">

                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th className="teams-actions-column">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {list.data.map((team) => (
                                        <tr key={team.id}>

                                            <td>
                                                <span className="teams-name">
                                                    {team.name}
                                                </span>
                                            </td>

                                            <td className="teams-actions-column">

                                                <button
                                                    type="button"
                                                    className="teams-action-button"
                                                    onClick={() =>
                                                        setOpenTeam(team)
                                                    }
                                                >
                                                    Members
                                                </button>

                                                <button
                                                    type="button"
                                                    className="teams-action-button teams-danger-action"
                                                    onClick={() => {
                                                        if (
                                                            confirm(
                                                                `Delete team "${team.name}"?`
                                                            )
                                                        ) {
                                                            del.mutate(
                                                                team.id
                                                            );
                                                        }
                                                    }}
                                                >
                                                    Delete
                                                </button>

                                            </td>

                                        </tr>
                                    ))}
                                </tbody>

                            </table>

                        </div>
                    )}

            </section>

            {openTeam && users.data && (
                <TeamMembersDrawer
                    team={openTeam}
                    users={users.data.data}
                    onClose={() =>
                        setOpenTeam(null)
                    }
                />
            )}

        </div>
    );
}

function TeamMembersDrawer({
    team,
    users,
    onClose,
}: {
    team: Team;
    users: AdminUserOption[];
    onClose: () => void;
}) {
    const qc = useQueryClient();

    const [pickUser, setPickUser] =
        useState('');

    const [isManager, setIsManager] =
        useState(false);

    const members = useQuery({
        queryKey: [
            'admin',
            'team-members',
            team.id,
        ],

        queryFn: async () => {
            const res = await fetch(
                `/api/v1/teams/${team.id}/members`,
                {
                    credentials: 'include',
                }
            );

            if (!res.ok) {
                throw new Error(
                    'Failed to load members'
                );
            }

            return res.json() as Promise<
                TeamMember[]
            >;
        },
    });

    const add = useMutation({
        mutationFn: () =>
            teamsApi.addMember(
                team.id,
                pickUser,
                isManager
            ),

        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: [
                    'admin',
                    'team-members',
                    team.id,
                ],
            });

            setPickUser('');
            setIsManager(false);
        },
    });

    const remove = useMutation({
        mutationFn: (userId: string) =>
            teamsApi.removeMember(
                team.id,
                userId
            ),

        onSuccess: () =>
            qc.invalidateQueries({
                queryKey: [
                    'admin',
                    'team-members',
                    team.id,
                ],
            }),
    });

    return (
        <div
            className="teams-drawer-backdrop"
            onClick={onClose}
        >
            <aside
                className="teams-drawer"
                onClick={(e) =>
                    e.stopPropagation()
                }
            >

                <header className="teams-drawer-header">

                    <div>
                        <span>Team members</span>
                        <h2>{team.name}</h2>
                    </div>

                    <button
                        type="button"
                        className="teams-drawer-close"
                        onClick={onClose}
                    >
                        ×
                    </button>

                </header>

                <div className="teams-drawer-body">

                    <div className="teams-add-member">

                        <select
                            value={pickUser}
                            onChange={(e) =>
                                setPickUser(
                                    e.target.value
                                )
                            }
                        >
                            <option value="">
                                Add member…
                            </option>

                            {users.map((user) => (
                                <option
                                    key={user.id}
                                    value={user.id}
                                >
                                    {user.full_name}
                                    {' · '}
                                    {user.email}
                                </option>
                            ))}
                        </select>

                        <label className="teams-manager-checkbox">
                            <input
                                type="checkbox"
                                checked={isManager}
                                onChange={(e) =>
                                    setIsManager(
                                        e.target.checked
                                    )
                                }
                            />
                            <span>Manager</span>
                        </label>

                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={
                                !pickUser ||
                                add.isPending
                            }
                            onClick={() =>
                                add.mutate()
                            }
                        >
                            Add
                        </button>

                    </div>

                    {members.data &&
                        members.data.length === 0 && (
                            <div className="teams-empty">
                                No members.
                            </div>
                        )}

                    {members.data &&
                        members.data.length > 0 && (
                            <div className="teams-members-table-wrapper">

                                <table className="teams-table">

                                    <thead>
                                        <tr>
                                            <th>User</th>
                                            <th>Manager</th>
                                            <th />
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {members.data.map(
                                            (member) => {
                                                const user =
                                                    users.find(
                                                        (u) =>
                                                            u.id ===
                                                            member.user_id
                                                    );

                                                return (
                                                    <tr
                                                        key={
                                                            member.id
                                                        }
                                                    >
                                                        <td>
                                                            {user
                                                                ? `${user.full_name} · ${user.email}`
                                                                : member.user_id.slice(
                                                                    0,
                                                                    8
                                                                )}
                                                        </td>

                                                        <td>
                                                            {member.is_manager
                                                                ? 'Yes'
                                                                : '—'}
                                                        </td>

                                                        <td className="teams-actions-column">
                                                            <button
                                                                type="button"
                                                                className="teams-action-button teams-danger-action"
                                                                onClick={() =>
                                                                    remove.mutate(
                                                                        member.user_id
                                                                    )
                                                                }
                                                            >
                                                                Remove
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            }
                                        )}
                                    </tbody>

                                </table>

                            </div>
                        )}

                </div>

            </aside>
        </div>
    );
}