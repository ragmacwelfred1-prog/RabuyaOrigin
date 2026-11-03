<?php


namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Vehicle extends Model
{
    protected $fillable = ['customer_id', 'plate_number', 'vehicle_model'];

    public function customer() { return $this->belongsTo(User::class, 'customer_id'); }
}

