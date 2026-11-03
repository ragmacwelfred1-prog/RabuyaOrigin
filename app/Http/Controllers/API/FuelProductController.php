<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\FuelProduct;
use App\Models\FuelInventory;
use App\Models\Supplier;
use App\Models\InventoryLog;
use App\Models\FuelSale;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class FuelProductController extends Controller
{
    public function index()
    {
        return response()->json(FuelProduct::all());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|string|unique:fuel_products,type',
            'current_selling_price' => 'nullable|numeric|min:0',
        ]);
        return response()->json(FuelProduct::create($validated), 201);
    }

    public function update(Request $request, $id)
    {
        $product = FuelProduct::findOrFail($id);

        $validated = $request->validate([
            'type' => 'sometimes|string|unique:fuel_products,type,' . $id,
            'selling_price' => 'nullable|numeric|min:0',
            'current_selling_price' => 'nullable|numeric|min:0',
        ]);

        // Handle both field names for compatibility
        $priceField = $validated['current_selling_price'] ?? $validated['selling_price'] ?? null;

        $product->update([
            'type' => $validated['type'] ?? $product->type,
            'current_selling_price' => $priceField ?? $product->current_selling_price,
        ]);

        // Update inventory selling prices
        if ($priceField !== null) {
            FuelInventory::where('fuel_product_id', $id)
                ->where('remaining_liters', '>', 0)
                ->update(['selling_price_per_liter' => $priceField]);
        }

        return response()->json($product);
    }

    public function destroy($id)
    {
        $product = FuelProduct::findOrFail($id);
        if (FuelInventory::where('fuel_product_id', $id)->exists()) {
            return response()->json(['message' => 'Cannot delete product with existing inventory'], 422);
        }
        $product->delete();
        return response()->json(['message' => 'Product deleted']);
    }

    // ─── SUPPLIERS ──────────────────────────────────────────────────────────────

    public function getSuppliers()
    {
        return response()->json(Supplier::orderBy('supplier_name')->get());
    }

    public function storeSupplier(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'supplier_name' => 'required|string|max:255',
        ]);
        if ($validator->fails()) return response()->json(['errors' => $validator->errors()], 422);
        return response()->json(Supplier::create($request->all()), 201);
    }

    public function updateSupplier(Request $request, $id)
    {
        $supplier = Supplier::findOrFail($id);
        $validator = Validator::make($request->all(), [
            'supplier_name' => 'sometimes|required|string|max:255',
        ]);
        if ($validator->fails()) return response()->json(['errors' => $validator->errors()], 422);
        $supplier->update($request->all());
        return response()->json($supplier);
    }

    public function destroySupplier($id)
    {
        $supplier = Supplier::findOrFail($id);
        if (FuelInventory::where('supplier_id', $id)->exists()) {
            return response()->json(['message' => 'Cannot delete supplier with existing inventory records'], 422);
        }
        $supplier->delete();
        return response()->json(['message' => 'Supplier deleted']);
    }

    // ─── INVENTORY ──────────────────────────────────────────────────────────────

    /**
     * Get inventory with accurate profit calculations
     * ✅ FIXED: Calculates profit based on sold liters, not delivered
     */
    public function getInventory()
    {
        $rows = DB::table('fuel_inventory as fi')
            ->leftJoin('fuel_products as fp', 'fi.fuel_product_id', '=', 'fp.id')
            ->leftJoin('suppliers as s', 'fi.supplier_id', '=', 's.id')
            ->select(
                'fi.id',
                'fi.fuel_product_id',
                'fi.supplier_id',
                'fi.delivery_date',
                'fi.liters_delivered',
                'fi.remaining_liters',
                'fi.cost_price_per_liter',
                'fi.selling_price_per_liter',
                'fi.reference_no',
                'fi.created_at',
                'fi.updated_at',
                'fp.id as prod_id',
                'fp.type as prod_type',
                's.id as sup_id',
                's.supplier_name as sup_name'
            )
            ->orderBy('fi.delivery_date', 'desc')
            ->get();

        $inventory = $rows->map(function ($item) {
            $deliveredLiters = (float) $item->liters_delivered;
            $remainingLiters = (float) $item->remaining_liters;
            $soldLiters = max(0, $deliveredLiters - $remainingLiters);

            $costPrice = (float) $item->cost_price_per_liter;
            $sellPrice = (float) $item->selling_price_per_liter;

            // Total cost and selling for delivered
            $totalCostDelivered = $deliveredLiters * $costPrice;
            $totalSellDelivered = $deliveredLiters * $sellPrice;

            // ✅ FIX: Profit from sold liters only
            $soldCost = $soldLiters * $costPrice;
            $soldSell = $soldLiters * $sellPrice;
            $profit = $soldSell - $soldCost;
            $profitMargin = $soldCost > 0 ? round(($profit / $soldCost) * 100, 1) : 0;

            // Remaining inventory value
            $remainingCost = $remainingLiters * $costPrice;
            $remainingSell = $remainingLiters * $sellPrice;

            return [
                'id' => $item->id,
                'fuel_product_id' => $item->fuel_product_id,
                'supplier_id' => $item->supplier_id,
                'delivery_date' => $item->delivery_date,
                'liters_delivered' => round($deliveredLiters, 2),
                'remaining_liters' => round($remainingLiters, 2),
                'sold_liters' => round($soldLiters, 2),
                'cost_price_per_liter' => round($costPrice, 2),
                'selling_price_per_liter' => round($sellPrice, 2),
                'total_cost' => round($totalCostDelivered, 2),
                'total_selling' => round($totalSellDelivered, 2),
                'remaining_cost_value' => round($remainingCost, 2),
                'remaining_sell_value' => round($remainingSell, 2),
                'profit' => round($profit, 2),
                'profit_margin' => $profitMargin,
                'reference_no' => $item->reference_no,
                'created_at' => $item->created_at,
                'updated_at' => $item->updated_at,
                'fuel_product' => $item->prod_id ? [
                    'id' => $item->prod_id,
                    'type' => $item->prod_type,
                ] : null,
                'supplier' => $item->sup_id ? [
                    'id' => $item->sup_id,
                    'supplier_name' => $item->sup_name,
                ] : null,
            ];
        });

        return response()->json($inventory);
    }

  
    public function addInventory(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'fuel_product_id' => 'required|exists:fuel_products,id',
            'supplier_id' => 'required|exists:suppliers,id',
            'delivery_date' => 'required|date',
            'liters_delivered' => 'required|numeric|min:0.01',
            'cost_price_per_liter' => 'required|numeric|min:0',
            'selling_price_per_liter' => 'required|numeric|min:0',
            'reference_no' => 'nullable|string|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }
        $currentStock = FuelInventory::where('fuel_product_id', $request->fuel_product_id)
            ->where('remaining_liters', '>', 0)
            ->sum('remaining_liters');

        $inventory = FuelInventory::create([
            'fuel_product_id' => $request->fuel_product_id,
            'supplier_id' => $request->supplier_id,
            'delivery_date' => $request->delivery_date,
            'liters_delivered' => $request->liters_delivered,
            'remaining_liters' => $request->liters_delivered,
            'cost_price_per_liter' => $request->cost_price_per_liter,
            'selling_price_per_liter' => $request->selling_price_per_liter,
            'reference_no' => $request->reference_no,
        ]);

        try {
            InventoryLog::create([
                'fuel_inventory_id' => $inventory->id,
                'reference_id' => $request->fuel_product_id,
                'movement' => 'in',
                'liters' => $request->liters_delivered,
                'liters_before' => (float) $currentStock,
                'liters_after' => (float) $currentStock + (float) $request->liters_delivered,
                'price_per_liter' => $request->cost_price_per_liter,
            ]);
        } catch (\Exception $e) {
            Log::warning('Inventory log creation failed: ' . $e->getMessage());
        }

        if ($request->selling_price_per_liter > 0) {
            FuelProduct::where('id', $request->fuel_product_id)
                ->update(['current_selling_price' => $request->selling_price_per_liter]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Stock in successful!',
            'id' => $inventory->id,
            'inventory' => $inventory->load('supplier', 'fuelProduct'),
        ], 201);
    }

    /**
     * Get inventory logs with proper customer name fetching
     * ✅ FIXED: Uses separate query for customer names
     */
    public function getInventoryLogs(Request $request)
    {
        $query = DB::table('inventory_logs as il')
            ->leftJoin('fuel_inventory as fi', 'il.fuel_inventory_id', '=', 'fi.id')
            ->leftJoin('fuel_products as fp', 'fi.fuel_product_id', '=', 'fp.id')
            ->leftJoin('suppliers as s', 'fi.supplier_id', '=', 's.id')
            ->select(
                'il.id',
                'il.fuel_inventory_id',
                'il.reference_id',
                'il.movement',
                'il.liters',
                'il.liters_before',
                'il.liters_after',
                'il.price_per_liter',
                'il.created_at',
                'fi.id as inv_id',
                'fi.reference_no as inv_reference_no',
                'fi.delivery_date as inv_delivery_date',
                'fp.id as prod_id',
                'fp.type as prod_type',
                's.id as sup_id',
                's.supplier_name as sup_name'
            )
            ->orderBy('il.created_at', 'desc');

        if ($request->has('fuel_product_id') && $request->fuel_product_id) {
            $query->where('il.reference_id', $request->fuel_product_id);
        }

        if ($request->has('movement') && $request->movement) {
            $query->where('il.movement', $request->movement);
        }

        $logs = $query->get()->map(function ($row) {
            $customerName = null;

            // ✅ FIX: Get customer name from fuel_sales for out movements
            if ($row->movement === 'out') {
                $sale = FuelSale::where('fuel_inventory_id', $row->fuel_inventory_id)
                    ->where('liters_sold', $row->liters)
                    ->orderBy('created_at', 'desc')
                    ->first();
                $customerName = $sale?->customer_name;
            }

            return [
                'id' => $row->id,
                'fuel_inventory_id' => $row->fuel_inventory_id,
                'reference_id' => $row->reference_id,
                'movement' => $row->movement,
                'liters' => (float) $row->liters,
                'liters_before' => (float) $row->liters_before,
                'liters_after' => (float) $row->liters_after,
                'price_per_liter' => (float) $row->price_per_liter,
                'created_at' => $row->created_at,
                'customer_name' => $customerName,
                'fuel_inventory' => $row->inv_id ? [
                    'id' => $row->inv_id,
                    'reference_no' => $row->inv_reference_no,
                    'delivery_date' => $row->inv_delivery_date,
                    'fuel_product' => $row->prod_id ? [
                        'id' => $row->prod_id,
                        'type' => $row->prod_type,
                    ] : null,
                    'supplier' => $row->sup_id ? [
                        'id' => $row->sup_id,
                        'supplier_name' => $row->sup_name,
                    ] : null,
                ] : null,
            ];
        });

        return response()->json([
            'success' => true,
            'logs' => $logs,
        ]);
    }

    public function storeInventoryLog(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'fuel_inventory_id' => 'required|exists:fuel_inventory,id',
            'reference_id' => 'required|integer',
            'movement' => 'required|in:in,out',
            'liters' => 'required|numeric|min:0.01',
            'liters_before' => 'required|numeric|min:0',
            'liters_after' => 'required|numeric|min:0',
            'price_per_liter' => 'required|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $log = InventoryLog::create($request->all());

        return response()->json([
            'success' => true,
            'message' => 'Inventory log created',
            'log' => $log,
        ], 201);
    }

    // ─── DEBUG ──────────────────────────────────────────────────────────────────

    public function debugInventory()
    {
        $rawInventory = DB::table('fuel_inventory')
            ->join('fuel_products', 'fuel_inventory.fuel_product_id', '=', 'fuel_products.id')
            ->select(
                'fuel_inventory.*',
                'fuel_products.type as product_type'
            )
            ->get();

        $withRemaining = DB::table('fuel_inventory')
            ->join('fuel_products', 'fuel_inventory.fuel_product_id', '=', 'fuel_products.id')
            ->where('fuel_inventory.remaining_liters', '>', 0)
            ->select(
                'fuel_inventory.*',
                'fuel_products.type as product_type'
            )
            ->get();

        return response()->json([
            'total_inventory_records' => $rawInventory->count(),
            'records_with_stock' => $withRemaining->count(),
            'all_inventory' => $rawInventory,
            'inventory_with_stock' => $withRemaining,
        ]);
    }

    public function calculateExpectedProfit(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'fuel_product_id' => 'required|exists:fuel_products,id',
            'liters' => 'required|numeric|min:0.01',
            'cost_price_per_liter' => 'required|numeric|min:0',
            'selling_price_per_liter' => 'required|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $liters = $request->liters;
        $costPrice = $request->cost_price_per_liter;
        $sellPrice = $request->selling_price_per_liter;

        $totalCost = $liters * $costPrice;
        $totalRevenue = $liters * $sellPrice;
        $expectedProfit = $totalRevenue - $totalCost;
        $profitMargin = $totalCost > 0 ? ($expectedProfit / $totalCost) * 100 : 0;

        // Get current stock
        $currentStock = FuelInventory::where('fuel_product_id', $request->fuel_product_id)
            ->where('remaining_liters', '>', 0)
            ->sum('remaining_liters');

        return response()->json([
            'success' => true,
            'liters' => $liters,
            'cost_price' => $costPrice,
            'selling_price' => $sellPrice,
            'total_cost' => round($totalCost, 2),
            'total_revenue' => round($totalRevenue, 2),
            'expected_profit' => round($expectedProfit, 2),
            'profit_margin' => round($profitMargin, 1),
            'current_stock' => $currentStock,
            'after_stock' => $currentStock + $liters,
        ]);
    }
}

