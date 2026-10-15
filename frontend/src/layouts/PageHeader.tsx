
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface PageHeaderProps {
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
    back?: {
        to: string;
        label: string;
    };
}

export function PageHeader({
    title,
    subtitle,
    actions,
    back,
}: PageHeaderProps) {
    return (
        <header className="page-header">
            <div className="page-header-main">
                {back && (
                    <Link to={back.to} className="page-back">
                        <span className="page-back-arrow" aria-hidden="true">
                            ←
                        </span>
                        <span>{back.label}</span>
                    </Link>
                )}

                <h1 className="page-title">{title}</h1>

                {subtitle && (
                    <div className="page-subtitle">
                        {subtitle}
                    </div>
                )}
            </div>

            {actions && (
                <div className="page-actions">
                    {actions}
                </div>
            )}
        </header>
    );
}
