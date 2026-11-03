<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\ParkingSlot;
use App\Models\ParkingTransaction;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class BookingCalendarController extends Controller
{
    /**
     * Get booked dates for a specific parking slot
     *
     * @param int $slotId
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function getBookedDates($slotId, Request $request)
    {
        try {
            // Validate slot exists
            $slot = ParkingSlot::find($slotId);
            if (!$slot) {
                return response()->json([
                    'success' => false,
                    'message' => 'Parking slot not found',
                ], 404);
            }

            // Get month/year from request
            $year = $request->input('year', Carbon::now()->year);
            $month = $request->input('month', Carbon::now()->month);

            // Validate month/year
            if ($month < 1 || $month > 12) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid month',
                ], 422);
            }

            if ($year < 2000 || $year > 2100) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid year',
                ], 422);
            }

            // Get date range for the month
            $startDate = Carbon::create($year, $month, 1)->startOfDay();
            $endDate = $startDate->copy()->endOfMonth()->endOfDay();

            // Get all bookings for this slot in the date range
            $today = Carbon::today();

            // Pending/approved lang ang humaharang. Completed/cancelled/rejected = libre na.
            $bookings = Booking::with('transaction')
                ->where('parking_slot_id', $slotId)
                ->whereIn('status', ['pending', 'approved'])
                ->where('check_in_date', '<=', $endDate)
                ->where('check_out_date', '>=', $startDate)
                ->get();

            $bookedDates = $bookings->map(function ($booking) use ($today) {
                $checkIn  = $booking->check_in_date->copy()->startOfDay();
                $checkOut = $booking->check_out_date->copy()->startOfDay();
                $status   = $booking->status;

                $tx = $booking->transaction;
                if ($tx && $tx->check_out_date === null) {
                    $status = 'active';
                    // Overdue na? Block hanggang ngayon lang, hindi lampas.
                    if ($checkOut->lt($today)) {
                        $checkOut = $today->copy();
                    }
                }

                return [
                    'check_in'  => $checkIn->format('Y-m-d'),
                    'check_out' => $checkOut->format('Y-m-d'),
                    'status'    => $status,
                ];
            })->values();

            $activeTransactions = $bookings->filter(
                fn ($b) => $b->transaction && $b->transaction->check_out_date === null
            );

            // Get days in month for reference
            $daysInMonth = $endDate->day;

            return response()->json([
                'success' => true,
                'slot_id' => (int) $slotId,
                'slot_number' => $slot->slot_number,
                'year' => (int) $year,
                'month' => (int) $month,
                'days_in_month' => $daysInMonth,
                'booked_dates' => $bookedDates,
                'summary' => [
                    'total_bookings'  => $bookings->count(),
                    'active_checkins' => $activeTransactions->count(),
                ],
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to fetch booked dates: ' . $e->getMessage(), [
                'slot_id' => $slotId,
                'year' => $year ?? null,
                'month' => $month ?? null,
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch booked dates',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get all slots with their booked dates for a month
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function getAllSlotsBookedDates(Request $request)
    {
        try {
            $year = $request->input('year', Carbon::now()->year);
            $month = $request->input('month', Carbon::now()->month);

            // Validate month/year
            if ($month < 1 || $month > 12) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid month',
                ], 422);
            }

            if ($year < 2000 || $year > 2100) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid year',
                ], 422);
            }

            // Get all parking slots
            $slots = ParkingSlot::all();

            $startDate = Carbon::create($year, $month, 1)->startOfDay();
            $endDate = $startDate->copy()->endOfMonth()->endOfDay();
            $today = Carbon::today();

            $result = [];

            foreach ($slots as $slot) {
                // Get bookings for this slot
                $bookings = Booking::with('transaction')
                    ->where('parking_slot_id', $slot->id)
                    ->whereIn('status', ['pending', 'approved'])
                    ->where('check_in_date', '<=', $endDate)
                    ->where('check_out_date', '>=', $startDate)
                    ->get();

                // Build booked ranges with active status handling
                $allBookings = $bookings->map(function ($booking) use ($today) {
                    $checkIn  = $booking->check_in_date->copy()->startOfDay();
                    $checkOut = $booking->check_out_date->copy()->startOfDay();
                    $status   = $booking->status;

                    $tx = $booking->transaction;
                    if ($tx && $tx->check_out_date === null) {
                        $status = 'active';
                        if ($checkOut->lt($today)) {
                            $checkOut = $today->copy();
                        }
                    }

                    return [
                        'check_in_date'  => $checkIn->format('Y-m-d H:i:s'),
                        'check_out_date' => $checkOut->format('Y-m-d H:i:s'),
                        'status'         => $status,
                    ];
                })->values()->toArray();

                $result[] = [
                    'slot' => [
                        'id' => $slot->id,
                        'slot_number' => $slot->slot_number,
                        'status' => $slot->status,
                        'nightly_rate' => $slot->nightly_rate,
                    ],
                    'bookings' => $allBookings,
                    'count' => count($allBookings),
                ];
            }

            return response()->json([
                'success' => true,
                'year' => (int) $year,
                'month' => (int) $month,
                'slots' => $result,
                'total_slots' => $slots->count(),
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to fetch all booked dates: ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch booked dates',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Check availability for a specific date and slot
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function checkAvailability(Request $request)
    {
        try {
            $slotId = $request->input('slot_id');
            $date = $request->input('date'); // YYYY-MM-DD

            if (!$slotId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Slot ID is required',
                ], 422);
            }

            if (!$date) {
                return response()->json([
                    'success' => false,
                    'message' => 'Date is required',
                ], 422);
            }

            // Parse date
            $checkDate = Carbon::parse($date)->startOfDay();

            // Check if slot exists
            $slot = ParkingSlot::find($slotId);
            if (!$slot) {
                return response()->json([
                    'success' => false,
                    'message' => 'Parking slot not found',
                ], 404);
            }

            // Check if slot is maintenance
            if ($slot->status === 'maintenance') {
                return response()->json([
                    'success' => true,
                    'available' => false,
                    'reason' => 'maintenance',
                    'message' => 'This slot is under maintenance',
                ]);
            }

            // Check for active check-in
            $activeCheckin = \App\Models\ParkingTransaction::whereHas('booking', function ($query) use ($slotId) {
                $query->where('parking_slot_id', $slotId);
            })
            ->whereNull('check_out_date')
            ->first();

            if ($activeCheckin) {
                $booking = $activeCheckin->booking;
                $checkIn = Carbon::parse($booking->check_in_date)->startOfDay();
                $checkOut = Carbon::parse($booking->check_out_date)->startOfDay();

                // Half-open interval: [check_in, check_out)
                if ($checkDate->gte($checkIn) && $checkDate->lt($checkOut)) {
                    return response()->json([
                        'success' => true,
                        'available' => false,
                        'reason' => 'occupied',
                        'message' => 'This slot is currently occupied',
                        'booking' => [
                            'id' => $booking->id,
                            'customer' => $booking->customer ?
                                $booking->customer->first_name . ' ' . $booking->customer->last_name : 'Unknown',
                            'check_in' => $booking->check_in_date,
                            'check_out' => $booking->check_out_date,
                        ],
                    ]);
                }
            }

            // Check for bookings on this date (half-open interval)
            $booking = Booking::where('parking_slot_id', $slotId)
                ->whereIn('status', ['pending', 'approved'])
                ->whereDate('check_in_date', '<=', $checkDate)
                ->whereDate('check_out_date', '>', $checkDate)
                ->first();

            if ($booking) {
                return response()->json([
                    'success' => true,
                    'available' => false,
                    'reason' => 'booked',
                    'message' => 'This slot is already booked for this date',
                    'booking' => [
                        'id' => $booking->id,
                        'status' => $booking->status,
                        'customer' => $booking->customer ?
                            $booking->customer->first_name . ' ' . $booking->customer->last_name : 'Unknown',
                        'check_in' => $booking->check_in_date,
                        'check_out' => $booking->check_out_date,
                    ],
                ]);
            }

            return response()->json([
                'success' => true,
                'available' => true,
                'message' => 'This slot is available',
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to check availability: ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'Failed to check availability',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get all slots with their bookable / occupied status.
     * Shows "occupied_until" date so customer knows when the slot becomes free.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function getBookableSlots()
    {
        $now = now();

        $activeTx = ParkingTransaction::with('booking')
            ->whereNull('check_out_date')
            ->get()
            ->filter(fn ($t) => $t->booking)
            ->keyBy(fn ($t) => $t->booking->parking_slot_id);

        $slots = ParkingSlot::orderBy('slot_number')->get()->map(function ($slot) use ($activeTx, $now) {
            $occupiedUntil = null;

            if ($slot->status === 'occupied') {
                $tx = $activeTx->get($slot->id);
                if ($tx) {
                    $end = $tx->booking->check_out_date;
                    // overdue na? hanggang ngayon lang
                    $occupiedUntil = ($end->lt($now) ? $now : $end)->toDateTimeString();
                }
            }

            return [
                'id'             => $slot->id,
                'slot_number'    => $slot->slot_number,
                'status'         => $slot->status,
                'nightly_rate'   => $slot->nightly_rate,
                'occupied_until' => $occupiedUntil,
            ];
        });

        return response()->json(['success' => true, 'slots' => $slots]);
    }
}
