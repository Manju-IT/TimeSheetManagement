export function Skeleton({
    width,
    height = 12,
    radius = 4,
    className = '',
}: {
    width?: number | string;
    height?: number;
    radius?: number;
    className?: string;
}) {
    return (
        <span
            className={`skel ${className}`}
            style={{
                width: typeof width === 'number' ? `${width}px` : width,
                height: `${height}px`,
                borderRadius: `${radius}px`,
            }}
        />
    );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
    return (
        <div className="skel-table">
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="skel-row">
                    {Array.from({ length: cols }).map((_, c) => (
                        <Skeleton key={c} width={c === 0 ? '35%' : '12%'} height={12} />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
    return (
        <div className="grid-3">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="card card-padded">
                    <Skeleton width="40%" height={11} />
                    <div style={{ height: 8 }} />
                    <Skeleton width="70%" height={20} />
                    <div style={{ height: 12 }} />
                    <Skeleton width="90%" height={11} />
                </div>
            ))}
        </div>
    );
}