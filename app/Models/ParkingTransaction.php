<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;


class ParkingTransaction extends Model
{
    protected $fillable = [
        'booking_id',
        'check_out_date',
        'checked_in_by',
    ];

    protected $casts = [
        'check_out_date' => 'datetime',
    ];

    // ─── Relationships ────────────────────────────────────────────────────────

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function payment()
    {
        return $this->hasOne(ParkingPayment::class);
    }

    public function checkedInBy()
    {
        return $this->belongsTo(User::class, 'checked_in_by');
    }

   
    public function getRatePerNightAttribute(): float
    {
        return (float) ($this->booking?->parkingSlot?->nightly_rate ?? 250);
    }

    // ─── Computed helpers (delegate to payment row) ───────────────────────────

    public function getStatusAttribute(): string
    {
        return $this->payment?->status ?? 'unpaid';
    }

    public function getPaymentAmountAttribute(): float
    {
        return (float) ($this->payment?->payment ?? 0);
    }

    public function getDiscountAttribute(): float
    {
        return (float) ($this->payment?->discount ?? 0);
    }

    public function getAmountPaidAttribute(): float
    {
        return (float) ($this->payment?->amount_paid ?? 0);
    }

    public function getChangeAmountAttribute(): float
    {
        return (float) ($this->payment?->change_amount ?? 0);
    }

    public function getPaymentMethodAttribute(): string
    {
        return $this->payment?->payment_method ?? 'cash';
    }
}
