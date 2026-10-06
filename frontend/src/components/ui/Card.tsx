import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    padded?: boolean;
}

export function Card({ children, className = '', padded = true, ...rest }: CardProps) {
    return (
        <div className={`card ${padded ? 'card-padded' : ''} ${className}`.trim()} {...rest}>
            {children}
        </div>
    );
}

export function CardHeader({
    title,
    subtitle,
    actions,
}: {
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <header className="card-header">
            <div className="card-title-block">
                <h2 className="card-title">{title}</h2>
                {subtitle && <div className="card-subtitle">{subtitle}</div>}
            </div>
            {actions && <div className="card-actions">{actions}</div>}
        </header>
    );
}