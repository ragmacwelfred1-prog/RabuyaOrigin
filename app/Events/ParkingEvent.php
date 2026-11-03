<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ParkingEvent implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $transaction;
    public $action;

    /**
     * Create a new event instance.
     * 
     * @param object $transaction - ParkingTransaction object
     * @param string $action - checkin|checkout
     */
    public function __construct($transaction, $action)
    {
        $this->transaction = $transaction;
        $this->action = $action;
    }

    /**
     * Get the channels the event should broadcast on.
     */
    public function broadcastOn(): array
    {
        return [
            new Channel('admin.parking'),
            new Channel('staff.parking'),
        ];
    }

    /**
     * The event's broadcast name.
     */
    public function broadcastAs(): string
    {
        return 'parking.update';
    }

    /**
     * Get the data to broadcast.
     */
    public function broadcastWith(): array
    {
        $booking = $this->transaction->booking ?? null;
        $customer = $booking?->customer ?? null;
        $slot = $booking?->parkingSlot ?? null;

        return [
            'id' => $this->transaction->id ?? null,
            'action' => $this->action,
            'customer_name' => ($customer?->first_name ?? '') . ' ' . ($customer?->last_name ?? ''),
            'slot_number' => $slot?->slot_number ?? 'N/A',
            'booking_id' => $booking?->id ?? null,
            'timestamp' => now()->toISOString(),
        ];
    }
}
