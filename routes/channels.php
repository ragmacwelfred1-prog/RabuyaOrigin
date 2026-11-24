<?php

use App\Models\Conversation;
use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels
|--------------------------------------------------------------------------
*/

// Public channel - no authentication required
Broadcast::channel('notifications', function () {
    return true;
});

Broadcast::channel('admin.bookings', function () {
    return true;
});

Broadcast::channel('staff.bookings', function () {
    return true;
});

Broadcast::channel('staff.parking', function () {
    return true;
});

Broadcast::channel('admin.parking', function () {
    return true;
});

// Private channel - user can only access their own channel
Broadcast::channel('user.{userId}', function ($user, $userId) {
    return (int) $user->id === (int) $userId;
});

// Admin private channel
Broadcast::channel('admin.{userId}', function ($user, $userId) {
    return (int) $user->id === (int) $userId
        && $user->role === 'admin';
});

// Staff private channel
Broadcast::channel('staff.{userId}', function ($user, $userId) {
    return (int) $user->id === (int) $userId
        && in_array($user->role, ['staff', 'admin'], true);
});

// ─── Chat conversation channel ───────────────────────────────────────────

Broadcast::channel('conversation.{conversationId}', function ($user, $conversationId) {

    $conversation = Conversation::find($conversationId);

    if (!$conversation) {
        return false;
    }

    // STAFF ↔ ADMIN conversation
    // Admin can access all staff conversations.
    // Staff can only access their own conversation with admin.
    if ($conversation->type === 'staff') {
        return $user->role === 'admin'
            || (int) $conversation->customer_id === (int) $user->id;
    }

    // CUSTOMER conversation
    // Customers can only access their own conversations.
    if ($user->role === 'customer') {
        return (int) $conversation->customer_id === (int) $user->id;
    }

    // Admin / staff can access customer conversations
    // only when assigned as the handler (staff_id).
    return in_array($user->role, ['admin', 'staff'], true)
        && (int) $conversation->staff_id === (int) $user->id;
});

