<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Booking;
use App\Models\ParkingSlot;
use App\Models\ParkingTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class BookingController extends Controller
{
    // ─── Create booking (customer) ────────────────────────────────────────────

    public function createBooking(Request $request)
    {
        Log::info('Create booking request received', $request->all());

        try {
            $user = auth()->user();

            if (! $user) {
                return response()->json(['success' => false, 'message' => 'User not authenticated'], 401);
            }

            if ($user->role !== 'customer') {
                return response()->json(['success' => false, 'message' => 'Customer only'], 403);
            }

            $validator = Validator::make($request->all(), [
                'first_name'      => 'required|string|max:255',
                'middle_name'     => 'nullable|string|max:255',
                'last_name'       => 'required|string|max:255',
                'phone_number'    => 'required|string|max:20',
                'email'           => 'nullable|email|max:255',
                'address'         => 'nullable|string',
                'plate_number'    => 'required|string|max:20',
                'vehicle_model'   => 'required|string|max:255',
                'parking_slot_id' => 'required|exists:parking_slots,id',
                'check_in_date'   => 'required|date',
                'check_in_time'   => 'required',
                'check_out_date'  => 'required|date|after:check_in_date',
                'check_out_time'  => 'required',
            ]);

            if ($validator->fails()) {
                return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
            }

            $slot = ParkingSlot::find($request->parking_slot_id);
            if (! $slot) {
                return response()->json(['success' => false, 'message' => 'Parking slot not found'], 404);
            }

            // ✅ BAGONG CODE — maintenance lang ang bawal, hindi "not available"
            if ($slot->status === 'maintenance') {
                return response()->json(['success' => false, 'message' => 'This slot is under maintenance'], 422);
            }

            $user->update([
                'first_name'   => $request->first_name,
                'middle_name'  => $request->middle_name,
                'last_name'    => $request->last_name,
                'phone_number' => $request->phone_number,
                'address'      => $request->address,
            ]);

            $vehicle = Vehicle::updateOrCreate(
                ['customer_id' => $user->id, 'plate_number' => strtoupper($request->plate_number)],
                ['vehicle_model' => $request->vehicle_model]
            );

            $checkInDateTime  = Carbon::parse($request->check_in_date . ' ' . $request->check_in_time);
            $checkOutDateTime = Carbon::parse($request->check_out_date . ' ' . $request->check_out_time);

            // ✅ BAGONG CODE — Overlap check: bawal lang kung nag-o-overlap ang dates
            $conflict = Booking::where('parking_slot_id', $slot->id)
                ->whereIn('status', ['pending', 'approved'])
                ->where('check_in_date', '<', $checkOutDateTime)
                ->where('check_out_date', '>', $checkInDateTime)
                ->orderBy('check_out_date', 'desc')
                ->first();

            if ($conflict) {
                return response()->json([
                    'success' => false,
                    'message' => 'This slot is already booked until '
                        . $conflict->check_out_date->format('M d, Y h:i A')
                        . '. Please choose dates after that.',
                ], 422);
            }

            $nights      = max(1, ceil($checkInDateTime->diffInHours($checkOutDateTime) / 24));
            $totalAmount = $nights * $slot->nightly_rate;

            $booking = Booking::create([
                'customer_id'     => $user->id,
                'vehicle_id'      => $vehicle->id,
                'parking_slot_id' => $request->parking_slot_id,
                'check_in_date'   => $checkInDateTime,
                'check_out_date'  => $checkOutDateTime,
                'status'          => 'pending',
                'booking_type'    => 'online',
            ]);

            // ─── CREATE NOTIFICATIONS (persisted — poller picks them up) ─────

            $staffUsers = User::whereIn('role', ['admin', 'staff'])->get();
            foreach ($staffUsers as $staff) {
                NotificationController::createNotification(
                    $staff->id,
                    '📌 New Booking Request',
                    "Customer {$user->first_name} {$user->last_name} booked Slot {$slot->slot_number}.",
                    'info',
                    [
                        'booking_id' => $booking->id,
                        'customer'   => $user->first_name . ' ' . $user->last_name,
                        'slot'       => $slot->slot_number,
                        'check_in'   => $checkInDateTime->format('Y-m-d H:i:s'),
                        'check_out'  => $checkOutDateTime->format('Y-m-d H:i:s'),
                        'category'   => 'booking',
                        'priority'   => 'high',
                    ]
                );
            }

            Log::info('Booking created successfully', ['booking_id' => $booking->id]);

            return response()->json([
                'success' => true,
                'message' => 'Booking submitted. Waiting for admin approval.',
                'booking' => [
                    'id'             => $booking->id,
                    'slot_number'    => $slot->slot_number,
                    'check_in_date'  => $checkInDateTime->format('Y-m-d H:i:s'),
                    'check_out_date' => $checkOutDateTime->format('Y-m-d H:i:s'),
                    'nights'         => $nights,
                    'total_amount'   => $totalAmount,
                    'status'         => $booking->status,
                ],
            ], 201);
        } catch (\Exception $e) {
            Log::error('Create booking error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to create booking: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ─── My bookings ──────────────────────────────────────────────────────────

    public function myBookings()
    {
        try {
            $user = auth()->user();

            if (! $user || $user->role !== 'customer') {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $bookings = Booking::where('customer_id', $user->id)
                ->whereNotIn('status', ['rejected'])
                ->with(['parkingSlot', 'transaction', 'transaction.payment', 'downpayment'])
                ->orderBy('created_at', 'desc')
                ->get()
                ->map(function ($booking) use ($user) {
                    $vehicle = $user->vehicles()->latest()->first();

                    $checkInDate  = $booking->check_in_date instanceof Carbon
                        ? $booking->check_in_date
                        : Carbon::parse($booking->check_in_date);

                    $checkOutDate = $booking->check_out_date instanceof Carbon
                        ? $booking->check_out_date
                        : Carbon::parse($booking->check_out_date);

                    $nights      = max(1, ceil($checkInDate->diffInHours($checkOutDate) / 24));
                    $totalAmount = $nights * ($booking->parkingSlot->nightly_rate ?? 0);

                    $tx           = $booking->transaction;
                    $hasCheckedIn = $booking->status === 'approved'
                        && $tx !== null
                        && ! ($tx->payment && $tx->payment->status === 'paid');

                    $dp = $booking->downpayment;

                    return [
                        'id'             => $booking->id,
                        'slot_number'    => $booking->parkingSlot->slot_number ?? 'N/A',
                        'nightly_rate'   => $booking->parkingSlot->nightly_rate ?? 0,
                        'check_in_date'  => $checkInDate->format('Y-m-d H:i:s'),
                        'check_out_date' => $checkOutDate->format('Y-m-d H:i:s'),
                        'nights'         => $nights,
                        'total_amount'   => $totalAmount,
                        'status'         => $booking->status,
                        'has_checked_in' => $hasCheckedIn,
                        'created_at'     => $booking->created_at->format('Y-m-d H:i:s'),
                        'vehicle'        => $vehicle ? [
                            'plate_number'  => $vehicle->plate_number,
                            'vehicle_model' => $vehicle->vehicle_model,
                        ] : null,
                        'downpayment_status'    => $dp?->status,
                        'downpayment_amount'    => $dp
                            ? (float) ($dp->status === 'paid' ? $dp->amount_paid : $dp->payment)
                            : null,
                        'downpayment_reference' => $dp?->reference_number,
                        'downpayment_gcash_ref' => $dp?->paymongo_payment_id,
                    ];
                });

            return response()->json(['success' => true, 'bookings' => $bookings]);
        } catch (\Exception $e) {
            Log::error('My bookings error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to fetch bookings', 'bookings' => []], 500);
        }
    }

    // ─── Show booking ─────────────────────────────────────────────────────────

    public function showBooking($id)
    {
        try {
            $user = auth()->user();

            $booking = Booking::where('customer_id', $user->id)
                ->with(['parkingSlot'])
                ->findOrFail($id);

            $checkInDate  = $booking->check_in_date instanceof Carbon
                ? $booking->check_in_date
                : Carbon::parse($booking->check_in_date);

            $checkOutDate = $booking->check_out_date instanceof Carbon
                ? $booking->check_out_date
                : Carbon::parse($booking->check_out_date);

            $nights = max(1, ceil($checkInDate->diffInHours($checkOutDate) / 24));

            return response()->json([
                'success' => true,
                'booking' => [
                    'id'             => $booking->id,
                    'slot_number'    => $booking->parkingSlot->slot_number ?? 'N/A',
                    'nightly_rate'   => $booking->parkingSlot->nightly_rate ?? 0,
                    'check_in_date'  => $checkInDate->format('Y-m-d H:i:s'),
                    'check_out_date' => $checkOutDate->format('Y-m-d H:i:s'),
                    'nights'         => $nights,
                    'total_amount'   => $nights * ($booking->parkingSlot->nightly_rate ?? 0),
                    'status'         => $booking->status,
                    'created_at'     => $booking->created_at->format('Y-m-d H:i:s'),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Booking not found'], 404);
        }
    }

    // ─── Cancel booking (customer) ────────────────────────────────────────────

    public function cancelBooking($id)
    {
        try {
            $user = auth()->user();

            if (! $user) {
                return response()->json(['success' => false, 'message' => 'User not authenticated'], 401);
            }

            $booking = Booking::where('customer_id', $user->id)->where('id', $id)->first();

            if (! $booking) {
                return response()->json(['success' => false, 'message' => 'Booking not found.'], 404);
            }

            if ($booking->status !== 'pending') {
                return response()->json([
                    'success' => false,
                    'message' => 'Only pending bookings can be cancelled. Current status: ' . $booking->status,
                ], 422);
            }

            DB::table('bookings')
                ->where('id', $id)
                ->update(['status' => 'cancelled', 'updated_at' => now()]);

            Log::info('Booking cancelled by customer', ['booking_id' => $booking->id, 'customer_id' => $user->id]);

            return response()->json(['success' => true, 'message' => 'Booking cancelled successfully.']);
        } catch (\Exception $e) {
            Log::error('Cancel booking error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to cancel booking: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ─── Customer check-in ────────────────────────────────────────────────────

    public function checkIn($id)
    {
        try {
            $user = auth()->user();

            if (! $user) {
                return response()->json(['success' => false, 'message' => 'User not authenticated'], 401);
            }

            $booking = Booking::where('customer_id', $user->id)
                ->where('id', $id)
                ->where('status', 'approved')
                ->with(['parkingSlot'])
                ->first();

            if (! $booking) {
                return response()->json(['success' => false, 'message' => 'Approved booking not found.'], 404);
            }

            $existingTx = ParkingTransaction::where('booking_id', $booking->id)->first();
            if ($existingTx) {
                return response()->json([
                    'success' => false,
                    'message' => 'You have already checked in for this booking.',
                ], 422);
            }

            // ✅ BAGONG CODE — guard: hindi makakapag-check in kung may naunang guest pa
            $slotBusy = ParkingTransaction::whereNull('check_out_date')
                ->where('booking_id', '!=', $booking->id)
                ->whereHas('booking', fn ($q) => $q->where('parking_slot_id', $booking->parking_slot_id))
                ->exists();

            if ($slotBusy) {
                return response()->json([
                    'success' => false,
                    'message' => 'The slot is still occupied by the previous guest. Please wait for checkout.',
                ], 422);
            }

            DB::beginTransaction();

            try {
                $slot = ParkingSlot::find($booking->parking_slot_id);

                if ($slot && $slot->status !== 'occupied') {
                    $slot->status = 'occupied';
                    $slot->save();
                }

                ParkingTransaction::create([
                    'booking_id'     => $booking->id,
                    'rate_per_night' => $slot->nightly_rate ?? 250,
                    'check_out_date' => null,
                ]);

                DB::commit();

                Log::info('Customer checked in', ['booking_id' => $booking->id, 'customer_id' => $user->id]);

                return response()->json(['success' => true, 'message' => 'Check-in successful! Welcome!']);
            } catch (\Exception $e) {
                DB::rollBack();
                throw $e;
            }
        } catch (\Exception $e) {
            Log::error('Check-in error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Check-in failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ─── Extend stay (customer) ───────────────────────────────────────────────

    public function extendBooking(Request $request, $id)
    {
        try {
            $user = auth()->user();

            if (! $user) {
                return response()->json(['success' => false, 'message' => 'User not authenticated'], 401);
            }

            $validator = Validator::make($request->all(), [
                'check_out_date' => 'required|date',
                'check_out_time' => 'required',
            ]);

            if ($validator->fails()) {
                return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
            }

            $booking = Booking::with(['transaction.payment', 'parkingSlot', 'customer'])
                ->where('customer_id', $user->id)
                ->where('id', $id)
                ->first();

            if (! $booking) {
                return response()->json(['success' => false, 'message' => 'Booking not found.'], 404);
            }

            $oldOut = $booking->check_out_date->copy();
            $newOut = Carbon::parse($request->check_out_date . ' ' . $request->check_out_time);

            if ($error = $booking->extendTo($newOut)) {
                return response()->json(['success' => false, 'message' => $error], 422);
            }

            // Notify staff/admin
            foreach (User::whereIn('role', ['admin', 'staff'])->get() as $staff) {
                NotificationController::createNotification(
                    $staff->id,
                    '⏱️ Stay Extended',
                    "{$user->first_name} {$user->last_name} extended Slot {$booking->parkingSlot?->slot_number} to "
                        . $newOut->format('M d, Y h:i A') . '.',
                    'info',
                    [
                        'booking_id'    => $booking->id,
                        'old_check_out' => $oldOut->toDateTimeString(),
                        'new_check_out' => $newOut->toDateTimeString(),
                        'category'      => 'parking',
                    ]
                );
            }

            return response()->json([
                'success'        => true,
                'message'        => 'Stay extended successfully.',
                'check_out_date' => $newOut->format('Y-m-d H:i:s'),
            ]);
        } catch (\Exception $e) {
            Log::error('Extend booking error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to extend stay.',
            ], 500);
        }
    }

    // ─── Vehicles ─────────────────────────────────────────────────────────────

    public function myVehicles()
    {
        try {
            $user = auth()->user();
            if (! $user) {
                return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
            }

            $vehicles = Vehicle::where('customer_id', $user->id)
                ->orderBy('created_at', 'desc')
                ->get();

            return response()->json(['success' => true, 'vehicles' => $vehicles]);
        } catch (\Exception $e) {
            Log::error('Get vehicles error: ' . $e->getMessage());
            return response()->json(['success' => false, 'vehicles' => []], 500);
        }
    }

    public function addVehicle(Request $request)
    {
        try {
            $user = auth()->user();
            if (! $user) {
                return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
            }

            $validator = Validator::make($request->all(), [
                'plate_number'  => 'required|string|max:20',
                'vehicle_model' => 'required|string|max:255',
            ]);

            if ($validator->fails()) {
                return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
            }

            $vehicle = Vehicle::updateOrCreate(
                ['customer_id' => $user->id, 'plate_number' => strtoupper(trim($request->plate_number))],
                ['vehicle_model' => trim($request->vehicle_model)]
            );

            return response()->json([
                'success' => true,
                'message' => 'Vehicle saved successfully.',
                'vehicle' => $vehicle,
            ], 201);
        } catch (\Exception $e) {
            Log::error('Add vehicle error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to save vehicle.'], 500);
        }
    }

    public function updateVehicle(Request $request, $id)
    {
        try {
            $user = auth()->user();
            if (! $user) {
                return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
            }

            $validator = Validator::make($request->all(), [
                'plate_number'  => 'required|string|max:20',
                'vehicle_model' => 'required|string|max:255',
            ]);

            if ($validator->fails()) {
                return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
            }

            $vehicle = Vehicle::where('id', $id)->where('customer_id', $user->id)->first();

            if (! $vehicle) {
                return response()->json(['success' => false, 'message' => 'Vehicle not found.'], 404);
            }

            $newPlate  = strtoupper(trim($request->plate_number));
            $duplicate = Vehicle::where('customer_id', $user->id)
                ->where('plate_number', $newPlate)
                ->where('id', '!=', $id)
                ->first();

            if ($duplicate) {
                return response()->json([
                    'success' => false,
                    'message' => 'You already have a vehicle with plate number ' . $newPlate,
                ], 422);
            }

            $vehicle->update([
                'plate_number'  => $newPlate,
                'vehicle_model' => trim($request->vehicle_model),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Vehicle updated successfully.',
                'vehicle' => $vehicle,
            ]);
        } catch (\Exception $e) {
            Log::error('Update vehicle error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to update vehicle.'], 500);
        }
    }

    public function deleteVehicle($id)
    {
        try {
            $user = auth()->user();
            if (! $user) {
                return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
            }

            $vehicle = Vehicle::where('id', $id)->where('customer_id', $user->id)->first();

            if (! $vehicle) {
                return response()->json(['success' => false, 'message' => 'Vehicle not found.'], 404);
            }

            $vehicleCount = Vehicle::where('customer_id', $user->id)->count();
            if ($vehicleCount <= 1) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete your only vehicle. You must have at least one vehicle.',
                ], 422);
            }

            $vehicle->delete();

            return response()->json(['success' => true, 'message' => 'Vehicle removed.']);
        } catch (\Exception $e) {
            Log::error('Delete vehicle error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to delete vehicle.'], 500);
        }
    }
}
