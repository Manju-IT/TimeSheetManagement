import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';
import { authApi } from '@/features/auth/api';
import { useEmbedded } from '@/lib/EmbeddedProvider';
import { Icon } from '@/components/ui/Icon';

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
                <div className="brand-mark">TS</div>
                <span>Timesheet</span>
                {user && <span className="muted small">· {user.full_name}</span>}
            </div>
            <div className="embedded-actions">
                <button className="btn btn-ghost btn-sm" onClick={openFullApp} title="Open in a new tab">
                    <Icon name="external-link" size={12} />
                    <span>Open full app</span>
                </button>
                <button className="btn btn-ghost btn-sm" onClick={onLogout} title="Sign out">
                    <Icon name="logout" size={12} />
                    <span>Sign out</span>
                </button>
            </div>
        </header>
    );
}