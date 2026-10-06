// UsersAdminPage.tsx — updated page shell + table
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api';
import type { AdminUser } from '../types';
import { Card } from '@/components/ui/Card';
import { Table, THead, TBody, TH, TD } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { classifyError } from '@/lib/errors';

const ROLES = ['member', 'manager', 'admin'] as const;

export function UsersAdminPage() {
    const qc = useQueryClient();
    const toast = useToast();

    const [q, setQ] = useState('');
    const [status, setStatus] =
        useState<'' | 'active' | 'disabled'>('');

    const [page, setPage] = useState(1);

    const query = useQuery({
        queryKey: [
            'admin',
            'users',
            { q, status, page },
        ],
        queryFn: () =>
            adminApi.listUsers({
                q: q || undefined,
                status: status || undefined,
                page,
                page_size: 25,
            }),
    });

    const invalidate = () =>
        qc.invalidateQueries({
            queryKey: ['admin', 'users'],
        });

    const grant = useMutation({
        mutationFn: ({
            id,
            role,
        }: {
            id: string;
            role: string;
        }) =>
            adminApi.grantRole(id, role),

        onSuccess: (_d, v) => {
            toast.success(`Role granted: ${v.role}`);
            invalidate();
        },

        onError: (e) =>
            toast.error(
                'Failed',
                classifyError(e).message
            ),
    });

    const revoke = useMutation({
        mutationFn: ({
            id,
            role,
        }: {
            id: string;
            role: string;
        }) =>
            adminApi.revokeRole(id, role),

        onSuccess: (_d, v) => {
            toast.success(`Role revoked: ${v.role}`);
            invalidate();
        },

        onError: (e) =>
            toast.error(
                'Failed',
                classifyError(e).message
            ),
    });

    const patch = useMutation({
        mutationFn: ({
            id,
            body,
        }: {
            id: string;
            body: Record<string, unknown>;
        }) =>
            adminApi.patchUser(id, body),

        onSuccess: () => {
            toast.success('User updated');
            invalidate();
        },

        onError: (e) =>
            toast.error(
                'Update failed',
                classifyError(e).message
            ),
    });

    const [confirmRevoke, setConfirmRevoke] =
        useState<{
            user: AdminUser;
            role: string;
        } | null>(null);

    return (
        <div className="users-admin-page">


            <header className="users-page-header">
                <div className="users-page-heading">
                    <div className="users-page-heading-icon">
                        <Icon name="users" size={22} />
                    </div>

                    <div>
                        <span className="users-page-eyebrow">
                            ACCESS MANAGEMENT
                        </span>
                        <h1>Users &amp; roles</h1>
                        <p>
                            Manage organization members, permissions,
                            and account access.
                        </p>
                    </div>
                </div>
            </header>

            <Card>
                <div className="users-filter-bar">

                    <div className="users-filter-field">
                        <span>Search</span>
                        <Input
                            placeholder="Name or email…"
                            value={q}
                            onChange={(e) => {
                                setQ(e.target.value);
                                setPage(1);
                            }}
                        />
                    </div>

                    <div className="users-filter-field">
                        <span>Status</span>
                        <Select
                            value={status}
                            onChange={(e) => {
                                setStatus(
                                    e.target.value as
                                    typeof status
                                );
                                setPage(1);
                            }}
                        >
                            <option value="">
                                Any status
                            </option>
                            <option value="active">
                                Active
                            </option>
                            <option value="disabled">
                                Disabled
                            </option>
                        </Select>
                    </div>

                </div>
            </Card>

            <Card padded={false}>

                {query.isLoading && (
                    <div className="users-loading">
                        <SkeletonTable
                            rows={6}
                            cols={5}
                        />
                    </div>
                )}

                {query.isError && (
                    <div className="users-error">
                        <ErrorState
                            message={
                                classifyError(
                                    query.error
                                ).message
                            }
                            onRetry={() =>
                                query.refetch()
                            }
                        />
                    </div>
                )}

                {query.data &&
                    query.data.data.length === 0 && (
                        <EmptyState
                            icon="users"
                            title="No users match"
                            description="Try a different search or status filter."
                        />
                    )}

                {query.data &&
                    query.data.data.length > 0 && (
                        <>
                            <div className="users-table-wrapper">

                                <Table>
                                    <THead>
                                        <tr>
                                            <TH>Name</TH>
                                            <TH
                                                style={{
                                                    width: 220,
                                                }}
                                            >
                                                Email
                                            </TH>
                                            <TH
                                                style={{
                                                    width: 90,
                                                }}
                                            >
                                                Status
                                            </TH>
                                            <TH>
                                                Roles
                                            </TH>
                                            <TH
                                                style={{
                                                    width: 110,
                                                }}
                                            />
                                        </tr>
                                    </THead>

                                    <TBody>
                                        {query.data.data.map(
                                            (u) => (
                                                <tr
                                                    key={
                                                        u.id
                                                    }
                                                >
                                                    <TD>
                                                        {
                                                            u.full_name
                                                        }
                                                    </TD>

                                                    <TD className="clip">
                                                        {u.email}
                                                    </TD>

                                                    <TD>
                                                        <Badge
                                                            tone={
                                                                u.status ===
                                                                    'active'
                                                                    ? 'success'
                                                                    : 'danger'
                                                            }
                                                            size="sm"
                                                        >
                                                            {
                                                                u.status
                                                            }
                                                        </Badge>
                                                    </TD>

                                                    <TD>
                                                        <div className="role-chips">
                                                            {u.roles.map(
                                                                (
                                                                    role
                                                                ) => (
                                                                    <span
                                                                        key={
                                                                            role
                                                                        }
                                                                        className={`role-chip role-${role}`}
                                                                    >
                                                                        {
                                                                            role
                                                                        }

                                                                        <button
                                                                            className="role-chip-x"
                                                                            onClick={() =>
                                                                                setConfirmRevoke(
                                                                                    {
                                                                                        user: u,
                                                                                        role,
                                                                                    }
                                                                                )
                                                                            }
                                                                            aria-label={`Remove ${role}`}
                                                                        >
                                                                            <Icon
                                                                                name="x"
                                                                                size={
                                                                                    9
                                                                                }
                                                                            />
                                                                        </button>
                                                                    </span>
                                                                )
                                                            )}

                                                            <select
                                                                className="role-add"
                                                                value=""
                                                                onChange={(
                                                                    e
                                                                ) => {
                                                                    if (
                                                                        e
                                                                            .target
                                                                            .value
                                                                    ) {
                                                                        grant.mutate(
                                                                            {
                                                                                id: u.id,
                                                                                role: e
                                                                                    .target
                                                                                    .value,
                                                                            }
                                                                        );
                                                                    }
                                                                }}
                                                            >
                                                                <option value="">
                                                                    + role
                                                                </option>

                                                                {ROLES.filter(
                                                                    (
                                                                        role
                                                                    ) =>
                                                                        !u.roles.includes(
                                                                            role
                                                                        )
                                                                ).map(
                                                                    (
                                                                        role
                                                                    ) => (
                                                                        <option
                                                                            key={
                                                                                role
                                                                            }
                                                                            value={
                                                                                role
                                                                            }
                                                                        >
                                                                            {
                                                                                role
                                                                            }
                                                                        </option>
                                                                    )
                                                                )}
                                                            </select>
                                                        </div>
                                                    </TD>

                                                    <TD>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() =>
                                                                patch.mutate(
                                                                    {
                                                                        id: u.id,
                                                                        body: {
                                                                            status:
                                                                                u.status ===
                                                                                    'active'
                                                                                    ? 'disabled'
                                                                                    : 'active',
                                                                        },
                                                                    }
                                                                )
                                                            }
                                                        >
                                                            {u.status ===
                                                                'active'
                                                                ? 'Disable'
                                                                : 'Enable'}
                                                        </Button>
                                                    </TD>
                                                </tr>
                                            )
                                        )}
                                    </TBody>
                                </Table>

                            </div>

                            <Pagination
                                page={
                                    query.data.pagination
                                        .page
                                }
                                pageSize={
                                    query.data.pagination
                                        .page_size
                                }
                                total={
                                    query.data.pagination
                                        .total
                                }
                                hasNext={
                                    query.data.pagination
                                        .has_next
                                }
                                onPage={setPage}
                            />
                        </>
                    )}

            </Card>

            <ConfirmDialog
                open={!!confirmRevoke}
                title="Revoke role?"
                message={
                    confirmRevoke
                        ? `Remove "${confirmRevoke.role}" from ${confirmRevoke.user.full_name}?`
                        : undefined
                }
                confirmLabel="Revoke"
                danger
                busy={revoke.isPending}
                onCancel={() =>
                    setConfirmRevoke(null)
                }
                onConfirm={() => {
                    if (confirmRevoke) {
                        revoke.mutate({
                            id: confirmRevoke.user.id,
                            role: confirmRevoke.role,
                        });
                    }

                    setConfirmRevoke(null);
                }}
            />

        </div>
    );
}