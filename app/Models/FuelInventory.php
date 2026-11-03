<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FuelInventory extends Model
{
    protected $table = 'fuel_inventory';
    
    protected $fillable = [
        'fuel_product_id',
        'supplier_id',
        'delivery_date',
        'liters_delivered',
        'remaining_liters',
        'cost_price_per_liter',
        'selling_price_per_liter',
        'reference_no',
    ];
    
    protected $casts = [
        'delivery_date' => 'date',
        'liters_delivered' => 'decimal:2',
        'remaining_liters' => 'decimal:2',
        'cost_price_per_liter' => 'decimal:2',
        'selling_price_per_liter' => 'decimal:2',
    ];
    
    public function fuelProduct()
    {
        return $this->belongsTo(FuelProduct::class, 'fuel_product_id');
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }
    
    public function sales()
    {
        return $this->hasMany(FuelSale::class, 'fuel_inventory_id');
    }
}

