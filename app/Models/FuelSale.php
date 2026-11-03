<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FuelSale extends Model
{
    use HasFactory;

    protected $fillable = [
        'fuel_inventory_id',
        'recorded_by',
        'sale_date',
        'liters_sold',
        'price_per_liter',
        'customer_name',
    ];

    protected $casts = [
        'sale_date'       => 'datetime',
        'liters_sold'     => 'float',
        'price_per_liter' => 'float',
    ];

    public function inventory()
    {
        return $this->belongsTo(FuelInventory::class, 'fuel_inventory_id');
    }

    public function recordedBy()
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function gasolinePayment()
    {
        return $this->hasOne(GasolinePayment::class, 'fuel_sale_id');
    }

    public function fuelProduct()
    {
        return $this->hasOneThrough(
            FuelProduct::class,
            FuelInventory::class,
            'id',
            'id',
            'fuel_inventory_id',
            'fuel_product_id'
        );
    }

    public function getTotalAmountAttribute(): float
    {
        return round((float) $this->liters_sold * (float) $this->price_per_liter, 2);
    }

    public function getAmountPaidAttribute(): float
    {
        return (float) ($this->gasolinePayment?->amount_paid ?? 0);
    }

    public function getChangeAmountAttribute(): float
    {
        return (float) ($this->gasolinePayment?->change_amount ?? 0);
    }

    public function getPaymentMethodAttribute(): string
    {
        return $this->gasolinePayment?->payment_method ?? 'cash';
    }

    public function getTransactionNumberAttribute(): string
    {
        return 'FUL-' . str_pad($this->id, 6, '0', STR_PAD_LEFT);
    }
}
