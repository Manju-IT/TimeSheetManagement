import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    iconLeft?: IconName;
    iconRight?: IconName;
    children?: ReactNode;
}

export function Button({
    variant = 'secondary',
    size = 'md',
    loading,
    iconLeft,
    iconRight,
    children,
    disabled,
    className = '',
    ...rest
}: Props) {
    const cls = `btn btn-${variant} btn-${size} ${className}`.trim();
    return (
        <button className={cls} disabled={disabled || loading} {...rest}>
            {loading ? (
                <span className="btn-spin">
                    <Icon name="spinner" size={size === 'sm' ? 12 : 14} />
                </span>
            ) : iconLeft ? (
                <Icon name={iconLeft} size={size === 'sm' ? 12 : 14} />
            ) : null}
            {children && <span>{children}</span>}
            {iconRight && !loading && <Icon name={iconRight} size={size === 'sm' ? 12 : 14} />}
        </button>
    );
}