<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FuelRemittance extends Model
{
    use HasFactory;

    protected $fillable = [
        'staff_id',
        'remittance_date',
        'remitted_amount',
        'actual_sales_amount',
        'status',
        'reviewed_at',
    ];

    protected $casts = [
        'remittance_date' => 'date',
        'remitted_amount' => 'decimal:2',
        'actual_sales_amount' => 'decimal:2',
        'reviewed_at' => 'datetime',
    ];

    public function staff()
    {
        return $this->belongsTo(User::class, 'staff_id');
    }
}
