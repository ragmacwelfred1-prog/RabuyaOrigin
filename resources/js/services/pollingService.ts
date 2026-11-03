// resources/js/services/pollingService.ts
import api from './api';

export type PollingNotification = {
    id: number;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    data?: any;
    is_read: boolean;
    created_at: string;
};

type Listener = (data: any) => void;

class PollingService {
    private listeners: Map<string, Set<Listener>> = new Map();
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private lastSeenId: number = 0;
    private isRunning = false;
    private intervalMs = 5000; // 5 seconds
    private isPaused = false;
    private isPolling = false;

    // ─── Lifecycle ────────────────────────────────────────────────────────

    async start() {
        if (this.isRunning) {
            console.log('🔄 Polling already running');
            return;
        }
        this.isRunning = true;

        await this.bootstrap();
        this.scheduleNext();

        document.addEventListener('visibilitychange', this.handleVisibility);
        console.log(`🔄 Polling service started (every ${this.intervalMs}ms)`);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        document.removeEventListener('visibilitychange', this.handleVisibility);
        this.isRunning = false;
        this.isPaused = false;
        console.log('⏹ Polling service stopped');
    }

    private handleVisibility = () => {
        if (document.hidden) {
            this.isPaused = true;
            console.log('⏸ Polling paused (tab hidden)');
        } else {
            this.isPaused = false;
            console.log('▶️ Polling resumed');
            this.poll(); // immediate catch-up poll
        }
    };

    private scheduleNext() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => {
            if (!this.isPaused && !this.isPolling) this.poll();
        }, this.intervalMs);
    }

    // ─── Bootstrap: seed lastSeenId so we don't replay history ────────────

    private async bootstrap() {
        try {
            const res = await api.get('/notifications/poll', {
                params: { since_id: 0, limit: 1 },
            });
            this.lastSeenId = res.data?.latest_id ?? 0;
            console.log('🔄 Polling bootstrap: lastSeenId =', this.lastSeenId);
        } catch (e) {
            console.warn('Polling bootstrap failed:', e);
            this.lastSeenId = 0;
        }
    }

    // ─── Poll ─────────────────────────────────────────────────────────────

    private async poll() {
        this.isPolling = true;
        try {
            const res = await api.get('/notifications/poll', {
                params: { since_id: this.lastSeenId, limit: 20 },
                // 304 short-circuit
                validateStatus: (s) => s === 200 || s === 304,
            });

            // 304 = nothing new
            if (res.status === 304) {
                this.isPolling = false;
                return;
            }

            const data = res.data;
            if (!data?.success) {
                this.isPolling = false;
                return;
            }

            const incoming: PollingNotification[] = data.notifications ?? [];

            if (incoming.length > 0) {
                this.lastSeenId = incoming[incoming.length - 1].id;

                for (const n of incoming) {
                    this.emit('notification', {
                        id: n.id,
                        title: n.title,
                        message: n.message,
                        type: n.type,
                        data: n.data,
                        timestamp: n.created_at,
                        read: n.is_read,
                    });
                }
                console.log(`🔄 Poll: received ${incoming.length} new notification(s)`);
            }

            this.emit('unread_count', data.unread_count);
            this.emit('poll_success', { at: new Date().toISOString() });
        } catch (e) {
            // Silent — transient network failures shouldn't spam logs
            this.emit('poll_error', e);
        } finally {
            this.isPolling = false;
        }
    }

    /** Force an immediate poll (e.g. after user action). */
    public triggerNow() {
        if (!this.isRunning) return;
        if (!this.isPaused && !this.isPolling) this.poll();
    }

    // ─── Event system ─────────────────────────────────────────────────────

    on(event: string, callback: Listener): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
        return () => {
            this.listeners.get(event)?.delete(callback);
        };
    }

    private emit(event: string, data: any) {
        const set = this.listeners.get(event);
        if (!set) return;
        set.forEach((cb) => {
            try {
                cb(data);
            } catch (e) {
                console.error(`Error in polling listener for "${event}":`, e);
            }
        });
    }

    // ─── Status / config ──────────────────────────────────────────────────

    getStatus() {
        return {
            connected: this.isRunning && !this.isPaused,
            state: this.isRunning ? (this.isPaused ? 'paused' : 'polling') : 'stopped',
        };
    }

    setIntervalMs(ms: number) {
        this.intervalMs = Math.max(1000, ms);
        if (this.isRunning) this.scheduleNext();
        console.log(`🔄 Polling interval set to ${this.intervalMs}ms`);
    }

    getIntervalMs(): number {
        return this.intervalMs;
    }

    getLastSeenId(): number {
        return this.lastSeenId;
    }
}

export const pollingService = new PollingService();
export default pollingService;