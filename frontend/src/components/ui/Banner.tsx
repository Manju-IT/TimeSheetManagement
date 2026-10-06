import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const ICONS: Record<Tone, IconName> = {
    info: 'info',
    success: 'check-circle',
    warning: 'alert-triangle',
    danger: 'alert-circle',
};

export function Banner({
    tone = 'info',
    title,
    children,
    action,
    onDismiss,
}: {
    tone?: Tone;
    title?: ReactNode;
    children?: ReactNode;
    action?: ReactNode;
    onDismiss?: () => void;
}) {
    return (
        <div className={`banner banner-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
            <div className="banner-icon"><Icon name={ICONS[tone]} size={14} /></div>
            <div className="banner-body">
                {title && <div className="banner-title">{title}</div>}
                {children && <div className="banner-msg">{children}</div>}
            </div>
            {action && <div className="banner-action">{action}</div>}
            {onDismiss && (
                <button className="banner-x" aria-label="Dismiss" onClick={onDismiss}>
                    <Icon name="x" size={12} />
                </button>
            )}
        </div>
    );
}