<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\FuelProduct;
use App\Models\FuelSale;
use App\Models\FuelInventory;
use App\Models\GasolinePayment;
use App\Models\InventoryLog;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class FuelSaleController extends Controller
{
    public function recordSale(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'fuel_product_id' => 'required|exists:fuel_products,id',
            'liters'          => 'required|numeric|min:0.01',
            'amount_paid'     => 'required|numeric|min:0',
            'change_amount'   => 'nullable|numeric|min:0',
            'payment_method'  => 'required|in:cash',
            'customer_name'   => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $productId = $request->fuel_product_id;

            $totalStockBefore = FuelInventory::where('fuel_product_id', $productId)
                ->where('remaining_liters', '>', 0)
                ->sum('remaining_liters');

            $totalStock = (float) $totalStockBefore;
            if ($totalStock < $request->liters) {
                DB::rollBack(); 
                return response()->json([
                    'message' => 'Insufficient stock. Available: ' . number_format($totalStock, 2) . ' L',
                ], 422);
            }

            $inventoryItems = FuelInventory::where('fuel_product_id', $productId)
                ->where('remaining_liters', '>', 0)
                ->orderBy('delivery_date', 'asc')
                ->lockForUpdate()
                ->get();

            $remainingLiters = (float) $request->liters;
            $litersToSell    = (float) $request->liters;
            $usedInventories = [];
            $lastInventory   = null;

            foreach ($inventoryItems as $inventory) {
                if ($remainingLiters <= 0) break;
                $available                   = (float) $inventory->remaining_liters;
                $take                        = min($remainingLiters, $available);
                $remainingLiters            -= $take;
                $inventory->remaining_liters = $available - $take;
                $inventory->save();
                $lastInventory     = $inventory;
                $usedInventories[] = ['inv' => $inventory, 'take' => $take];
            }

            if ($remainingLiters > 0 || ! $lastInventory) {
                DB::rollBack();
                return response()->json(['message' => 'Insufficient stock'], 422);
            }

            $inv           = $lastInventory;
            $pricePerLiter = (float) $inv->selling_price_per_liter;
            $amountPaid    = round((float) $request->amount_paid, 2);
            $changeAmount  = round((float) ($request->change_amount ?? max(0, $amountPaid - $litersToSell * $pricePerLiter)), 2);

            $sale = FuelSale::create([
                'fuel_inventory_id' => $inv->id,
                'recorded_by'       => Auth::id(),
                'sale_date'         => now(),
                'liters_sold'       => $litersToSell,
                'price_per_liter'   => $pricePerLiter,
                'customer_name'     => $request->customer_name ?? null,
            ]);

            GasolinePayment::create([
                'fuel_sale_id'   => $sale->id,
                'amount_paid'    => $amountPaid,
                'change_amount'  => $changeAmount,
                'payment_method' => $request->payment_method,
                'status'         => 'paid',
                'processed_by'   => Auth::id(),
            ]);

            $runningStock = (float) $totalStockBefore;
            foreach ($usedInventories as $ui) {
                try {
                    $litersAfter = $runningStock - $ui['take'];
                    InventoryLog::create([
                        'fuel_inventory_id' => $ui['inv']->id,
                        'reference_id'      => $productId,
                        'movement'          => 'out',
                        'liters'            => $ui['take'],
                        'liters_before'     => $runningStock,
                        'liters_after'      => $litersAfter,
                        'price_per_liter'   => (float) $ui['inv']->selling_price_per_liter,
                    ]);
                    $runningStock = $litersAfter;
                } catch (\Exception $e) {
                    Log::warning('Sale log creation failed: ' . $e->getMessage());
                }
            }

            DB::commit();

            return response()->json([
                'success'            => true,
                'message'            => 'Sale recorded!',
                'transaction'        => ['id' => $sale->id],
                'transaction_number' => 'FUL-' . str_pad($sale->id, 6, '0', STR_PAD_LEFT),
                'total_amount'       => $amountPaid,
                'change'             => $changeAmount,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Sale error: ' . $e->getMessage());
            return response()->json(['message' => 'Failed: ' . $e->getMessage()], 500);
        }
    }

    private function formatSale(FuelSale $sale): array
    {
        $totalAmount = round((float) $sale->liters_sold * (float) $sale->price_per_liter, 2);
        $payment     = $sale->gasolinePayment;

        return [
            'id'                 => $sale->id,
            'transaction_number' => 'FUL-' . str_pad($sale->id, 6, '0', STR_PAD_LEFT),
            'fuel_product_id'    => $sale->inventory->fuel_product_id ?? null,
            'fuel_product'       => $sale->inventory?->fuelProduct ? [
                'id'   => $sale->inventory->fuelProduct->id,
                'type' => $sale->inventory->fuelProduct->type,
            ] : null,
            'liters'          => (float) $sale->liters_sold,
            'price_per_liter' => (float) $sale->price_per_liter,
            'total_amount'    => $totalAmount,
            'amount_paid'     => (float) ($payment?->amount_paid ?? 0),
            'change_amount'   => (float) ($payment?->change_amount ?? 0),
            'payment_method'  => $payment?->payment_method ?? 'cash',
            'customer_name'   => $sale->customer_name,
            'created_at'      => $sale->sale_date,
            'recorded_by'     => $sale->recordedBy ? [
                'id'         => $sale->recordedBy->id,
                'first_name' => $sale->recordedBy->first_name,
                'last_name'  => $sale->recordedBy->last_name,
            ] : null,
        ];
    }

    public function getTodaySales()
    {
        $sales = FuelSale::whereDate('sale_date', now()->toDateString())
            ->with(['inventory.fuelProduct', 'recordedBy', 'gasolinePayment'])
            ->orderByDesc('sale_date')
            ->get()
            ->map(fn ($sale) => $this->formatSale($sale));

        return response()->json([
            'success' => true,
            'sales'   => $sales->values(),
            'summary' => [
                'total_transactions' => $sales->count(),
                'total_liters'       => round((float) $sales->sum('liters'), 2),
                'total_revenue'      => round((float) $sales->sum('total_amount'), 2),
            ],
        ]);
    }

    public function getAllSales()
    {
        $sales = FuelSale::with(['inventory.fuelProduct', 'recordedBy', 'gasolinePayment'])
            ->orderByDesc('sale_date')
            ->get()
            ->map(fn ($sale) => $this->formatSale($sale));

        return response()->json($sales);
    }

    /**
     * ✅ NEW: per-product revenue / cost / profit for a given day.
     * GET /fuel/daily-profit?date=YYYY-MM-DD
     */
    public function getDailyProfit(Request $request)
    {
        try {
            $date = $request->filled('date')
                ? Carbon::parse($request->date)->toDateString()
                : now()->toDateString();

            $sales = FuelSale::whereDate('sale_date', $date)
                ->with('inventory')
                ->get();

            $byProduct = [];

            foreach ($sales as $sale) {
                $productId = $sale->inventory->fuel_product_id ?? null;
                if (! $productId) continue;

                $liters  = (float) $sale->liters_sold;
                $revenue = round($liters * (float) $sale->price_per_liter, 2);
                $cost    = round($liters * (float) ($sale->inventory->cost_price_per_liter ?? 0), 2);

                if (! isset($byProduct[$productId])) {
                    $byProduct[$productId] = [
                        'fuel_product_id' => $productId,
                        'liters'          => 0,
                        'revenue'         => 0,
                        'cost'            => 0,
                        'profit'          => 0,
                        'profit_margin'   => 0,
                        'transactions'    => 0,
                    ];
                }

                $byProduct[$productId]['liters']       += $liters;
                $byProduct[$productId]['revenue']      += $revenue;
                $byProduct[$productId]['cost']         += $cost;
                $byProduct[$productId]['transactions'] += 1;
            }

            $totals = ['revenue' => 0, 'cost' => 0, 'profit' => 0];

            foreach ($byProduct as &$row) {
                $row['liters']  = round($row['liters'], 2);
                $row['revenue'] = round($row['revenue'], 2);
                $row['cost']    = round($row['cost'], 2);
                $row['profit']  = round($row['revenue'] - $row['cost'], 2);
                $row['profit_margin'] = $row['cost'] > 0
                    ? round(($row['profit'] / $row['cost']) * 100, 1)
                    : 0;

                $totals['revenue'] += $row['revenue'];
                $totals['cost']    += $row['cost'];
                $totals['profit']  += $row['profit'];
            }
            unset($row);

            return response()->json([
                'success'  => true,
                'date'     => $date,
                'products' => array_values($byProduct),
                'totals'   => [
                    'revenue' => round($totals['revenue'], 2),
                    'cost'    => round($totals['cost'], 2),
                    'profit'  => round($totals['profit'], 2),
                ],
            ]);
        } catch (\Exception $e) {
            Log::error('Daily profit error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function getStockStatus()
    {
        $products = FuelProduct::all()->map(function ($product) {
            $stock = FuelInventory::where('fuel_product_id', $product->id)
                ->where('remaining_liters', '>', 0)
                ->sum('remaining_liters');

            $latest = FuelInventory::where('fuel_product_id', $product->id)
                ->where('remaining_liters', '>', 0)
                ->orderBy('delivery_date', 'desc')
                ->first();

            return [
                'id'              => $product->id,
                'type'            => $product->type,
                'available_stock' => (float) $stock,
                'price_per_liter' => $latest
                    ? (float) $latest->selling_price_per_liter
                    : (float) $product->current_selling_price,
                'is_low_stock'    => $stock < 100 && $stock > 0,
                'is_out_of_stock' => $stock <= 0,
            ];
        });

        return response()->json($products);
    }
}
