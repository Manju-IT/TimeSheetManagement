import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function EmptyState({
    icon = 'inbox-empty',
    title,
    description,
    action,
    compact,
}: {
    icon?: IconName;
    title: string;
    description?: ReactNode;
    action?: ReactNode;
    compact?: boolean;
}) {
    return (
        <div className={`empty ${compact ? 'empty-compact' : ''}`}>
            <div className="empty-icon"><Icon name={icon} size={compact ? 22 : 30} strokeWidth={1.5} /></div>
            <div className="empty-title">{title}</div>
            {description && <div className="empty-desc">{description}</div>}
            {action && <div className="empty-action">{action}</div>}
        </div>
    );
}