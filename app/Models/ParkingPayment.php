<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;


class ParkingPayment extends Model
{
    protected $table = 'parking_payments';

    protected $fillable = [
        'parking_transaction_id',
        'booking_id',
        'discount',
        'amount_paid',
        'change_amount',
        'payment_method',
        'reference_number',          
        'status',
        'processed_by',
        'paymongo_checkout_session_id',
        'paymongo_payment_id',
        'paid_at',
    ];

    protected $casts = [
        'discount'      => 'float',
        'amount_paid'   => 'float',
        'change_amount' => 'float',
        'paid_at'       => 'datetime',
    ];

    public function transaction()
    {
        return $this->belongsTo(ParkingTransaction::class, 'parking_transaction_id');
    }

    public function booking()
    {
        return $this->belongsTo(Booking::class, 'booking_id');
    }

    public function processedBy()
    {
        return $this->belongsTo(User::class, 'processed_by');
    }
}
