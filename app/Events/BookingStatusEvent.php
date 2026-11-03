<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class BookingStatusEvent implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $booking;
    public $status;

    /**
     * Create a new event instance.
     * 
     * @param object $booking - Booking object with customer, parkingSlot, etc.
     * @param string $status - pending|approved|rejected|completed|cancelled
     */
    public function __construct($booking, $status)
    {
        $this->booking = $booking;
        $this->status = $status;
    }

    /**
     * Get the channels the event should broadcast on.
     */
    public function broadcastOn(): array
    {
        return [
            new Channel('admin.bookings'),
            new Channel('staff.bookings'),
        ];
    }

    /**
     * The event's broadcast name.
     */
    public function broadcastAs(): string
    {
        return 'booking.status';
    }

    /**
     * Get the data to broadcast.
     */
    public function broadcastWith(): array
    {
        return [
            'booking_id' => $this->booking->id ?? null,
            'status' => $this->status,
            'customer_name' => $this->booking->customer?->first_name . ' ' . $this->booking->customer?->last_name ?? 'Unknown',
            'slot_number' => $this->booking->parkingSlot?->slot_number ?? 'N/A',
            'check_in_date' => $this->booking->check_in_date ?? null,
            'check_out_date' => $this->booking->check_out_date ?? null,
            'timestamp' => now()->toISOString(),
        ];
    }
}
