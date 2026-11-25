<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\API\Concerns\ManagesRemittances;
use App\Http\Controllers\Controller;
use App\Models\FuelRemittance;
use App\Models\FuelSale;
use Illuminate\Support\Facades\DB;

class FuelRemittanceController extends Controller
{
    use ManagesRemittances;

    protected function remittanceModel(): string { return FuelRemittance::class; }
    protected function remittanceLabel(): string { return 'Fuel'; }
    protected function staffRoute(): string      { return '/(staff)/gasoline'; }
    protected function adminRoute(): string      { return '/fuel-products'; }

    protected function computeTodayCollection(int $staffId): float
    {
        $total = FuelSale::where('recorded_by', $staffId)
            ->whereDate('sale_date', now()->toDateString())
            ->sum(DB::raw('liters_sold * price_per_liter'));

        return round((float) $total, 2);
    }
}