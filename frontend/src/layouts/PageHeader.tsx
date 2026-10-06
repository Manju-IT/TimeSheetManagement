import type { ReactNode } from 'react';

export function PageHeader({
    title,
    subtitle,
    actions,
    back,
}: {
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
    back?: { to: string; label: string };
}) {
    return (
        <header className="page-header">
            <div className="page-header-main">
                {back && (
                    <a href={back.to} className="page-back">
                        <span aria-hidden>←</span> {back.label}
                    </a>
                )}
                <h1 className="page-title">{title}</h1>
                {subtitle && <div className="page-subtitle">{subtitle}</div>}
            </div>
            {actions && <div className="page-actions">{actions}</div>}
        </header>
    );
}