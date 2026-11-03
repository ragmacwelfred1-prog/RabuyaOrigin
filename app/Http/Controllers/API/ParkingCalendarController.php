<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\ParkingSlot;
use App\Models\ParkingTransaction;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ParkingCalendarController extends Controller
{
    public function getCalendarData(Request $request)
    {
        $month = $request->input('month', Carbon::now()->month);
        $year = $request->input('year', Carbon::now()->year);

        $startDate = Carbon::create($year, $month, 1)->startOfDay();
        $endDate = $startDate->copy()->endOfMonth()->endOfDay();

        // Get all slots with their current status
        $slots = ParkingSlot::select('id', 'slot_number', 'status', 'nightly_rate')->get();

        // Get all bookings in date range
        $bookings = Booking::with(['customer', 'parkingSlot'])
            ->where(function ($query) use ($startDate, $endDate) {
                $query->whereBetween('check_in_date', [$startDate, $endDate])
                    ->orWhereBetween('check_out_date', [$startDate, $endDate])
                    ->orWhere(function ($q) use ($startDate, $endDate) {
                        $q->where('check_in_date', '<=', $startDate)
                            ->where('check_out_date', '>=', $endDate);
                    });
            })
            ->whereIn('status', ['pending', 'approved', 'completed'])
            ->get();

        // Get active transactions (currently checked in)
        $activeTransactions = ParkingTransaction::with(['booking.customer', 'booking.parkingSlot'])
            ->whereNull('check_out_date')
            ->get();

        // Build daily occupancy for each slot
        $calendarData = [];
        $currentDate = $startDate->copy();

        while ($currentDate <= $endDate) {
            $dateKey = $currentDate->format('Y-m-d');
            $calendarData[$dateKey] = [];

            foreach ($slots as $slot) {
                $status = $this->getSlotStatusOnDate($slot, $dateKey, $bookings, $activeTransactions);
                $calendarData[$dateKey][$slot->id] = $status;
            }

            $currentDate->addDay();
        }

        // Get days of the week for headers
        $days = [];
        $currentDate = $startDate->copy();
        while ($currentDate <= $endDate) {
            $days[] = [
                'date' => $currentDate->format('Y-m-d'),
                'day' => $currentDate->format('D'),
                'dayOfMonth' => $currentDate->format('d'),
                'isToday' => $currentDate->isToday(),
                'isWeekend' => $currentDate->isWeekend(),
            ];
            $currentDate->addDay();
        }

        // Summary statistics
        $today = Carbon::now()->format('Y-m-d');
        $availableToday = 0;
        $bookedToday = 0;
        $occupiedToday = 0;
        $maintenanceToday = 0;

        foreach ($slots as $slot) {
            if (isset($calendarData[$today][$slot->id])) {
                $status = $calendarData[$today][$slot->id]['status'];
                if ($status === 'available') $availableToday++;
                elseif ($status === 'booked') $bookedToday++;
                elseif ($status === 'occupied') $occupiedToday++;
                elseif ($status === 'maintenance') $maintenanceToday++;
            }
        }

        return response()->json([
            'success' => true,
            'month' => $month,
            'year' => $year,
            'month_name' => Carbon::create($year, $month, 1)->format('F Y'),
            'days' => $days,
            'slots' => $slots,
            'calendar' => $calendarData,
            'summary' => [
                'total_slots' => $slots->count(),
                'available_today' => $availableToday,
                'booked_today' => $bookedToday,
                'occupied_today' => $occupiedToday,
                'maintenance_today' => $maintenanceToday,
            ]
        ]);
    }

    private function getSlotStatusOnDate($slot, $dateKey, $bookings, $activeTransactions)
    {
        $date = Carbon::parse($dateKey)->startOfDay();

        // Check maintenance first
        if ($slot->status === 'maintenance') {
            return [
                'status' => 'maintenance',
                'customer_name' => null,
                'booking_id' => null,
                'source' => 'maintenance'
            ];
        }

        // Check active transactions (currently checked in)
        foreach ($activeTransactions as $tx) {
            if ($tx->booking->parking_slot_id == $slot->id) {
                $checkIn = Carbon::parse($tx->booking->check_in_date)->startOfDay();
                if ($date->between($checkIn, Carbon::now()->startOfDay())) {
                    return [
                        'status' => 'occupied',
                        'customer_name' => $tx->booking->customer ? 
                            $tx->booking->customer->first_name . ' ' . $tx->booking->customer->last_name : 'Unknown',
                        'booking_id' => $tx->booking->id,
                        'source' => 'active'
                    ];
                }
            }
        }

        // Check bookings
        foreach ($bookings as $booking) {
            if ($booking->parking_slot_id != $slot->id) continue;

            $checkIn = Carbon::parse($booking->check_in_date)->startOfDay();
            $checkOut = Carbon::parse($booking->check_out_date)->startOfDay();

            if ($date->between($checkIn, $checkOut)) {
                if ($booking->status === 'completed') {
                    return [
                        'status' => 'available',
                        'customer_name' => null,
                        'booking_id' => null,
                        'source' => 'completed'
                    ];
                }
                return [
                    'status' => 'booked',
                    'customer_name' => $booking->customer ? 
                        $booking->customer->first_name . ' ' . $booking->customer->last_name : 'Unknown',
                    'booking_id' => $booking->id,
                    'source' => $booking->status
                ];
            }
        }

        return [
            'status' => 'available',
            'customer_name' => null,
            'booking_id' => null,
            'source' => 'available'
        ];
    }
}
