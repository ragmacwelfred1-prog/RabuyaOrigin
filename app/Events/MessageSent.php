<?php

namespace App\Events;

use App\Models\Message;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MessageSent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Message $message)
    {
        $this->message->load('sender:id,first_name,last_name,role');
    }

    public function broadcastOn(): array
    {
        return [new PrivateChannel('conversation.' . $this->message->conversation_id)];
    }

    public function broadcastAs(): string
    {
        return 'message.sent';
    }

    public function broadcastWith(): array
    {
        return [
            'id'                  => $this->message->id,
            'conversation_id'     => $this->message->conversation_id,
            'sender_id'           => $this->message->sender_id,
            'body'                => $this->message->body,
            'image_path'          => $this->message->image_path,
            'image_url'           => $this->message->image_url,
            'image_original_name' => $this->message->image_original_name,
            'is_read'             => $this->message->is_read,
            'created_at'          => $this->message->created_at?->toISOString(),
            'sender'              => [
                'id'         => $this->message->sender?->id,
                'first_name' => $this->message->sender?->first_name,
                'last_name'  => $this->message->sender?->last_name,
                'role'       => $this->message->sender?->role,
            ],
        ];
    }
}