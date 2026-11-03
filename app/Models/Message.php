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

        // Gamitin ang host na ginamit ng request mismo (LAN IP ng phone),
        // hindi ang APP_URL na localhost.
        $base = request()
            ? rtrim(request()->getSchemeAndHttpHost(), '/')
            : rtrim(config('app.url'), '/');

        return $base . '/storage/' . ltrim($this->image_path, '/');
    }
}