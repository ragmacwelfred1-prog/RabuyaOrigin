<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\FuelInventory;
use App\Models\FuelSale;
use App\Models\ParkingPayment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    public function getAnalytics(Request $request)
    {
        $year = $request->input('year', Carbon::now()->year);
        $month = $request->input('month', Carbon::now()->month);

        return response()->json([
            'success' => true,
            'bookings' => $this->getBookingAnalytics($year, $month),
            'customers' => $this->getCustomerAnalytics($year, $month),
            'fuel' => $this->getFuelAnalytics($year, $month),
            'parking' => $this->getParkingAnalytics($year, $month),
            'revenue' => $this->getRevenueAnalytics($year, $month),
        ]);
    }

    private function getBookingAnalytics($year, $month)
    {
        $bookings = Booking::whereYear('created_at', $year)
            ->whereMonth('created_at', $month)
            ->get();

        $statusCounts = [
            'pending' => $bookings->where('status', 'pending')->count(),
            'approved' => $bookings->where('status', 'approved')->count(),
            'completed' => $bookings->where('status', 'completed')->count(),
            'rejected' => $bookings->where('status', 'rejected')->count(),
            'cancelled' => $bookings->where('status', 'cancelled')->count(),
        ];

        $total = array_sum($statusCounts);
        $decided = $statusCounts['approved'] + $statusCounts['completed'] + $statusCounts['rejected'] + $statusCounts['cancelled'];
        $approvalRate = $decided > 0 ? (($statusCounts['approved'] + $statusCounts['completed']) / $decided) * 100 : 0;

        // Average nights for completed bookings
        $completed = $bookings->where('status', 'completed');
        $avgNights = 0;
        if ($completed->count() > 0) {
            $totalNights = $completed->sum(function ($b) {
                return Carbon::parse($b->check_in_date)->diffInDays(Carbon::parse($b->check_out_date)) + 1;
            });
            $avgNights = $totalNights / $completed->count();
        }

        // Peak hours
        $peakHours = [];
        for ($h = 0; $h < 24; $h++) {
            $peakHours[] = [
                'hour' => $h,
                'label' => Carbon::createFromTime($h, 0)->format('h A'),
                'checkins' => $bookings->filter(function ($b) use ($h) {
                    return Carbon::parse($b->created_at)->hour == $h;
                })->count()
            ];
        }

        return [
            'total' => $total,
            'status_counts' => $statusCounts,
            'approval_rate' => round($approvalRate, 1),
            'average_nights' => round($avgNights, 1),
            'peak_hours' => $peakHours,
            'booking_status_data' => array_map(function ($key, $value) {
                return ['name' => ucfirst($key), 'value' => $value];
            }, array_keys($statusCounts), array_values($statusCounts))
        ];
    }

    private function getCustomerAnalytics($year, $month)
    {
        $startDate = Carbon::create($year, $month, 1)->startOfMonth();
        $endDate = $startDate->copy()->endOfMonth();

        // Total customers
        $totalCustomers = User::where('role', 'customer')->count();

        // New customers this month
        $newCustomers = User::where('role', 'customer')
            ->whereBetween('created_at', [$startDate, $endDate])
            ->count();

        // Customers with bookings
        $customersWithBookings = Booking::distinct('customer_id')->count('customer_id');

        // Repeat customers (more than 1 booking)
        $repeatCount = DB::table('bookings')
            ->select('customer_id', DB::raw('COUNT(*) as count'))
            ->whereNotNull('customer_id')
            ->groupBy('customer_id')
            ->having('count', '>', 1)
            ->get()
            ->count();

        $repeatRate = $customersWithBookings > 0 ? ($repeatCount / $customersWithBookings) * 100 : 0;

        // Customer growth over last 6 months
        $growth = [];
        for ($i = 5; $i >= 0; $i--) {
            $date = Carbon::now()->subMonths($i);
            $growth[] = [
                'month' => $date->format('M'),
                'new_customers' => User::where('role', 'customer')
                    ->whereYear('created_at', $date->year)
                    ->whereMonth('created_at', $date->month)
                    ->count()
            ];
        }

        return [
            'total' => $totalCustomers,
            'new_this_month' => $newCustomers,
            'with_bookings' => $customersWithBookings,
            'repeat_customers' => $repeatCount,
            'repeat_rate' => round($repeatRate, 1),
            'growth' => $growth
        ];
    }

    private function getFuelAnalytics($year, $month)
    {
        // Profit by product
        $profitData = FuelInventory::with('fuelProduct')
            ->select(
                'fuel_product_id',
                DB::raw('SUM(liters_delivered * cost_price_per_liter) as total_cost'),
                DB::raw('SUM(liters_delivered * selling_price_per_liter) as total_selling')
            )
            ->groupBy('fuel_product_id')
            ->get();

        $profitRows = [];
        foreach ($profitData as $row) {
            $profit = $row->total_selling - $row->total_cost;
            $profitRows[] = [
                'type' => $row->fuelProduct?->type ?? 'Unknown',
                'cost' => round($row->total_cost, 2),
                'selling' => round($row->total_selling, 2),
                'profit' => round($profit, 2),
                'margin' => $row->total_cost > 0 ? round(($profit / $row->total_cost) * 100, 1) : 0
            ];
        }

        // Payment methods
        $paymentMethods = FuelSale::select('payment_method', DB::raw('COUNT(*) as count'))
            ->join('gasoline_payments', 'fuel_sales.id', '=', 'gasoline_payments.fuel_sale_id')
            ->groupBy('payment_method')
            ->get();

        $paymentData = [];
        foreach ($paymentMethods as $pm) {
            $paymentData[] = [
                'name' => strtoupper($pm->payment_method),
                'value' => $pm->count
            ];
        }

        return [
            'profit_by_product' => $profitRows,
            'payment_methods' => $paymentData,
            'total_profit' => round(array_sum(array_column($profitRows, 'profit')), 2)
        ];
    }

    private function getParkingAnalytics($year, $month)
    {
        // Payment methods
        $paymentMethods = ParkingPayment::where('status', 'paid')
            ->select('payment_method', DB::raw('COUNT(*) as count'))
            ->groupBy('payment_method')
            ->get();

        $paymentData = [];
        foreach ($paymentMethods as $pm) {
            $paymentData[] = [
                'name' => strtoupper($pm->payment_method),
                'value' => $pm->count
            ];
        }

        return [
            'payment_methods' => $paymentData
        ];
    }

    private function getRevenueAnalytics($year, $month)
    {
        $startDate = Carbon::create($year, $month, 1)->startOfMonth();
        $endDate = $startDate->copy()->endOfMonth();

        // Parking revenue this month
        $parkingRevenue = ParkingPayment::where('status', 'paid')
            ->whereBetween('created_at', [$startDate, $endDate])
            ->sum('amount_paid');

        // Fuel revenue this month
        $fuelRevenue = FuelSale::whereBetween('sale_date', [$startDate, $endDate])
            ->sum(DB::raw('liters_sold * price_per_liter'));

        return [
            'parking' => round($parkingRevenue, 2),
            'fuel' => round($fuelRevenue, 2),
            'total' => round($parkingRevenue + $fuelRevenue, 2)
        ];
    }
}
