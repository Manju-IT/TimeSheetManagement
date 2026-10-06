import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState, PermissionDenied } from '@/components/ui/ErrorState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { classifyError } from '@/lib/errors';

interface Props<T> {
    query: UseQueryResult<T>;
    children: (data: T) => ReactNode;
    loading?: ReactNode;
    isEmpty?: (data: T) => boolean;
    empty?: ReactNode;
    onRetry?: () => void;
}

export function QueryState<T>({ query, children, loading, isEmpty, empty, onRetry }: Props<T>) {
    if (query.isLoading) return <>{loading ?? <SkeletonTable />}</>;
    if (query.isError) {
        const e = classifyError(query.error);
        if (e.kind === 'forbidden') return <PermissionDenied message={e.message} />;
        return <ErrorState title="Failed to load" message={e.message} onRetry={onRetry ?? (() => query.refetch())} />;
    }
    if (query.data === undefined) return <SkeletonTable />;
    if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
    return <>{children(query.data)}</>;
}