import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

const ICONS: Partial<Record<Tone, IconName>> = {
    info: 'info',
    success: 'check-circle',
    warning: 'alert-triangle',
    danger: 'alert-circle',
};

export function Badge({
    tone = 'neutral',
    children,
    icon,
    size = 'md',
}: {
    tone?: Tone;
    children: ReactNode;
    icon?: IconName | false;
    size?: 'sm' | 'md';
}) {
    const showIcon = icon === false ? null : icon ?? ICONS[tone];
    return (
        <span className={`badge badge-${tone} badge-${size}`}>
            {showIcon && <Icon name={showIcon} size={size === 'sm' ? 10 : 11} />}
            <span>{children}</span>
        </span>
    );
}