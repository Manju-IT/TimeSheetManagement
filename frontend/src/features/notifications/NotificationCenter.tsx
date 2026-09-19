import { useState, useRef, useEffect } from 'react';

export interface NotificationItem {
    id: string;
    type: 'reminder' | 'target' | 'approval' | 'system';
    title: string;
    message: string;
    time: string;
    read: boolean;
}

export function NotificationCenter() {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([
        {
            id: 'n-1',
            type: 'reminder',
            title: 'Attendance Check-in Reminder',
            message: 'Good morning! Remember to check in to record your workday session.',
            time: '15 mins ago',
            read: false,
        },
        {
            id: 'n-2',
            type: 'target',
            title: 'Daily Goal Progress',
            message: 'You have logged 6h 30m today. Just 1h 30m remaining to reach your 8h target.',
            time: '1 hour ago',
            read: false,
        },
        {
            id: 'n-3',
            type: 'approval',
            title: 'Timesheet Approved',
            message: 'Manjunath approved your timesheet for period Sep 08 – Sep 14, 2026.',
            time: 'Yesterday',
            read: false,
        },
        {
            id: 'n-4',
            type: 'reminder',
            title: 'Weekly Submission Reminder',
            message: 'Reminder: Weekly timesheets must be submitted before Friday 6:00 PM.',
            time: '2 days ago',
            read: true,
        },
    ]);

    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close popover when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const unreadCount = notifications.filter((n) => !n.read).length;

    function handleMarkAllRead() {
        setNotifications(notifications.map((n) => ({ ...n, read: true })));
    }

    function handleDismiss(id: string) {
        setNotifications(notifications.filter((n) => n.id !== id));
    }

    function handleToggleRead(id: string) {
        setNotifications(
            notifications.map((n) => (n.id === id ? { ...n, read: !n.read } : n)),
        );
    }

    return (
        <div style={{ position: 'relative' }} ref={dropdownRef}>
            {/* Bell Icon Trigger */}
            <button
                className="btn btn-ghost btn-sm"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'relative',
                    padding: '6px 10px',
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                }}
                title="Notifications and Reminders"
            >
                <span>🔔</span>
                <span className="small" style={{ fontWeight: 600 }}>Reminders</span>
                {unreadCount > 0 && (
                    <span
                        style={{
                            background: 'var(--danger)',
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 700,
                            borderRadius: '999px',
                            padding: '1px 6px',
                            marginLeft: 2,
                        }}
                    >
                        {unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div
                    className="card"
                    style={{
                        position: 'absolute',
                        right: 0,
                        top: 'calc(100% + 8px)',
                        width: 360,
                        maxHeight: 460,
                        overflowY: 'auto',
                        zIndex: 1000,
                        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6)',
                        padding: 0,
                        border: '1px solid var(--border)',
                    }}
                >
                    <div
                        style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#1a202c',
                        }}
                    >
                        <div>
                            <strong style={{ fontSize: 13 }}>Reminders & Alerts</strong>
                            {unreadCount > 0 && (
                                <span className="muted small" style={{ marginLeft: 6 }}>
                                    ({unreadCount} new)
                                </span>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 11, padding: '2px 6px' }}
                                onClick={handleMarkAllRead}
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {notifications.length === 0 ? (
                            <div className="muted" style={{ padding: 24, textAlign: 'center', fontSize: 12 }}>
                                No reminders right now. You're all caught up!
                            </div>
                        ) : (
                            notifications.map((item) => {
                                const icon =
                                    item.type === 'reminder'
                                        ? '⏰'
                                        : item.type === 'target'
                                        ? '🎯'
                                        : item.type === 'approval'
                                        ? '✅'
                                        : 'ℹ️';

                                return (
                                    <div
                                        key={item.id}
                                        style={{
                                            padding: '12px 16px',
                                            borderBottom: '1px solid var(--border)',
                                            background: item.read ? 'transparent' : 'rgba(47, 129, 247, 0.06)',
                                            display: 'flex',
                                            gap: 12,
                                            alignItems: 'flex-start',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s',
                                        }}
                                        onClick={() => handleToggleRead(item.id)}
                                    >
                                        <span style={{ fontSize: 18, marginTop: 2 }}>{icon}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div
                                                style={{
                                                    fontSize: 12,
                                                    fontWeight: item.read ? 500 : 700,
                                                    color: item.read ? 'var(--text)' : '#fff',
                                                }}
                                            >
                                                {item.title}
                                            </div>
                                            <div
                                                className="muted small"
                                                style={{
                                                    margin: '3px 0 6px',
                                                    fontSize: 12,
                                                    lineHeight: 1.4,
                                                }}
                                            >
                                                {item.message}
                                            </div>
                                            <div
                                                className="muted"
                                                style={{ fontSize: 10, display: 'flex', gap: 8 }}
                                            >
                                                <span>{item.time}</span>
                                                <span>•</span>
                                                <span style={{ textTransform: 'capitalize' }}>{item.type}</span>
                                            </div>
                                        </div>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{
                                                padding: '2px 6px',
                                                fontSize: 11,
                                                color: 'var(--muted)',
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDismiss(item.id);
                                            }}
                                            title="Dismiss reminder"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
