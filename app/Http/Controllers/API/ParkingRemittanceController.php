<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\API\Concerns\ManagesRemittances;
use App\Http\Controllers\Controller;
use App\Models\ParkingPayment;
use App\Models\ParkingRemittance;
use Illuminate\Support\Facades\DB;

class ParkingRemittanceController extends Controller
{
    use ManagesRemittances;

    protected function remittanceModel(): string { return ParkingRemittance::class; }
    protected function remittanceLabel(): string { return 'Parking'; }
    protected function staffRoute(): string      { return '/(staff)/parking-remittance'; }
    protected function adminRoute(): string      { return '/parking-remittances'; }

    /** Net cash collected today by this staff (amount_paid - change), cash only. */
    protected function computeTodayCollection(int $staffId): float
    {
        $total = ParkingPayment::where('status', 'paid')
            ->where('processed_by', $staffId)
            ->where('payment_method', 'cash')
            ->whereNotNull('parking_transaction_id')   // exclude GCash downpayment rows
            ->whereDate('created_at', now()->toDateString())
            ->sum(DB::raw('amount_paid - change_amount'));

        return round(max(0, (float) $total), 2);
    }
}