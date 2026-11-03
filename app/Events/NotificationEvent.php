<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NotificationEvent implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $notification;
    public $userId;

    /**
     * Create a new event instance.
     * 
     * @param array $notification - ['type' => 'success|error|warning|info', 'title' => string, 'message' => string, 'data' => array]
     * @param int|null $userId - If provided, sends private notification to specific user
     */
    public function __construct(array $notification, $userId = null)
    {
        $this->notification = [
            'id' => $notification['id'] ?? uniqid(),
            'type' => $notification['type'] ?? 'info',
            'title' => $notification['title'] ?? 'Notification',
            'message' => $notification['message'] ?? '',
            'data' => $notification['data'] ?? [],
            'timestamp' => now()->toISOString(),
        ];
        $this->userId = $userId;
    }

    /**
     * Get the channels the event should broadcast on.
     */
    public function broadcastOn(): array
    {
        if ($this->userId) {
            return [
                new PrivateChannel('user.' . $this->userId),
            ];
        }

        return [
            new Channel('notifications'),
        ];
    }

    /**
     * The event's broadcast name.
     */
    public function broadcastAs(): string
    {
        return 'notification';
    }

    /**
     * Get the data to broadcast.
     */
    public function broadcastWith(): array
    {
        return $this->notification;
    }
}
