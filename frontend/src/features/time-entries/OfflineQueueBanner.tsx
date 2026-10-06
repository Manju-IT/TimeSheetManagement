import { offlineQueue } from '@/lib/offlineQueue';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { useOfflineQueueItems } from './useOfflineQueueItems';

export function OfflineQueueBanner() {
    const items = useOfflineQueueItems();
    const pending = items.filter((i) => i.status === 'pending' || i.status === 'syncing');
    const failed = items.filter((i) => i.status === 'failed');
    const conflicts = items.filter((i) => i.status === 'conflict');

    if (items.length === 0) return null;

    if (conflicts.length > 0) {
        return (
            <Banner
                tone="danger"
                title={`${conflicts.length} queued entr${conflicts.length === 1 ? 'y' : 'ies'} need${conflicts.length === 1 ? 's' : ''} attention`}
                action={
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => conflicts.forEach((i) => offlineQueue.remove(i.key))}
                    >
                        Discard all
                    </Button>
                }
            >
                We could not save these entries because the server rejected them. Review each row below.
            </Banner>
        );
    }

    if (failed.length > 0) {
        return (
            <Banner
                tone="warning"
                title={`${failed.length} entr${failed.length === 1 ? 'y' : 'ies'} waiting to sync`}
                action={
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                            failed.forEach((i) =>
                                offlineQueue.update(i.key, {
                                    status: 'pending',
                                    error: undefined,
                                    attempts: 0,
                                    nextAttemptAt: undefined,
                                }),
                            )
                        }
                    >
                        Retry all
                    </Button>
                }
            >
                These entries are stored on this device and will be sent automatically.
            </Banner>
        );
    }

    return (
        <Banner tone="info" title={`Syncing ${pending.length} entr${pending.length === 1 ? 'y' : 'ies'}…`}>
            Please keep this tab open. Syncing resumes automatically when the connection returns.
        </Banner>
    );
}