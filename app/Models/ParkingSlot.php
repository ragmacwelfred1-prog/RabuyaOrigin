<?php


namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ParkingSlot extends Model
{
    protected $fillable = ['slot_number', 'status', 'nightly_rate'];

    protected $casts = ['nightly_rate' => 'decimal:2'];

    public function bookings() { return $this->hasMany(Booking::class); }
    public function transactions() { return $this->hasMany(ParkingTransaction::class); }
}

