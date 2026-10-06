import { useEffect, useState } from 'react';
import { offlineQueue, type QueueItem } from '@/lib/offlineQueue';

export function useOfflineQueueItems(): QueueItem[] {
    const [items, setItems] = useState<QueueItem[]>(() => offlineQueue.snapshot());
    useEffect(() => offlineQueue.subscribe(setItems), []);
    return items;
}