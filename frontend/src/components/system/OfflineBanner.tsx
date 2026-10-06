import { useEffect, useState } from 'react';
import { Banner } from '@/components/ui/Banner';

export function OfflineBanner() {
    const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
    const [wasOffline, setWasOffline] = useState(false);

    useEffect(() => {
        const on = () => {
            setOffline(false);
            setWasOffline(true);
            setTimeout(() => setWasOffline(false), 3000);
        };
        const off = () => setOffline(true);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);

    if (!offline && !wasOffline) return null;
    if (offline) {
        return (
            <div className="global-banner">
                <Banner tone="warning" title="You're offline">
                    Changes you make will be queued and synced when the connection returns.
                </Banner>
            </div>
        );
    }
    return (
        <div className="global-banner">
            <Banner tone="success" title="Back online">Reconnected.</Banner>
        </div>
    );
}