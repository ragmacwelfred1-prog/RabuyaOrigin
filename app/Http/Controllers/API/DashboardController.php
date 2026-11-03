<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\ParkingSlot;
use App\Models\ParkingPayment;
use App\Models\GasolinePayment;
use App\Models\Booking;
use App\Models\FuelProduct;
use App\Models\FuelInventory;
use App\Models\FuelSale;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function getStats()
    {
        // Parking slot stats
        $totalSlots       = ParkingSlot::count();
        $availableSlots   = ParkingSlot::where('status', 'available')->count();
        $occupiedSlots    = ParkingSlot::where('status', 'occupied')->count();
        $maintenanceSlots = ParkingSlot::where('status', 'maintenance')->count();
        $occupancyRate    = $totalSlots > 0 ? round(($occupiedSlots / $totalSlots) * 100, 1) : 0;

        // Parking revenue this month — from parking_payments table
        $monthParkingRevenue = ParkingPayment::where('status', 'paid')
            ->whereMonth('created_at', now()->month)
            ->whereYear('created_at', now()->year)
            ->sum('amount_paid');

        // Fuel revenue all time — liters_sold × price_per_liter from fuel_sales
        $totalFuelRevenue = FuelSale::sum(DB::raw('liters_sold * price_per_liter'));

        // ─── Weekly revenue (last 7 days) ─────────────────────────────────────
        $weeklyData = [];
        for ($i = 6; $i >= 0; $i--) {
            $date    = now()->subDays($i);
            $dayName = $date->format('D');

            $fuelSales = FuelSale::whereDate('sale_date', $date->format('Y-m-d'))
                ->sum(DB::raw('liters_sold * price_per_liter'));

            $parkingRevenue = ParkingPayment::where('status', 'paid')
                ->whereDate('created_at', $date->format('Y-m-d'))
                ->sum('amount_paid');

            $weeklyData[] = [
                'day'              => $dayName,
                'fuel_sales'       => round($fuelSales, 2),
                'parking_revenue'  => round($parkingRevenue, 2),
            ];
        }

        // ─── Monthly revenue (last 6 months) ──────────────────────────────────
        $monthlyData = [];
        for ($i = 5; $i >= 0; $i--) {
            $date      = now()->subMonths($i);
            $monthName = $date->format('M');

            $fuelSales = FuelSale::whereMonth('sale_date', $date->month)
                ->whereYear('sale_date', $date->year)
                ->sum(DB::raw('liters_sold * price_per_liter'));

            $parkingRevenue = ParkingPayment::where('status', 'paid')
                ->whereMonth('created_at', $date->month)
                ->whereYear('created_at', $date->year)
                ->sum('amount_paid');

            $monthlyData[] = [
                'month'           => $monthName,
                'fuel_sales'      => round($fuelSales, 2),
                'parking_revenue' => round($parkingRevenue, 2),
            ];
        }

        return response()->json([
            'success'               => true,
            'total_slots'           => $totalSlots,
            'available_slots'       => $availableSlots,
            'occupied_slots'        => $occupiedSlots,
            'maintenance_slots'     => $maintenanceSlots,
            'occupancy_rate'        => $occupancyRate,
            'month_parking_revenue' => $monthParkingRevenue,
            'total_fuel_revenue'    => $totalFuelRevenue,
            'weekly'                => $weeklyData,
            'monthly'               => $monthlyData,
        ]);
    }
    public function getFuelProfitSummary()
    {
        // Get all fuel inventory
        $inventory = FuelInventory::with('fuelProduct')->get();

        $totalCost = 0;
        $totalRevenue = 0;
        $totalProfit = 0;

        foreach ($inventory as $item) {
            $delivered = $item->liters_delivered;
            $remaining = $item->remaining_liters;
            $sold = $delivered - $remaining;

            $cost = $sold * $item->cost_price_per_liter;
            $revenue = $sold * $item->selling_price_per_liter;

            $totalCost += $cost;
            $totalRevenue += $revenue;
            $totalProfit += ($revenue - $cost);
        }

        return response()->json([
            'success' => true,
            'total_cost' => round($totalCost, 2),
            'total_revenue' => round($totalRevenue, 2),
            'total_profit' => round($totalProfit, 2),
            'profit_margin' => $totalCost > 0 ? round(($totalProfit / $totalCost) * 100, 1) : 0,
        ]);
    }
}

