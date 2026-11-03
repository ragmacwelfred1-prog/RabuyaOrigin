<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FuelProduct extends Model
{
    use HasFactory;

    protected $table = 'fuel_products';

    protected $fillable = [
        'type',
        'current_selling_price',
    ];

    protected $casts = [
        'current_selling_price' => 'decimal:2',
    ];

    public function inventories()
    {
        return $this->hasMany(FuelInventory::class, 'fuel_product_id');
    }

    public function currentStock()
    {
        return $this->inventories()
            ->where('remaining_liters', '>', 0)
            ->sum('remaining_liters');
    }

    public function latestPrice()
    {
        $latest = $this->inventories()
            ->where('remaining_liters', '>', 0)
            ->orderBy('delivery_date', 'desc')
            ->first();
        
        return $latest ? $latest->selling_price_per_liter : $this->current_selling_price;
    }
}

