<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TestEvent implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $message;
    public $data;

    public function __construct($message = 'Test notification', $data = [])
    {
        $this->message = $message;
        $this->data = $data;
    }

    public function broadcastOn()
    {
        return [
            new Channel('notifications'),
        ];
    }

    public function broadcastAs()
    {
        return 'test.event';
    }

    public function broadcastWith()
    {
        return [
            'message' => $this->message,
            'data' => $this->data,
            'timestamp' => now()->toISOString(),
        ];
    }
}
