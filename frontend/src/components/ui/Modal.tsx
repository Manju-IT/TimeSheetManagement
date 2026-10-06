import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

export function Modal({
    open,
    onClose,
    title,
    children,
    size = 'md',
    closeOnBackdrop = true,
}: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    children: ReactNode;
    size?: 'sm' | 'md' | 'lg';
    closeOnBackdrop?: boolean;
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
        <div className="overlay" onClick={closeOnBackdrop ? onClose : undefined}>
            <div
                className={`modal modal-${size}`}
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="modal-header">
                    <h2 className="modal-title">{title}</h2>
                    <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
                </header>
                <div className="modal-body">{children}</div>
            </div>
        </div>,
        document.body,
    );
}

export function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger,
    busy,
    onConfirm,
    onCancel,
}: {
    open: boolean;
    title: string;
    message?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <Modal open={open} onClose={onCancel} title={title} size="sm">
            {message && <div className="confirm-message">{message}</div>}
            <div className="modal-footer">
                <Button variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
                <Button
                    variant={danger ? 'danger' : 'primary'}
                    onClick={onConfirm}
                    loading={busy}
                >
                    {confirmLabel}
                </Button>
            </div>
        </Modal>
    );
}