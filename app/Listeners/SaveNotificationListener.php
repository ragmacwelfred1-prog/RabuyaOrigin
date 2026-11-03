<?php

namespace App\Listeners;

use App\Events\NotificationEvent;
use App\Models\UserNotification;
use Illuminate\Support\Facades\Log;

class SaveNotificationListener
{
    /**
     * Handle the event.
     */
    public function handle(NotificationEvent $event): void
    {
        try {
            $data = $event->data;
            $userId = $event->userId;

            // If userId is provided, save for that specific user
            if ($userId) {
                UserNotification::create([
                    'user_id' => $userId,
                    'title' => $data['title'] ?? 'Notification',
                    'message' => $data['message'] ?? '',
                    'type' => $data['type'] ?? 'info',
                    'data' => $data['data'] ?? null,
                ]);
                return;
            }

            // If no userId, save for all admin and staff users (public notifications)
            $users = \App\Models\User::whereIn('role', ['admin', 'staff'])->get();
            foreach ($users as $user) {
                UserNotification::create([
                    'user_id' => $user->id,
                    'title' => $data['title'] ?? 'Notification',
                    'message' => $data['message'] ?? '',
                    'type' => $data['type'] ?? 'info',
                    'data' => $data['data'] ?? null,
                ]);
            }
        } catch (\Exception $e) {
            Log::error('Failed to save notification: ' . $e->getMessage());
        }
    }
}
