// resources/js/stores/notificationStore.ts
import { create } from 'zustand';
import { pollingService } from '../services/pollingService';
import { soundService } from '../services/soundService';
import api from '../services/api';

export type Notification = {
    id?: string | number;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    data?: any;
    timestamp?: string;
    read?: boolean;
};

interface NotificationState {
    notifications: Notification[];
    unreadCount: number;
    isConnected: boolean;
    isConnecting: boolean;
    connectionError: string | null;
    isLoading: boolean;

    addNotification: (notification: Notification) => void;
    markAsRead: (id: string | number) => void;
    markAllAsRead: () => void;
    clearAll: () => void;
    removeNotification: (id: string | number) => void;
    loadNotifications: () => Promise<void>;
    syncWithServer: () => Promise<void>;

    connect: (userId?: number) => void;
    disconnect: () => void;
    reconnect: (userId?: number) => void;
    checkConnection: () => { connected: boolean; state: string };

    on: (event: string, callback: (data: any) => void) => () => void;

    getUnreadCount: () => number;
    getNotifications: () => Notification[];
    getLatestNotification: () => Notification | null;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
    // ─── Initial State ────────────────────────────────────────────────────
    notifications: [],
    unreadCount: 0,
    isConnected: false,
    isConnecting: false,
    connectionError: null,
    isLoading: false,

    // ─── Load Notifications from Server ──────────────────────────────────
    loadNotifications: async () => {
        set({ isLoading: true });
        try {
            const response = await api.get('/notifications', {
                params: { limit: 100 },
            });
            const notifications = (response.data.notifications ?? []).map((n: any) => ({
                id: n.id,
                type: n.type,
                title: n.title,
                message: n.message,
                data: n.data,
                timestamp: n.created_at,
                read: n.is_read,
            }));

            set({
                notifications,
                unreadCount: response.data.unread_count ?? 0,
                isLoading: false,
            });

            console.log(
                `📥 Loaded ${notifications.length} notifications (${response.data.unread_count} unread)`,
            );
        } catch (error) {
            console.error('Failed to load notifications:', error);
            set({ isLoading: false });
        }
    },

    syncWithServer: async () => {
        await get().loadNotifications();
    },

    // ─── Add Notification ────────────────────────────────────────────────
    addNotification: (notification: Notification) => {
        console.log('📥 🔔 STORE: Adding notification:', notification);

        // 🔊 Play sound
        soundService.play();

        set((state) => {
            // Deduplicate by id
            if (
                notification.id !== undefined &&
                state.notifications.some((n) => n.id === notification.id)
            ) {
                console.log('📥 ⚠️ Duplicate notification, skipping:', notification.id);
                return state;
            }

            const newNotification = {
                ...notification,
                read: false,
                timestamp: notification.timestamp || new Date().toISOString(),
            };

            const newNotifications = [newNotification, ...state.notifications];
            if (newNotifications.length > 100) {
                newNotifications.pop();
            }

            return {
                notifications: newNotifications,
                unreadCount: state.unreadCount + 1,
            };
        });

        // Desktop notification
        if ('Notification' in window && window.Notification.permission === 'granted') {
            try {
                const DesktopNotification = window.Notification;
                new DesktopNotification(notification.title, {
                    body: notification.message,
                    icon: '/favicon.ico',
                });
            } catch (e) {
                console.error('Desktop notification error:', e);
            }
        }
    },

    // ─── Mark as Read ────────────────────────────────────────────────────
    markAsRead: async (id: string | number) => {
        try {
            await api.put(`/notifications/${id}/read`);

            set((state) => {
                const notification = state.notifications.find((n) => n.id === id);
                if (!notification || notification.read) return state;

                const newNotifications = state.notifications.map((n) =>
                    n.id === id ? { ...n, read: true } : n,
                );

                return {
                    notifications: newNotifications,
                    unreadCount: Math.max(0, state.unreadCount - 1),
                };
            });
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    },

    markAllAsRead: async () => {
        try {
            await api.put('/notifications/read-all');
            set((state) => ({
                notifications: state.notifications.map((n) => ({ ...n, read: true })),
                unreadCount: 0,
            }));
        } catch (error) {
            console.error('Failed to mark all notifications as read:', error);
        }
    },

    clearAll: async () => {
        try {
            await api.delete('/notifications');
            set({ notifications: [], unreadCount: 0 });
            console.log('📥 🗑️ All notifications cleared');
        } catch (error) {
            console.error('Failed to clear notifications:', error);
        }
    },

    removeNotification: async (id: string | number) => {
        try {
            await api.delete(`/notifications/${id}`);

            set((state) => {
                const notification = state.notifications.find((n) => n.id === id);
                const newNotifications = state.notifications.filter((n) => n.id !== id);

                return {
                    notifications: newNotifications,
                    unreadCount:
                        notification && !notification.read
                            ? state.unreadCount - 1
                            : state.unreadCount,
                };
            });
        } catch (error) {
            console.error('Failed to remove notification:', error);
        }
    },

    // ─── Connect (starts polling) ────────────────────────────────────────
    connect: (userId?: number) => {
        console.log('🔗 Connecting notification store (polling mode)...');
        set({ isConnecting: true, connectionError: null });

        try {
            // Register listener for notifications from the poller
            const unsubNotif = pollingService.on('notification', (data: Notification) => {
                get().addNotification(data);
            });

            // Keep unread count in sync with server
            const unsubUnread = pollingService.on('unread_count', (count: number) => {
                if (typeof count === 'number') {
                    set({ unreadCount: count });
                }
            });

            (window as any).__notificationUnsubscribes = [unsubNotif, unsubUnread];

            // Initial full history load
            get().loadNotifications();

            // Start polling
            pollingService.start();

            const status = pollingService.getStatus();

            set({
                isConnected: status.connected,
                isConnecting: false,
                connectionError: null,
            });

            console.log('🔗 Polling status:', status);
        } catch (error: any) {
            console.error('❌ Failed to start polling:', error);
            set({
                isConnected: false,
                isConnecting: false,
                connectionError: error.message || 'Failed to start polling',
            });
        }
    },

    // ─── Disconnect ──────────────────────────────────────────────────────
    disconnect: () => {
        try {
            if ((window as any).__notificationUnsubscribes) {
                (window as any).__notificationUnsubscribes.forEach((fn: () => void) => fn());
                (window as any).__notificationUnsubscribes = [];
            }
            pollingService.stop();
            set({ isConnected: false, isConnecting: false });
            console.log('🔇 Notification store disconnected');
        } catch (error) {
            console.error('Error disconnecting:', error);
        }
    },

    // ─── Reconnect ───────────────────────────────────────────────────────
    reconnect: (userId?: number) => {
        set({ isConnecting: true });
        try {
            pollingService.stop();
            get().connect(userId);
        } catch (error: any) {
            set({
                isConnected: false,
                isConnecting: false,
                connectionError: error.message || 'Failed to reconnect',
            });
        }
    },

    // ─── Check Connection ────────────────────────────────────────────────
    checkConnection: () => {
        const status = pollingService.getStatus();
        const currentState = get();
        if (status.connected !== currentState.isConnected) {
            set({
                isConnected: status.connected,
                connectionError: status.connected ? null : 'Polling stopped',
            });
        }
        return status;
    },

    // ─── Event Listeners ─────────────────────────────────────────────────
    on: (event: string, callback: (data: any) => void) => {
        return pollingService.on(event, callback);
    },

    // ─── Getters ─────────────────────────────────────────────────────────
    getUnreadCount: () => get().unreadCount,
    getNotifications: () => get().notifications,
    getLatestNotification: () => {
        const notifications = get().notifications;
        return notifications.length > 0 ? notifications[0] : null;
    },
}));

export default useNotificationStore;