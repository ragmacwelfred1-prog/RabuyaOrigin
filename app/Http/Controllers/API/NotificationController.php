<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\UserNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class NotificationController extends Controller
{
    /**
     * Get all notifications for the authenticated user
     */
    public function index(Request $request)
    {
        try {
            $user = $request->user();

            $query = UserNotification::where('user_id', $user->id);

            if ($request->has('is_read')) {
                $query->where('is_read', $request->is_read);
            }

            $limit = $request->input('limit', 50);

            $notifications = $query->orderBy('created_at', 'desc')
                ->limit($limit)
                ->get()
                ->map(function ($notification) {
                    return [
                        'id'         => $notification->id,
                        'title'      => $notification->title,
                        'message'    => $notification->message,
                        'type'       => $notification->type,
                        'data'       => $notification->data,
                        'is_read'    => (bool) $notification->is_read,
                        'read_at'    => $notification->read_at,
                        'created_at' => $notification->created_at,
                        'updated_at' => $notification->updated_at,
                    ];
                });

            $unreadCount = UserNotification::where('user_id', $user->id)
                ->where('is_read', false)
                ->count();

            return response()->json([
                'success'       => true,
                'notifications' => $notifications,
                'unread_count'  => $unreadCount,
                'total'         => UserNotification::where('user_id', $user->id)->count(),
            ]);
        } catch (\Exception $e) {
            Log::error('Get notifications error: ' . $e->getMessage());
            return response()->json([
                'success'       => false,
                'message'       => 'Failed to fetch notifications',
                'notifications' => [],
                'unread_count'  => 0,
                'total'         => 0,
            ], 500);
        }
    }

    /**
     * Poll for notifications newer than `since_id`.
     */
    public function poll(Request $request)
    {
        try {
            $user    = $request->user();
            $sinceId = (int) $request->input('since_id', 0);
            $limit   = min((int) $request->input('limit', 20), 50);

            $newNotifications = UserNotification::where('user_id', $user->id)
                ->where('id', '>', $sinceId)
                ->orderBy('id', 'asc')
                ->limit($limit)
                ->get()
                ->map(fn ($n) => [
                    'id'         => $n->id,
                    'title'      => $n->title,
                    'message'    => $n->message,
                    'type'       => $n->type,
                    'data'       => $n->data,
                    'is_read'    => (bool) $n->is_read,
                    'created_at' => $n->created_at,
                ]);

            $unreadCount = UserNotification::where('user_id', $user->id)
                ->where('is_read', false)
                ->count();

            $latestId = UserNotification::where('user_id', $user->id)
                ->max('id') ?? 0;

            $etag = 'W/"' . $user->id . '-' . $latestId . '-' . $unreadCount . '-' . $sinceId . '"';

            if ($request->header('If-None-Match') === $etag) {
                return response()->noContent(304)->header('ETag', $etag);
            }

            return response()
                ->json([
                    'success'       => true,
                    'notifications' => $newNotifications,
                    'unread_count'  => $unreadCount,
                    'latest_id'     => (int) $latestId,
                    'server_time'   => now()->toIso8601String(),
                ])
                ->header('ETag', $etag);
        } catch (\Exception $e) {
            Log::error('Poll notifications error: ' . $e->getMessage());
            return response()->json([
                'success'       => false,
                'notifications' => [],
                'unread_count'  => 0,
                'latest_id'     => 0,
            ], 500);
        }
    }

    /**
     * Get unread count
     */
    public function unreadCount(Request $request)
    {
        try {
            $count = UserNotification::where('user_id', $request->user()->id)
                ->where('is_read', false)
                ->count();

            return response()->json([
                'success'      => true,
                'unread_count' => $count,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success'      => false,
                'unread_count' => 0,
            ], 500);
        }
    }

    /**
     * Mark notification as read — graceful 404 instead of 500.
     */
    public function markAsRead(Request $request, $id)
    {
        try {
            // Use first() instead of findOrFail() so we can return a clean 404
            $notification = UserNotification::where('user_id', $request->user()->id)
                ->where('id', $id)
                ->first();

            if (! $notification) {
                return response()->json([
                    'success' => false,
                    'message' => 'Notification not found or does not belong to you.',
                ], 404);
            }

            // Already read? Just confirm (idempotent).
            if (! $notification->is_read) {
                $notification->markAsRead();
            }

            return response()->json([
                'success' => true,
                'message' => 'Notification marked as read',
            ]);
        } catch (\Exception $e) {
            Log::error('markAsRead error: ' . $e->getMessage(), [
                'notification_id' => $id,
                'user_id'         => $request->user()?->id,
            ]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to mark as read',
            ], 500);
        }
    }

    /**
     * Mark all notifications as read
     */
    public function markAllAsRead(Request $request)
    {
        try {
            UserNotification::where('user_id', $request->user()->id)
                ->where('is_read', false)
                ->update([
                    'is_read' => true,
                    'read_at' => now(),
                ]);

            return response()->json([
                'success' => true,
                'message' => 'All notifications marked as read',
            ]);
        } catch (\Exception $e) {
            Log::error('markAllAsRead error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to mark all as read',
            ], 500);
        }
    }

    /**
     * Delete a notification — graceful 404 instead of 500.
     */
    public function destroy(Request $request, $id)
    {
        try {
            $notification = UserNotification::where('user_id', $request->user()->id)
                ->where('id', $id)
                ->first();

            if (! $notification) {
                return response()->json([
                    'success' => false,
                    'message' => 'Notification not found or already deleted.',
                ], 404);
            }

            $notification->delete();

            return response()->json([
                'success' => true,
                'message' => 'Notification deleted',
            ]);
        } catch (\Exception $e) {
            Log::error('destroy notification error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete notification',
            ], 500);
        }
    }

    /**
     * Delete all notifications
     */
    public function destroyAll(Request $request)
    {
        try {
            UserNotification::where('user_id', $request->user()->id)->delete();

            return response()->json([
                'success' => true,
                'message' => 'All notifications deleted',
            ]);
        } catch (\Exception $e) {
            Log::error('destroyAll notifications error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete all notifications',
            ], 500);
        }
    }

    /**
     * Create a notification for a user (persisted only — no broadcasting).
     */
    public static function createNotification($userId, $title, $message, $type = 'info', $data = null)
    {
        try {
            return UserNotification::create([
                'user_id' => $userId,
                'title'   => $title,
                'message' => $message,
                'type'    => $type,
                'data'    => $data,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to create notification: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Create notification for multiple users
     */
    public static function createBulkNotification($userIds, $title, $message, $type = 'info', $data = null)
    {
        $notifications = [];
        foreach ($userIds as $userId) {
            $n = self::createNotification($userId, $title, $message, $type, $data);
            if ($n) $notifications[] = $n;
        }
        return $notifications;
    }
}
