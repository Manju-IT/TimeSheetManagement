import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Drawer({
    open,
    onClose,
    title,
    subtitle,
    children,
    footer,
    width = 560,
}: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    subtitle?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    width?: number;
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div className="overlay overlay-right" onClick={onClose}>
            <aside
                className="drawer"
                style={{ width, maxWidth: '100vw' }}
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="drawer-header">
                    <div className="drawer-title-block">
                        <h2 className="drawer-title">{title}</h2>
                        {subtitle && <div className="drawer-subtitle">{subtitle}</div>}
                    </div>
                    <button className="drawer-x" onClick={onClose} aria-label="Close">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </header>
                <div className="drawer-body">{children}</div>
                {footer && <footer className="drawer-footer">{footer}</footer>}
            </aside>
        </div>,
        document.body,
    );
}