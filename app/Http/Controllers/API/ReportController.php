<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\ParkingTransaction;
use App\Models\ParkingPayment;
use App\Models\FuelSale;
use App\Models\GasolinePayment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ReportController extends Controller
{
    // ─── Generate report ──────────────────────────────────────────────────────

    public function generateReport(Request $request)
    {
        try {
            $request->validate([
                'type'            => 'required|in:parking,fuel,combined',
                'start_date'      => 'required|date',
                'end_date'        => 'required|date|after_or_equal:start_date',
                'fuel_product_id' => 'nullable|exists:fuel_products,id',   // ← NEW
            ]);

            $startDate     = Carbon::parse($request->start_date)->startOfDay();
            $endDate       = Carbon::parse($request->end_date)->endOfDay();
            $reportType    = $request->type;
            $fuelProductId = $request->filled('fuel_product_id') ? (int) $request->fuel_product_id : null; // ← NEW

            $response = [
                'transactions' => [],
                'summary'      => [],
                'date_range'   => [
                    'start' => $startDate->format('Y-m-d'),
                    'end'   => $endDate->format('Y-m-d'),
                ],
            ];

            if ($reportType === 'parking' || $reportType === 'combined') {
                $parkingData = $this->getParkingReportData($startDate, $endDate);
                $response['transactions']                    = array_merge($response['transactions'], $parkingData['transactions']);
                $response['summary']['parking_revenue']      = $parkingData['revenue'];
                $response['summary']['parking_cost']         = $parkingData['cost'];
                $response['summary']['parking_profit']       = $parkingData['profit'];
                $response['summary']['total_parking_nights'] = $parkingData['total_nights'];
                $response['summary']['parking_transactions'] = $parkingData['count'];
            }

            if ($reportType === 'fuel' || $reportType === 'combined') {
                $fuelData = $this->getFuelReportData($startDate, $endDate, $fuelProductId); // ← pass filter
                $response['transactions']                 = array_merge($response['transactions'], $fuelData['transactions']);
                $response['summary']['fuel_revenue']      = $fuelData['revenue'];
                $response['summary']['fuel_cost']         = $fuelData['cost'];
                $response['summary']['fuel_profit']       = $fuelData['profit'];
                $response['summary']['total_liters_sold'] = $fuelData['total_liters'];
                $response['summary']['fuel_transactions'] = $fuelData['count'];
            }

            $totalRevenue = ($response['summary']['parking_revenue'] ?? 0)
                          + ($response['summary']['fuel_revenue']    ?? 0);
            $totalCost    = ($response['summary']['parking_cost']    ?? 0)
                          + ($response['summary']['fuel_cost']       ?? 0);

            $response['summary']['total_revenue'] = $totalRevenue;
            $response['summary']['total_cost']    = $totalCost;
            $response['summary']['total_profit']  = $totalRevenue - $totalCost;

            $response['summary']['total_transactions'] =
                ($response['summary']['parking_transactions'] ?? 0) +
                ($response['summary']['fuel_transactions']    ?? 0);

            $response['summary']['average_transaction'] =
                $response['summary']['total_transactions'] > 0
                ? $response['summary']['total_revenue'] / $response['summary']['total_transactions']
                : 0;

            return response()->json($response);
        } catch (\Exception $e) {
            Log::error('Generate report error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to generate report: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ─── Parking data ─────────────────────────────────────────────────────────

    private function getParkingReportData($startDate, $endDate): array
    {
        // Paid parking payments within date range
        $payments = ParkingPayment::where('status', 'paid')
            ->whereBetween('created_at', [$startDate, $endDate])
            ->with(['transaction.booking.customer', 'transaction.booking.parkingSlot'])
            ->get();

        $formattedTransactions = [];
        $totalRevenue          = 0;
        $totalCost             = 0;
        $totalNights           = 0;

        foreach ($payments as $payment) {
            $transaction = $payment->transaction;
            if (! $transaction) continue;

            $booking  = $transaction->booking;
            $customer = $booking->customer ?? null;
            $slot     = $booking->parkingSlot ?? null;

            $checkIn  = Carbon::parse($booking->check_in_date);
            $checkOut = $transaction->check_out_date
                ? Carbon::parse($transaction->check_out_date)
                : Carbon::parse($booking->check_out_date);

            $nights = max(1, ceil($checkIn->diffInHours($checkOut) / 24));

            // Compute actual revenue from amount_paid - change_amount
            $totalAmount = max(
                0,
                (float) $payment->amount_paid - (float) ($payment->change_amount ?? 0)
            );

            $amountPaid = (float) $payment->amount_paid;
            $change     = (float) ($payment->change_amount ?? 0);

            // Parking has no direct cost basis in your schema, so cost = 0,
            // which means profit = revenue. If you later add a cost column
            // (e.g. overhead/maintenance per booking), plug it in here.
            $parkingCost = 0;
            $parkingProfit = $totalAmount - $parkingCost;

            $formattedTransactions[] = [
                'id'                 => $transaction->id,
                'transaction_number' => 'TXN-' . str_pad($transaction->id, 6, '0', STR_PAD_LEFT),
                'type'               => 'parking',
                'customer'           => $customer ? [
                    'first_name'   => $customer->first_name,
                    'last_name'    => $customer->last_name,
                    'phone_number' => $customer->phone_number,
                ] : null,
                'check_in_date'  => $booking->check_in_date->format('Y-m-d'),
                'check_in_time'  => $booking->check_in_date->format('H:i:s'),
                'check_out_date' => $checkOut->format('Y-m-d'),
                'check_out_time' => $checkOut->format('H:i:s'),
                'nights_stayed'  => $nights,
                'total_amount'   => $totalAmount,
                'amount_paid'    => $amountPaid,
                'change_amount'  => $change,
                'total_cost'     => $parkingCost,
                'profit'         => $parkingProfit,
                'slot_number'    => $slot->slot_number ?? 'N/A',
                'status'         => $payment->status,
                'payment_method' => $payment->payment_method ?? 'cash',
                'date'           => $payment->created_at->format('Y-m-d'),   // ← NEW
                'time'           => $payment->created_at->format('H:i:s'),   // ← NEW
            ];

            $totalRevenue += $totalAmount;
            $totalCost    += $parkingCost;
            $totalNights  += $nights;
        }

        return [
            'transactions' => $formattedTransactions,
            'revenue'      => $totalRevenue,
            'cost'         => $totalCost,
            'profit'       => $totalRevenue - $totalCost,
            'total_nights' => $totalNights,
            'count'        => count($formattedTransactions),
        ];
    }

    // ─── Fuel data ────────────────────────────────────────────────────────────

    private function getFuelReportData($startDate, $endDate, ?int $fuelProductId = null): array
    {
        $sales = FuelSale::whereBetween('sale_date', [$startDate, $endDate])
            ->when($fuelProductId, function ($q) use ($fuelProductId) {
                $q->whereHas('inventory', fn ($i) => $i->where('fuel_product_id', $fuelProductId));
            })
            ->with(['inventory.fuelProduct', 'gasolinePayment'])
            ->orderByDesc('sale_date')
            ->get();

        $formattedTransactions = [];
        $totalRevenue          = 0;
        $totalCost             = 0;
        $totalLiters           = 0;

        foreach ($sales as $sale) {
            $totalAmount = round((float) $sale->liters_sold * (float) $sale->price_per_liter, 2);
            $payment     = $sale->gasolinePayment;

            // ✅ Cost comes from the inventory row this sale was drawn from
            $costPerLiter = (float) ($sale->inventory->cost_price_per_liter ?? 0);
            $liters       = (float) $sale->liters_sold;
            $cost         = round($costPerLiter * $liters, 2);
            $profit       = round($totalAmount - $cost, 2);

            $formattedTransactions[] = [
                'id'                 => $sale->id,
                'transaction_number' => 'FUL-' . str_pad($sale->id, 6, '0', STR_PAD_LEFT),
                'type'               => 'fuel',
                'fuel_product'       => $sale->inventory->fuelProduct ? [
                    'type' => $sale->inventory->fuelProduct->type,
                ] : null,
                'liters'              => $liters,
                'price_per_liter'     => (float) $sale->price_per_liter,
                'cost_price_per_liter'=> $costPerLiter,
                'total_cost'          => $cost,
                'profit'              => $profit,
                'total_amount'        => $totalAmount,
                'amount_paid'         => (float) ($payment?->amount_paid ?? 0),
                'change_amount'       => (float) ($payment?->change_amount ?? 0),
                'payment_method'      => $payment?->payment_method ?? 'cash',
                'customer_name'       => $sale->customer_name,
                'created_at'          => $sale->sale_date->format('Y-m-d H:i:s'),
                'date'                => $sale->sale_date->format('Y-m-d'),
                'time'                => $sale->sale_date->format('H:i:s'),   // ← NEW
            ];

            $totalRevenue += $totalAmount;
            $totalCost    += $cost;
            $totalLiters  += $liters;
        }

        return [
            'transactions' => $formattedTransactions,
            'revenue'      => $totalRevenue,
            'cost'         => $totalCost,
            'profit'       => $totalRevenue - $totalCost,
            'total_liters' => $totalLiters,
            'count'        => count($formattedTransactions),
        ];
    }

    // ─── Summary ──────────────────────────────────────────────────────────────

    public function getSummary(Request $request)
    {
        try {
            $year  = $request->input('year', Carbon::now()->year);
            $month = $request->input('month', Carbon::now()->month);

            $startOfMonth = Carbon::create($year, $month, 1)->startOfDay();
            $endOfMonth   = Carbon::create($year, $month, 1)->endOfMonth();
            $startOfYear  = Carbon::create($year, 1, 1)->startOfDay();
            $endOfYear    = Carbon::create($year, 12, 31)->endOfDay();

            // Monthly parking — compute from amount_paid - change_amount
            $monthlyParking = ParkingPayment::where('status', 'paid')
                ->whereBetween('created_at', [$startOfMonth, $endOfMonth])
                ->get()
                ->sum(function ($payment) {
                    return max(0, $payment->amount_paid - ($payment->change_amount ?? 0));
                });

            // Monthly fuel — calculated from fuel_sales
            $monthlyFuel = FuelSale::whereBetween('sale_date', [$startOfMonth, $endOfMonth])
                ->sum(DB::raw('liters_sold * price_per_liter'));

            // Monthly fuel cost — pull cost from linked inventory
            $monthlyFuelCost = FuelSale::whereBetween('sale_date', [$startOfMonth, $endOfMonth])
                ->with('inventory')
                ->get()
                ->sum(function ($sale) {
                    $costPerLiter = (float) ($sale->inventory->cost_price_per_liter ?? 0);
                    return $costPerLiter * (float) $sale->liters_sold;
                });

            // Yearly parking
            $yearlyParking = ParkingPayment::where('status', 'paid')
                ->whereBetween('created_at', [$startOfYear, $endOfYear])
                ->get()
                ->sum(function ($payment) {
                    return max(0, $payment->amount_paid - ($payment->change_amount ?? 0));
                });

            $yearlyFuel = FuelSale::whereBetween('sale_date', [$startOfYear, $endOfYear])
                ->sum(DB::raw('liters_sold * price_per_liter'));

            $yearlyFuelCost = FuelSale::whereBetween('sale_date', [$startOfYear, $endOfYear])
                ->with('inventory')
                ->get()
                ->sum(function ($sale) {
                    $costPerLiter = (float) ($sale->inventory->cost_price_per_liter ?? 0);
                    return $costPerLiter * (float) $sale->liters_sold;
                });

            $totalCustomers         = User::where('role', 'customer')->count();
            $newCustomersThisMonth  = User::where('role', 'customer')
                ->whereBetween('created_at', [$startOfMonth, $endOfMonth])
                ->count();

            $totalParkingTransactions = ParkingPayment::where('status', 'paid')->count();
            $totalFuelTransactions    = FuelSale::count();

            return response()->json([
                'success' => true,
                'monthly' => [
                    'parking_revenue' => (float) $monthlyParking,
                    'fuel_revenue'    => (float) $monthlyFuel,
                    'fuel_cost'       => (float) $monthlyFuelCost,
                    'fuel_profit'     => (float) ($monthlyFuel - $monthlyFuelCost),
                    'total_revenue'   => (float) ($monthlyParking + $monthlyFuel),
                    'total_cost'      => (float) $monthlyFuelCost,
                    'total_profit'    => (float) (($monthlyParking + $monthlyFuel) - $monthlyFuelCost),
                ],
                'yearly' => [
                    'parking_revenue' => (float) $yearlyParking,
                    'fuel_revenue'    => (float) $yearlyFuel,
                    'fuel_cost'       => (float) $yearlyFuelCost,
                    'fuel_profit'     => (float) ($yearlyFuel - $yearlyFuelCost),
                    'total_revenue'   => (float) ($yearlyParking + $yearlyFuel),
                    'total_cost'      => (float) $yearlyFuelCost,
                    'total_profit'    => (float) (($yearlyParking + $yearlyFuel) - $yearlyFuelCost),
                ],
                'customers' => [
                    'total'          => $totalCustomers,
                    'new_this_month' => $newCustomersThisMonth,
                ],
                'transactions' => [
                    'parking' => $totalParkingTransactions,
                    'fuel'    => $totalFuelTransactions,
                    'total'   => $totalParkingTransactions + $totalFuelTransactions,
                ],
            ]);
        } catch (\Exception $e) {
            Log::error('Get summary error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}
