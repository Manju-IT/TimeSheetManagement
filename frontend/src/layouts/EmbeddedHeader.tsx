
import { useNavigate } from 'react-router-dom';

import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/features/auth/useAuth';
import { authApi } from '@/features/auth/api';
import { useEmbedded } from '@/lib/EmbeddedProvider';

export function EmbeddedHeader() {
    const { user, setUser } = useAuth();
    const { openFullApp } = useEmbedded();
    const navigate = useNavigate();

    async function onLogout() {
        await authApi.logout();

        setUser(null);
        navigate('/login', { replace: true });
    }

    return (
        <header className="embedded-header">
            <div className="embedded-brand">
                <div className="brand-mark" aria-hidden="true">
                    TS
                </div>

                <span className="embedded-brand-name">Timesheet</span>

                {user && (
                    <span className="muted small embedded-user-name">
                        {user.full_name}
                    </span>
                )}
            </div>

            <div className="embedded-actions">
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={openFullApp}
                    title="Open in a new tab"
                >
                    <Icon name="external-link" size={15} />
                    <span>Open full app</span>
                </button>

                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={onLogout}
                    title="Sign out"
                >
                    <Icon name="logout" size={15} />
                    <span>Sign out</span>
                </button>
            </div>
        </header>
    );
}
