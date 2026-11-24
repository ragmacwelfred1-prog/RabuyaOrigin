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

        // Relative URL: the web admin resolves it against its own origin, so it
        // no longer depends on APP_URL / http-vs-https. The mobile app builds
        // its own absolute URL from image_path (see resolveImageUrl).
        return '/sfiles/' . ltrim($this->image_path, '/');
    }
}