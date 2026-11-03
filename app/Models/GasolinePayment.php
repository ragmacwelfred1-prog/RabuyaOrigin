<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;


class GasolinePayment extends Model
{
    protected $table = 'gasoline_payments';

    protected $fillable = [
        'fuel_sale_id',
        'amount_paid',
        'change_amount',
        'payment_method',
        'status',
        'processed_by',
    ];

    protected $casts = [
        'amount_paid'  => 'float',
        'change_amount'=> 'float',
    ];

    public function sale()
    {
        return $this->belongsTo(FuelSale::class, 'fuel_sale_id');
    }

    public function processedBy()
    {
        return $this->belongsTo(User::class, 'processed_by');
    }
}

