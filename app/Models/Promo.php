<?php


namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Promo extends Model
{
    protected $table = 'promo';

    protected $fillable = [
        'title',
        'description',
        'discount',
        'user_id',
    ];

    protected $casts = [
        'discount' => 'decimal:2',
    ];

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'user_id');
    }


}
