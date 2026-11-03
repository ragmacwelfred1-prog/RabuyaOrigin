<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryLog extends Model
{
    protected $table = 'inventory_logs';

    protected $fillable = [
        'fuel_inventory_id',
        'reference_id',
        'movement',
        'liters',
        'liters_before',
        'liters_after',
        'price_per_liter',
    ];

    protected $casts = [
        'liters' => 'decimal:2',
        'liters_before' => 'decimal:2',
        'liters_after' => 'decimal:2',
        'price_per_liter' => 'decimal:2',
    ];
}

