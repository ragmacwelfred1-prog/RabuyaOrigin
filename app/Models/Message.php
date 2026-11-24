<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Message extends Model
{
    protected $fillable = [
        'conversation_id',
        'sender_id',
        'body',
        'image_path',
        'image_original_name',
        'is_read',
    ];

    protected $casts = [
        'is_read' => 'boolean',
    ];

    protected $appends = ['image_url'];

    public function conversation()
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sender()
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function getImageUrlAttribute(): ?string
    {
        if (! $this->image_path) {
            return null;
        }

        // Serve uploaded chat images through the custom shared-hosting route.
        return url('/sfiles/' . ltrim($this->image_path, '/'));
    }
}