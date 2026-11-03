<?php

namespace App\Http\Controllers\API;

use App\Events\MessageSent;
use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ChatController extends Controller
{
    // ─── Helper: determine the peer (kausap) of the viewer ────────────────────
    private function peerFor(User $viewer, Conversation $c): ?User
    {
        if ($c->type === 'staff') {
            // admin ang kausap ni staff, staff ang kausap ni admin
            return $viewer->role === 'admin'
                ? $c->customer
                : ($c->staff ?? User::where('role', 'admin')->first());
        }
        return $c->customer;
    }

    // ─── Access rule ──────────────────────────────────────────────────────────
    private function canAccess(User $user, Conversation $c): bool
    {
        if ($c->type === 'staff') {
            return $user->role === 'admin' || (int) $c->customer_id === (int) $user->id;
        }
        if ($user->role === 'customer') {
            return (int) $c->customer_id === (int) $user->id;
        }
        return in_array($user->role, ['admin', 'staff']);
    }

    // ─── Customer / Staff: get or create own conversation ─────────────────────
    public function getOrCreateConversation(Request $request)
    {
        $user = $request->user();

        if (!in_array($user->role, ['customer', 'staff'])) {
            return response()->json(['message' => 'Not allowed'], 403);
        }

        $conversation = Conversation::firstOrCreate(
            ['customer_id' => $user->id],
            [
                'staff_id' => $user->role === 'staff'
                    ? optional(User::where('role', 'admin')->where('is_active', true)->first())->id
                    : null,
                'type' => $user->role === 'staff' ? 'staff' : 'customer',
            ]
        );

        $conversation->load([
            'latestMessage.sender:id,first_name,last_name,role',
            'staff:id,first_name,last_name,role',
        ]);

        return response()->json(['success' => true, 'conversation' => $conversation]);
    }

    // ─── Contacts ─────────────────────────────────────────────────────────────
    public function contacts(Request $request)
    {
        $user = $request->user();

        if (!in_array($user->role, ['admin', 'staff'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $search = trim((string) $request->query('search', ''));
        $filter = $request->query('role');

        // Admin: customers + staff | Staff: customers + admin
        $roles = $user->role === 'admin' ? ['customer', 'staff'] : ['customer', 'admin'];
        if (in_array($filter, $roles, true)) {
            $roles = [$filter];
        }

        $query = User::whereIn('role', $roles)
            ->where('is_active', true)
            ->where('id', '!=', $user->id)
            ->with('vehicles')
            ->orderBy('first_name')
            ->orderBy('last_name');

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone_number', 'like', "%{$search}%")
                  ->orWhere('employee_id', 'like', "%{$search}%")
                  ->orWhereHas('vehicles', fn ($v) => $v->where('plate_number', 'like', "%{$search}%"));
            });
        }

        $users = $query->get();

        // Conversations keyed by customer_id (customer at staff-for-admin)
        $conversations = Conversation::whereIn('customer_id', $users->where('role', '!=', 'admin')->pluck('id'))
            ->with('latestMessage')
            ->get()
            ->keyBy('customer_id');

        // Para sa STAFF: ang chat nila kay admin = sarili nilang "staff" conversation
        $ownConv = $user->role === 'staff'
            ? Conversation::where('customer_id', $user->id)->with('latestMessage')->first()
            : null;

        $convIds = $conversations->pluck('id');
        if ($ownConv) {
            $convIds->push($ownConv->id);
        }

        $unreadMap = Message::selectRaw('conversation_id, COUNT(*) as c')
            ->whereIn('conversation_id', $convIds)
            ->where('sender_id', '!=', $user->id)
            ->where('is_read', false)
            ->groupBy('conversation_id')
            ->pluck('c', 'conversation_id');

        $contacts = $users->map(function (User $u) use ($conversations, $unreadMap, $user, $ownConv) {
            $conv = ($user->role === 'staff' && $u->role === 'admin')
                ? $ownConv
                : $conversations->get($u->id);

            $vehicle = $u->vehicles->sortByDesc('created_at')->first();

            return [
                'id'              => $u->id,
                'role'            => $u->role,
                'first_name'      => $u->first_name,
                'last_name'       => $u->last_name,
                'full_name'       => trim($u->first_name . ' ' . $u->last_name),
                'email'           => $u->email,
                'phone_number'    => $u->phone_number,
                'employee_id'     => $u->employee_id,
                'plate_number'    => $vehicle?->plate_number ?? '',
                'conversation_id' => $conv?->id,
                'has_chat'        => (bool) $conv,
                'unread_count'    => (int) ($unreadMap[$conv?->id] ?? 0),
                'latest_message'  => $conv?->latestMessage ? [
                    'body'       => $conv->latestMessage->body,
                    'sender_id'  => $conv->latestMessage->sender_id,
                    'created_at' => $conv->latestMessage->created_at,
                ] : null,
                'last_message_at' => $conv?->last_message_at,
            ];
        });

        $sorted = $contacts->sort(function ($a, $b) {
            if (($a['unread_count'] > 0) !== ($b['unread_count'] > 0)) {
                return $a['unread_count'] > 0 ? -1 : 1;
            }
            if ($a['has_chat'] !== $b['has_chat']) {
                return $a['has_chat'] ? -1 : 1;
            }
            if ($a['has_chat'] && $b['has_chat']) {
                return strcmp((string) $b['last_message_at'], (string) $a['last_message_at']);
            }
            return strcasecmp($a['full_name'], $b['full_name']);
        })->values();

        return response()->json(['success' => true, 'contacts' => $sorted]);
    }

    // ─── Start / open conversation ────────────────────────────────────────────
    public function startWithContact(Request $request)
    {
        $user = $request->user();

        if (!in_array($user->role, ['admin', 'staff'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate(['contact_id' => 'required|exists:users,id']);

        $contact = User::findOrFail($request->contact_id);

        $allowed = $user->role === 'admin' ? ['customer', 'staff'] : ['customer', 'admin'];
        if (!in_array($contact->role, $allowed, true) || $contact->id === $user->id) {
            return response()->json(['message' => 'Invalid contact'], 422);
        }

        // STAFF -> ADMIN: gamitin ang sariling "staff" conversation ng staff
        if ($user->role === 'staff' && $contact->role === 'admin') {
            $conversation = Conversation::firstOrCreate(
                ['customer_id' => $user->id],
                ['staff_id' => $contact->id, 'type' => 'staff']
            );

            return response()->json(['success' => true, 'conversation' => $conversation]);
        }

        // ADMIN -> STAFF  /  ADMIN|STAFF -> CUSTOMER
        $conversation = Conversation::firstOrCreate(
            ['customer_id' => $contact->id],
            [
                'staff_id' => $user->id,
                'type'     => $contact->role === 'staff' ? 'staff' : 'customer',
            ]
        );

        if ($conversation->type === 'customer' && !$conversation->staff_id) {
            $conversation->update(['staff_id' => $user->id]);
        }

        return response()->json(['success' => true, 'conversation' => $conversation]);
    }

    // ─── List conversations ───────────────────────────────────────────────────
    // ─── List conversations (kasama ang contacts na wala pang chat) ───────────
public function index(Request $request)
{
    $user = $request->user();

    if (!in_array($user->role, ['admin', 'staff'])) {
        return response()->json(['message' => 'Unauthorized'], 403);
    }

    // ─── Step 1: Kunin lahat ng possible contacts ─────────────────────────
    $roles = $user->role === 'admin' ? ['customer', 'staff'] : ['customer', 'admin'];

    $contacts = User::whereIn('role', $roles)
        ->where('is_active', true)
        ->where('id', '!=', $user->id)
        ->get();

    $contactIds = $contacts->pluck('id');

    // ─── Step 2: Kunin lahat ng conversations (customers + own staff conv) ─
    $conversations = Conversation::with([
            'customer:id,first_name,last_name,email,phone_number,role',
            'latestMessage.sender:id,first_name,last_name,role',
            'staff:id,first_name,last_name,role',
        ])
        ->where(function ($q) use ($user, $contactIds) {
            // Customer conversations (lahat ng customers)
            $q->where(function ($w) use ($contactIds) {
                $w->where('type', 'customer')
                  ->whereIn('customer_id', $contactIds);
            });

            // Own staff conversation (staff ↔ admin)
            if ($user->role === 'staff') {
                $q->orWhere(function ($w) use ($user) {
                    $w->where('type', 'staff')
                      ->where('customer_id', $user->id);
                });
            }

            // Para sa admin: lahat ng staff conversations
            if ($user->role === 'admin') {
                $q->orWhere('type', 'staff');
            }
        })
        ->get()
        ->keyBy(function ($c) use ($user) {
            // I-key by "peer id" para madaling i-match sa contacts
            if ($c->type === 'staff') {
                return $user->role === 'admin'
                    ? (int) $c->customer_id       // admin → staff
                    : (int) ($c->staff_id ?? 0);  // staff → admin
            }
            return (int) $c->customer_id;          // customer
        });

    // ─── Step 3: Unread counts ────────────────────────────────────────────
    $convIds = $conversations->pluck('id');

    $unreadMap = Message::selectRaw('conversation_id, COUNT(*) as c')
        ->whereIn('conversation_id', $convIds)
        ->where('sender_id', '!=', $user->id)
        ->where('is_read', false)
        ->groupBy('conversation_id')
        ->pluck('c', 'conversation_id');

    // ─── Step 4: I-merge ang contacts + conversations ─────────────────────
    $items = $contacts->map(function (User $u) use ($conversations, $unreadMap, $user) {
        $conv = $conversations->get((int) $u->id);

        return [
            'id'              => $conv?->id ?? ('contact-' . $u->id), // unique key
            'conversation_id' => $conv?->id,
            'contact'         => [
                'id'        => $u->id,
                'role'      => $u->role,
                'full_name' => trim($u->first_name . ' ' . $u->last_name),
                'email'     => $u->email,
                'phone_number' => $u->phone_number,
                'employee_id'  => $u->employee_id,
            ],
            'has_chat'        => (bool) $conv,
            'unread_count'    => (int) ($unreadMap[$conv?->id] ?? 0),
            'latest_message'  => $conv?->latestMessage ? [
                'body'       => $conv->latestMessage->body,
                'sender_id'  => $conv->latestMessage->sender_id,
                'created_at' => $conv->latestMessage->created_at,
            ] : null,
            'last_message_at' => $conv?->last_message_at,
            // Para sa compatibility sa lumang frontend
            'customer'        => $conv?->customer,
            'staff'           => $conv?->staff,
        ];
    });

    // ─── Step 5: Sort — unread → may chat → alphabetical ──────────────────
    $sorted = $items->sort(function ($a, $b) {
        if (($a['unread_count'] > 0) !== ($b['unread_count'] > 0)) {
            return $a['unread_count'] > 0 ? -1 : 1;
        }
        if ($a['has_chat'] !== $b['has_chat']) {
            return $a['has_chat'] ? -1 : 1;
        }
        if ($a['has_chat'] && $b['has_chat']) {
            return strcmp((string) $b['last_message_at'], (string) $a['last_message_at']);
        }
        return strcasecmp($a['contact']['full_name'], $b['contact']['full_name']);
    })->values();

    return response()->json(['success' => true, 'conversations' => $sorted]);
}

    // ─── Get messages ─────────────────────────────────────────────────────────
    public function messages(Request $request, $conversationId)
    {
        $user = $request->user();
        $conversation = Conversation::findOrFail($conversationId);

        if (!$this->canAccess($user, $conversation)) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $messages = Message::where('conversation_id', $conversationId)
            ->when($request->filled('after_id'), fn ($q) => $q->where('id', '>', (int) $request->after_id))
            ->with('sender:id,first_name,last_name,role')
            ->orderBy('id')
            ->get();

        Message::where('conversation_id', $conversationId)
            ->where('sender_id', '!=', $user->id)
            ->where('is_read', false)
            ->update(['is_read' => true]);

        return response()->json(['success' => true, 'messages' => $messages]);
    }

    // ─── Send message ─────────────────────────────────────────────────────────
        // ─── Send message (text or image or both) ────────────────────────────────
    public function send(Request $request, $conversationId)
    {
        $request->validate([
            'body'  => 'nullable|string|max:2000',
            'image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        if (! $request->filled('body') && ! $request->hasFile('image')) {
            return response()->json([
                'message' => 'Message must contain text or an image.',
            ], 422);
        }

        $user = $request->user();
        $conversation = Conversation::findOrFail($conversationId);

        if (! $this->canAccess($user, $conversation)) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if (
            $conversation->type === 'customer' &&
            in_array($user->role, ['admin', 'staff']) &&
            ! $conversation->staff_id
        ) {
            $conversation->update(['staff_id' => $user->id]);
        }

        // ─── Handle image upload ─────────────────────────────────────
        $imagePath = null;
        $imageName = null;

        if ($request->hasFile('image')) {
            $file      = $request->file('image');
            $imageName = $file->getClientOriginalName();
            $imagePath = $file->store('chat_images', 'public');
        }

        $message = Message::create([
            'conversation_id'     => $conversation->id,
            'sender_id'           => $user->id,
            'body'                => $request->input('body') ? trim($request->input('body')) : null,
            'image_path'          => $imagePath,
            'image_original_name' => $imageName,
            'is_read'             => false,
        ]);

        $conversation->update(['last_message_at' => now()]);

        // Broadcast to other participants (protected — no crash if Reverb is down)
        try {
            broadcast(new MessageSent($message))->toOthers();
        } catch (\Throwable $e) {
            Log::warning('Chat broadcast failed: ' . $e->getMessage());
        }

        $message->load('sender:id,first_name,last_name,role');

        return response()->json([
            'success' => true,
            'message' => $message,
        ], 201);
    }
    // ─── Unread count ─────────────────────────────────────────────────────────
    public function unreadCount(Request $request)
    {
        $user = $request->user();

        if ($user->role === 'customer') {
            $conversation = Conversation::where('customer_id', $user->id)->first();
            if (!$conversation) {
                return response()->json(['unread' => 0]);
            }
            $count = Message::where('conversation_id', $conversation->id)
                ->where('sender_id', '!=', $user->id)
                ->where('is_read', false)
                ->count();

            return response()->json(['unread' => $count]);
        }

        if ($user->role === 'staff') {
            $count = Message::where('sender_id', '!=', $user->id)
                ->where('is_read', false)
                ->whereHas('conversation', function ($q) use ($user) {
                    $q->where('type', 'customer')
                      ->orWhere(fn ($x) => $x->where('type', 'staff')->where('customer_id', $user->id));
                })
                ->count();

            return response()->json(['unread' => $count]);
        }

        // Admin
        $count = Message::where('sender_id', '!=', $user->id)
            ->where('is_read', false)
            ->count();

        return response()->json(['unread' => $count]);
    }
}
