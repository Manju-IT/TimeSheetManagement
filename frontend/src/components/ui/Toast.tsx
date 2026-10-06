import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Tone = 'info' | 'success' | 'warning' | 'danger';

interface Toast {
    id: string;
    tone: Tone;
    title: string;
    message?: string;
    duration: number;
}

interface ToastAPI {
    push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => void;
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
    warn: (title: string, message?: string) => void;
}

const Ctx = createContext<ToastAPI | undefined>(undefined);

const ICONS: Record<Tone, IconName> = {
    info: 'info',
    success: 'check-circle',
    warning: 'alert-triangle',
    danger: 'alert-circle',
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const seq = useRef(0);

    const remove = useCallback((id: string) => {
        setToasts((list) => list.filter((t) => t.id !== id));
    }, []);

    const push = useCallback<ToastAPI['push']>((t) => {
        const id = `t${++seq.current}`;
        const duration = t.duration ?? 4500;
        setToasts((list) => [...list, { ...t, id, duration }]);
        if (duration > 0) {
            setTimeout(() => remove(id), duration);
        }
    }, [remove]);

    const api = useMemo<ToastAPI>(
        () => ({
            push,
            success: (title, message) => push({ tone: 'success', title, message }),
            error: (title, message) => push({ tone: 'danger', title, message, duration: 8000 }),
            info: (title, message) => push({ tone: 'info', title, message }),
            warn: (title, message) => push({ tone: 'warning', title, message, duration: 6500 }),
        }),
        [push],
    );

    return (
        <Ctx.Provider value={api}>
            {children}
            <div className="toast-region" aria-live="polite" aria-atomic="false">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast toast-${t.tone}`} role="status">
                        <span className="toast-icon"><Icon name={ICONS[t.tone]} size={14} /></span>
                        <div className="toast-body">
                            <div className="toast-title">{t.title}</div>
                            {t.message && <div className="toast-msg">{t.message}</div>}
                        </div>
                        <button className="toast-x" onClick={() => remove(t.id)} aria-label="Dismiss">
                            <Icon name="x" size={12} />
                        </button>
                    </div>
                ))}
            </div>
        </Ctx.Provider>
    );
}

export function useToast(): ToastAPI {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
    return ctx;
}