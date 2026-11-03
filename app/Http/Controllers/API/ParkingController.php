<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\ParkingPayment;
use App\Models\ParkingTransaction;
use App\Models\ParkingSlot;
use App\Models\User;
use App\Models\Booking;
use App\Models\Vehicle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class ParkingController extends Controller
{
    // ─── Format helper ────────────────────────────────────────────────────────

    private function formatTransaction(ParkingTransaction $t): array
    {
        $booking       = $t->booking;
        $customer      = $booking->customer ?? null;
        $slot          = $booking->parkingSlot ?? null;
        $latestVehicle = $customer ? $customer->vehicles()->latest()->first() : null;

        $promo = $booking->promo;

        $rate = (float) ($slot->nightly_rate ?? 200);

        $checkIn          = Carbon::parse($booking->check_in_date);
        $expectedCheckout = Carbon::parse($booking->check_out_date);
        $expectedNights   = max(1, $checkIn->copy()->startOfDay()->diffInDays($expectedCheckout->copy()->startOfDay()));
        $expectedAmount   = $expectedNights * $rate;

        $downpayment     = $booking->downpayment;
        $downpaymentPaid = ($downpayment && $downpayment->status === 'paid')
            ? (float) $downpayment->amount_paid
            : 0;

        $payment = $t->payment;
        $status  = $payment?->status ?? 'unpaid';

        $actualCheckoutDate = null;
        $actualCheckoutTime = null;
        $actualNights       = $expectedNights;
        $totalAmount        = max(0, $expectedAmount - $downpaymentPaid);
        $changeAmount       = 0;

        if ($status === 'paid' && $t->check_out_date) {
            $actualCheckout     = Carbon::parse($t->check_out_date);
            $actualCheckoutDate = $actualCheckout->toDateString();
            $actualCheckoutTime = $actualCheckout->format('H:i:s');
            $actualNights       = max(1, $checkIn->copy()->startOfDay()->diffInDays($actualCheckout->copy()->startOfDay()));
            $totalAmount        = $payment && $payment->payment > 0
                ? (float) $payment->payment
                : max(0, ($actualNights * $rate) - (float) ($payment?->discount ?? 0) - $downpaymentPaid);
            $changeAmount       = (float) ($payment?->change_amount ?? 0);
        }

        $checkedInBy = $t->checkedInBy ? [
            'id'         => $t->checkedInBy->id,
            'first_name' => $t->checkedInBy->first_name,
            'last_name'  => $t->checkedInBy->last_name,
        ] : null;

        $checkedOutBy = $t->payment?->processedBy ? [
            'id'         => $t->payment->processedBy->id,
            'first_name' => $t->payment->processedBy->first_name,
            'last_name'  => $t->payment->processedBy->last_name,
        ] : null;

        return [
            'id'                     => $t->id,
            'transaction_number'     => 'TXN-' . str_pad($t->id, 6, '0', STR_PAD_LEFT),
            'customer_id'            => $customer?->id,
            'parking_slot_id'        => $slot?->id,
            'check_in_date'          => $checkIn->toDateString(),
            'check_in_time'          => $checkIn->format('H:i:s'),
            'expected_checkout_date' => $expectedCheckout->toDateString(),
            'expected_checkout_time' => $expectedCheckout->format('H:i:s'),
            'actual_checkout_date'   => $actualCheckoutDate,
            'actual_checkout_time'   => $actualCheckoutTime,
            'expected_nights'        => $expectedNights,
            'actual_nights_stayed'   => $actualNights,
            'expected_amount'        => max(0, $expectedAmount - $downpaymentPaid),
            'total_amount'           => $totalAmount,
            'discount'               => (float) ($payment?->discount ?? 0),
            'amount_paid'            => (float) ($payment?->amount_paid ?? 0),
            'change_amount'          => $changeAmount,
            'payment_method'         => $payment?->payment_method ?? 'cash',
            'status'                 => $status,
            'booking_type'           => $booking->booking_type ?? 'online',
            'downpayment_paid'       => $downpaymentPaid,
            'checked_in_by'          => $checkedInBy,
            'checked_out_by'         => $checkedOutBy,
            'customer'               => $customer ? [
                'id'            => $customer->id,
                'first_name'    => $customer->first_name,
                'middle_name'   => $customer->middle_name,
                'last_name'     => $customer->last_name,
                'phone_number'  => $customer->phone_number,
                'email'         => $customer->email,
                'address'       => $customer->address,
                'plate_number'  => $latestVehicle?->plate_number ?? '',
                'vehicle_model' => $latestVehicle?->vehicle_model ?? '',
            ] : null,
            'parking_slot' => $slot ? [
                'id'           => $slot->id,
                'slot_number'  => $slot->slot_number,
                'nightly_rate' => $slot->nightly_rate,
            ] : null,
            'promo' => $promo ? [
                'id'          => $promo->id,
                'title'       => $promo->title,
                'description' => $promo->description,
                'discount'    => (float) $promo->discount,
            ] : null,
            'promos' => $promo ? [[
                'id'          => $promo->id,
                'title'       => $promo->title,
                'description' => $promo->description,
                'discount'    => (float) $promo->discount,
            ]] : [],
        ];
    }

    // ─── Active transactions ──────────────────────────────────────────────────

    public function getActive()
    {
        try {
            $active = ParkingTransaction::whereDoesntHave('payment', function ($q) {
                $q->where('status', 'paid');
            })
                ->with([
                    'booking.customer',
                    'booking.customer.vehicles',
                    'booking.parkingSlot',
                    'booking.promo',
                    'booking.downpayment',
                    'payment',
                    'payment.processedBy',
                    'checkedInBy',
                ])
                ->get();

            return response()->json($active->map(fn ($t) => $this->formatTransaction($t)));
        } catch (\Exception $e) {
            Log::error('Get active error: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch active transactions'], 500);
        }
    }

    // ─── History ──────────────────────────────────────────────────────────────

    public function getHistory()
    {
        try {
            $history = ParkingTransaction::whereHas('payment', function ($q) {
                $q->where('status', 'paid');
            })
                ->orderBy('created_at', 'desc')
                ->with([
                    'booking.customer',
                    'booking.customer.vehicles',
                    'booking.parkingSlot',
                    'booking.promo',
                    'booking.downpayment',
                    'payment',
                    'payment.processedBy',
                    'checkedInBy',
                ])
                ->paginate(50);

            $mapped = $history->getCollection()->map(fn ($t) => $this->formatTransaction($t));

            return response()->json([
                'data'         => $mapped,
                'current_page' => $history->currentPage(),
                'last_page'    => $history->lastPage(),
                'total'        => $history->total(),
            ]);
        } catch (\Exception $e) {
            Log::error('Get history error: ' . $e->getMessage());
            return response()->json(['data' => [], 'current_page' => 1, 'last_page' => 1, 'total' => 0]);
        }
    }

    // ─── Today check-ins ──────────────────────────────────────────────────────

    public function todayCheckins()
    {
        try {
            $transactions = ParkingTransaction::whereDoesntHave('payment', function ($q) {
                $q->where('status', 'paid');
            })
                ->with([
                    'booking.customer',
                    'booking.customer.vehicles',
                    'booking.parkingSlot',
                    'booking.promo',
                ])
                ->get();

            $now = Carbon::now();

            $checkins = $transactions->map(function (ParkingTransaction $t) use ($now) {
                $customer      = $t->booking->customer ?? null;
                $latestVehicle = $customer ? $customer->vehicles()->latest()->first() : null;
                $checkInTime   = Carbon::parse($t->booking->check_in_date);
                $minutesAgo    = $checkInTime->diffInMinutes($now, false);

                $promo = $t->booking->promo;

                $today = Carbon::today();
                if ($checkInTime->isToday()) {
                    $status = ($minutesAgo <= 30 && $minutesAgo >= 0) ? 'just_now' : 'today';
                } else {
                    $status = $checkInTime->lt($today) ? 'overdue' : 'today';
                }

                return [
                    'id'                 => $t->id,
                    'transaction_number' => 'TXN-' . str_pad($t->id, 6, '0', STR_PAD_LEFT),
                    'customer_name'      => $customer ? trim($customer->first_name . ' ' . $customer->last_name) : 'Unknown',
                    'phone_number'       => $customer?->phone_number ?? '',
                    'vehicle_model'      => $latestVehicle?->vehicle_model ?? '',
                    'plate_number'       => $latestVehicle?->plate_number ?? '',
                    'check_in_time'      => $checkInTime->format('H:i:s'),
                    'status'             => $status,
                    'promos'             => $promo ? [[
                        'id'       => $promo->id,
                        'title'    => $promo->title,
                        'discount' => (float) $promo->discount,
                    ]] : [],
                    'promo' => $promo ? [
                        'id'    => $promo->id,
                        'title' => $promo->title,
                    ] : null,
                ];
            });

            return response()->json([
                'success'  => true,
                'count'    => $checkins->count(),
                'checkins' => $checkins->values(),
            ]);
        } catch (\Exception $e) {
            Log::error('Today checkins error: ' . $e->getMessage());
            return response()->json(['success' => false, 'count' => 0, 'checkins' => [], 'error' => $e->getMessage()], 500);
        }
    }

    // ─── Walk-in Check-in ─────────────────────────────────────────────────────

    public function checkIn(Request $request)
    {
        try {
            $user = auth()->user();
            if (! in_array($user->role, ['admin', 'staff'])) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $validator = Validator::make($request->all(), [
                'first_name'              => 'required|string',
                'last_name'               => 'required|string',
                'phone_number'            => 'required|string',
                'plate_number'            => 'required|string',
                'vehicle_model'           => 'required|string',
                'parking_slot_id'         => 'required|exists:parking_slots,id',
                'check_in_date'           => 'required|date',
                'check_in_time'           => 'required',
                'expected_checkout_date'  => 'required|date',
                'expected_checkout_time'  => 'required',
                'expected_nights'         => 'required|integer|min:1',
                'expected_amount'         => 'required|numeric',
            ]);

            if ($validator->fails()) {
                return response()->json(['errors' => $validator->errors()], 422);
            }

            $slot = ParkingSlot::findOrFail($request->parking_slot_id);
            if ($slot->status !== 'available') {
                return response()->json(['message' => 'Parking slot is not available'], 422);
            }

            DB::beginTransaction();

            $customer = User::where('phone_number', $request->phone_number)
                ->where('role', 'customer')
                ->first();

            if (! $customer) {
                $customer = User::create([
                    'first_name'   => $request->first_name,
                    'middle_name'  => $request->middle_name ?? null,
                    'last_name'    => $request->last_name,
                    'phone_number' => $request->phone_number,
                    'email'        => $request->email ?? $request->phone_number . '@guest.com',
                    'address'      => $request->address ?? null,
                    'password'     => bcrypt('defaultpassword'),
                    'role'         => 'customer',
                    'is_active'    => true,
                ]);
            } else {
                $customer->update([
                    'first_name'  => $request->first_name,
                    'middle_name' => $request->middle_name ?? $customer->middle_name,
                    'last_name'   => $request->last_name,
                    'address'     => $request->address ?? $customer->address,
                ]);
            }

            $vehicle = Vehicle::updateOrCreate(
                ['customer_id' => $customer->id, 'plate_number' => $request->plate_number],
                ['vehicle_model' => $request->vehicle_model]
            );

            $checkInDateTime          = Carbon::parse($request->check_in_date . ' ' . $request->check_in_time);
            $expectedCheckoutDateTime = Carbon::parse($request->expected_checkout_date . ' ' . $request->expected_checkout_time);

            $booking = Booking::create([
                'customer_id'     => $customer->id,
                'vehicle_id'      => $vehicle->id,
                'parking_slot_id' => $request->parking_slot_id,
                'check_in_date'   => $checkInDateTime,
                'check_out_date'  => $expectedCheckoutDateTime,
                'confirm_by_id'   => $user->id,
                'status'          => 'approved',
                'booking_type'    => 'walk_in',
                'promo_id'        => null,
            ]);

            $transaction = ParkingTransaction::create([
                'booking_id'     => $booking->id,
                'check_out_date' => null,
                'checked_in_by'  => $user->id,
            ]);

            $slot->update(['status' => 'occupied']);

            DB::commit();

            // ─── NOTIFICATIONS ────────────────────────────────────────────
            $staffUsers = User::whereIn('role', ['admin', 'staff'])->get();
            foreach ($staffUsers as $staff) {
                NotificationController::createNotification(
                    $staff->id,
                    '🚗 New Check-in',
                    "{$booking->customer?->first_name} checked in to Slot {$slot->slot_number}",
                    'info',
                    [
                        'customer' => $booking->customer?->first_name . ' ' . $booking->customer?->last_name,
                        'slot'     => $slot->slot_number,
                        'check_in' => $checkInDateTime->format('Y-m-d H:i:s'),
                        'category' => 'parking',
                    ]
                );
            }

            return response()->json([
                'success' => true,
                'message' => 'Check-in successful',
                'data'    => [
                    'transaction_id'     => $transaction->id,
                    'transaction_number' => 'TXN-' . str_pad($transaction->id, 6, '0', STR_PAD_LEFT),
                    'customer_name'      => $customer->first_name . ' ' . $customer->last_name,
                    'slot_number'        => $slot->slot_number,
                    'check_in'           => $checkInDateTime->format('Y-m-d H:i:s'),
                    'expected_checkout'  => $expectedCheckoutDateTime->format('Y-m-d H:i:s'),
                    'promos'             => [],
                    'promo'              => null,
                ],
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Check-in error: ' . $e->getMessage());
            return response()->json(['message' => 'Check-in failed: ' . $e->getMessage()], 500);
        }
    }

    // ─── Check-in existing approved booking ──────────────────────────────────

    public function checkInExisting(Request $request)
    {
        try {
            $user = auth()->user();
            if (! in_array($user->role, ['admin', 'staff'])) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $request->validate(['booking_id' => 'required|exists:bookings,id']);

            DB::beginTransaction();

            $booking = Booking::with(['promo'])->findOrFail($request->booking_id);

            if ($booking->status !== 'approved') {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Booking must be approved first. Current status: ' . $booking->status,
                ], 422);
            }

            $existingTx = ParkingTransaction::where('booking_id', $booking->id)->first();
            if ($existingTx) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Customer is already checked in for this booking.',
                ], 422);
            }

            $slot = ParkingSlot::findOrFail($booking->parking_slot_id);

            if ($slot->status !== 'available') {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Parking slot is not available. Current status: ' . $slot->status,
                ], 422);
            }

            $slot->status = 'occupied';
            $slot->save();

            $transaction = ParkingTransaction::create([
                'booking_id'     => $booking->id,
                'check_out_date' => null,
                'checked_in_by'  => $user->id,
            ]);

            DB::commit();

            $promo = $booking->promo;

            return response()->json([
                'success' => true,
                'message' => 'Customer checked in successfully!',
                'data'    => [
                    'transaction_id' => $transaction->id,
                    'booking_id'     => $booking->id,
                    'slot_number'    => $slot->slot_number,
                    'promos'         => $promo ? [[
                        'id'       => $promo->id,
                        'title'    => $promo->title,
                        'discount' => (float) $promo->discount,
                    ]] : [],
                    'promo' => $promo ? [
                        'id'    => $promo->id,
                        'title' => $promo->title,
                    ] : null,
                ],
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Check-in existing error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Check-in failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ─── Extend stay (staff/admin) ────────────────────────────────────────────

    public function extend(Request $request, $id)
    {
        try {
            $user = auth()->user();
            if (! in_array($user->role, ['admin', 'staff'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Only administrators and staff can extend a stay.',
                ], 403);
            }

            $validator = Validator::make($request->all(), [
                'check_out_date' => 'required|date',
                'check_out_time' => 'required',
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'errors'  => $validator->errors(),
                ], 422);
            }

            $transaction = ParkingTransaction::with([
                'booking.parkingSlot',
                'booking.customer',
                'payment',
            ])->findOrFail($id);

            $booking = $transaction->booking;

            if (! $booking) {
                return response()->json([
                    'success' => false,
                    'message' => 'Booking not found for this transaction.',
                ], 404);
            }

            $oldOut = Carbon::parse($booking->check_out_date);
            $newOut = Carbon::parse($request->check_out_date . ' ' . $request->check_out_time);

            if ($error = $booking->extendTo($newOut)) {
                return response()->json(['success' => false, 'message' => $error], 422);
            }

            // ─── Notify staff/admin ─────────────────────────────────────
            $staffUsers = User::whereIn('role', ['admin', 'staff'])->get();
            foreach ($staffUsers as $staff) {
                NotificationController::createNotification(
                    $staff->id,
                    '⏱️ Stay Extended',
                    "Slot {$booking->parkingSlot?->slot_number} extended to "
                        . $newOut->format('M d, Y h:i A') . '.',
                    'info',
                    [
                        'booking_id'     => $booking->id,
                        'transaction_id' => $transaction->id,
                        'old_check_out'  => $oldOut->toDateTimeString(),
                        'new_check_out'  => $newOut->toDateTimeString(),
                        'category'       => 'parking',
                    ]
                );
            }

            Log::info('Stay extended by staff/admin', [
                'transaction_id' => $transaction->id,
                'booking_id'     => $booking->id,
                'old_check_out'  => $oldOut->toDateTimeString(),
                'new_check_out'  => $newOut->toDateTimeString(),
                'extended_by'    => $user->id,
            ]);

            return response()->json([
                'success'        => true,
                'message'        => 'Stay extended successfully.',
                'booking_id'     => $booking->id,
                'transaction_id' => $transaction->id,
                'check_out_date' => $newOut->format('Y-m-d H:i:s'),
            ]);
        } catch (\Exception $e) {
            Log::error('Extend stay error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to extend stay: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ─── Check-out ────────────────────────────────────────────────────────────

    public function checkOut(Request $request, $id)
    {
        try {
            $user = auth()->user();
            if (! in_array($user->role, ['admin', 'staff'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Only administrators and staff can process checkout.',
                ], 403);
            }

            $validator = Validator::make($request->all(), [
                'amount_paid'    => 'required|numeric|min:0',
                'discount'       => 'nullable|numeric|min:0',
                'payment_method' => 'required|in:cash,gcash',
            ]);

            if ($validator->fails()) {
                return response()->json(['errors' => $validator->errors()], 422);
            }

            $transaction = ParkingTransaction::with([
                'booking.parkingSlot',
                'booking.promo',
                'booking.downpayment',
                'payment',
            ])->findOrFail($id);

            if ($transaction->payment && $transaction->payment->status === 'paid') {
                return response()->json(['message' => 'Transaction is already completed'], 422);
            }

            // ─── Compute nights ──────────────────────────────────────────
            $checkIn     = Carbon::parse($transaction->booking->check_in_date)->startOfDay();
            $expectedOut = Carbon::parse($transaction->booking->check_out_date)->startOfDay();
            $checkOutNow = Carbon::now();

            $actualNights   = max(1, $checkIn->diffInDays($checkOutNow->copy()->startOfDay()));
            $expectedNights = max(1, $checkIn->diffInDays($expectedOut));

            // ✅ Manual discount only — no auto-rate swap, no promo auto-apply
            $baseRate    = (float) ($transaction->booking->parkingSlot->nightly_rate ?? 200);
            $totalAmount = $actualNights * $baseRate;

            // ✅ Discount is whatever the staff typed in (default 0)
            $discount = $request->filled('discount')
                ? (float) $request->discount
                : 0.0;

            // ─── Downpayment ─────────────────────────────────────────────
            $downpayment     = $transaction->booking->downpayment;
            $downpaymentPaid = ($downpayment && $downpayment->status === 'paid')
                ? (float) $downpayment->amount_paid
                : 0;

            $amountPaid   = (float) $request->amount_paid;
            $finalAmount  = max(0, $totalAmount - $discount - $downpaymentPaid);
            $changeAmount = $amountPaid - $finalAmount;

            if ($changeAmount < 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Insufficient payment. Total due: ₱' . number_format($finalAmount, 2),
                ], 422);
            }

            DB::beginTransaction();

            $transaction->check_out_date = $checkOutNow;
            $transaction->save();

            ParkingPayment::updateOrCreate(
                ['parking_transaction_id' => $transaction->id],
                [
                    'payment'        => (int) $finalAmount,
                    'discount'       => (int) $discount,
                    'amount_paid'    => (int) $amountPaid,
                    'change_amount'  => (int) $changeAmount,
                    'payment_method' => $request->payment_method,
                    'status'         => 'paid',
                    'processed_by'   => $user->id,
                ]
            );

            if ($transaction->booking && $transaction->booking->parkingSlot) {
                $transaction->booking->parkingSlot->status = 'available';
                $transaction->booking->parkingSlot->save();
            }

            if ($transaction->booking) {
                $transaction->booking->update(['status' => 'completed']);
            }

            DB::commit();

            // ─── NOTIFICATIONS ───────────────────────────────────────────
            $staffUsers = User::whereIn('role', ['admin', 'staff'])->get();
            foreach ($staffUsers as $staff) {
                NotificationController::createNotification(
                    $staff->id,
                    '✅ Check-out Complete',
                    "{$transaction->booking?->customer?->first_name} checked out from Slot {$transaction->booking?->parkingSlot?->slot_number}",
                    'success',
                    [
                        'customer' => $transaction->booking?->customer?->first_name . ' ' .
                            $transaction->booking?->customer?->last_name,
                        'slot'     => $transaction->booking?->parkingSlot?->slot_number,
                        'nights'   => $actualNights,
                        'total'    => $finalAmount,
                        'category' => 'parking',
                    ]
                );
            }

            Log::info('Checkout successful (manual discount)', [
                'transaction_id'   => $id,
                'base_rate'        => $baseRate,
                'actual_nights'    => $actualNights,
                'expected_nights'  => $expectedNights,
                'total_amount'     => $finalAmount,
                'discount'         => $discount,
                'downpayment_paid' => $downpaymentPaid,
                'amount_paid'      => $amountPaid,
                'change_amount'    => $changeAmount,
            ]);

            return response()->json([
                'success'          => true,
                'message'          => "Checkout successful — {$actualNights} nights at ₱{$baseRate}/night",
                'total_amount'     => $finalAmount,
                'discount'         => $discount,
                'downpayment_paid' => $downpaymentPaid,
                'amount_paid'      => $amountPaid,
                'change_amount'    => max(0, $changeAmount),
                'nights_stayed'    => $actualNights,
                'expected_nights'  => $expectedNights,
                'base_rate'        => $baseRate,
                'change'           => max(0, $changeAmount),
                'checked_out_at'   => $checkOutNow->format('Y-m-d H:i:s'),
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Checkout error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Checkout failed: ' . $e->getMessage(),
            ], 500);
        }
    }
}