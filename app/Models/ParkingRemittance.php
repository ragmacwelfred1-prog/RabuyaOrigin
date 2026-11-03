<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ParkingRemittance extends Model
{
    protected $table = 'parking_remittances';

    protected $fillable = [
        'staff_id',
        'remittance_date',
        'remitted_amount',
        'actual_sales_amount',
        'status',
        'reviewed_at',
    ];

    protected $casts = [
        'remittance_date'     => 'date',
        'remitted_amount'     => 'decimal:2',
        'actual_sales_amount' => 'decimal:2',
        'reviewed_at'         => 'datetime',
    ];

    // ─── Relationships ────────────────────────────────────────────────────────

    public function staff()
    {
        return $this->belongsTo(User::class, 'staff_id');
    }
}
