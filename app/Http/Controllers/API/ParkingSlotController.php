<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\ParkingSlot;
use App\Models\ParkingTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ParkingSlotController extends Controller
{

public function index()
{
    try {
        $slots = ParkingSlot::orderByRaw("
            CAST(REGEXP_REPLACE(slot_number, '[^0-9]', '') AS UNSIGNED),
            slot_number
        ")->get();
        return response()->json($slots);
    } catch (\Exception $e) {
        Log::error('Index error: ' . $e->getMessage());
        return response()->json(['error' => 'Failed to fetch parking slots'], 500);
    }
}

public function getAvailable()
{
    try {
        $slots = ParkingSlot::where('status', 'available')
            ->orderByRaw("
                CAST(REGEXP_REPLACE(slot_number, '[^0-9]', '') AS UNSIGNED),
                slot_number
            ")
            ->get();
        return response()->json($slots);
    } catch (\Exception $e) {
        Log::error('Get available error: ' . $e->getMessage());
        return response()->json(['error' => 'Failed to fetch available slots'], 500);
    }
}

    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'slot_number'  => 'required|string|unique:parking_slots,slot_number',
                'nightly_rate' => 'required|numeric|min:0',
                'status'       => 'required|in:available,occupied,maintenance',
            ]);

            $slot = ParkingSlot::create($validated);
            return response()->json($slot, 201);
        } catch (\Exception $e) {
            Log::error('Store error: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request, $id)
    {
        try {
            $slot = ParkingSlot::findOrFail($id);

            $validated = $request->validate([
                'slot_number'  => 'sometimes|string|unique:parking_slots,slot_number,' . $id,
                'nightly_rate' => 'sometimes|numeric|min:0',
                'status'       => 'sometimes|in:available,occupied,maintenance',
            ]);

            // ─── Block "available" while someone is actively parked ──────────
            // Active = has a parking transaction for this slot that is not yet paid/checked out.
            if (isset($validated['status']) && $validated['status'] === 'available') {
                $hasActivePark = $this->slotHasActiveCheckIn((int) $id);

                if ($hasActivePark) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Cannot set slot to Available — a customer is currently checked in / parked on this slot. Process checkout first.',
                    ], 422);
                }
            }

            $slot->update($validated);
            return response()->json($slot);
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            Log::error('Update error: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function destroy($id)
    {
        try {
            $slot = ParkingSlot::findOrFail($id);

            // Prevent deleting occupied slots (stored status OR active check-in)
            if ($slot->status === 'occupied' || $this->slotHasActiveCheckIn((int) $id)) {
                return response()->json(['message' => 'Cannot delete occupied slot'], 422);
            }

            $slot->delete();
            return response()->json(['message' => 'Slot deleted']);
        } catch (\Exception $e) {
            Log::error('Destroy error: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Get detailed info for a specific slot, including
     * all active/upcoming bookings, customer info, vehicle info,
     * and who checked them in / approved the booking.
     */
    public function details($id)
    {
        try {
            $slot  = ParkingSlot::findOrFail($id);
            $today = now()->startOfDay();

            $bookings = Booking::with([
                    'customer',
                    'customer.vehicles',
                    'vehicle',
                    'transaction',
                    'transaction.checkedInBy',
                    'confirmedBy',
                ])
                ->where('parking_slot_id', $id)
                ->whereIn('status', ['pending', 'approved'])
                ->orderBy('check_in_date', 'asc')
                ->get()
                ->filter(function ($b) use ($today) {
                    $tx = $b->transaction;
                    // Naka-check-in pa, o hindi pa lumalampas ang check-out date
                    return ($tx && $tx->check_out_date === null)
                        || $b->check_out_date->gte($today);
                })
                ->map(function ($b) {
                    $tx       = $b->transaction;
                    $customer = $b->customer;
                    $vehicle  = $b->vehicle
                        ?? $customer?->vehicles->sortByDesc('created_at')->first();

                    return [
                        'booking_id'     => $b->id,
                        'booking_type'   => $b->booking_type,
                        'status'         => $b->status,
                        'is_checked_in'  => $tx && $tx->check_out_date === null,
                        'check_in_date'  => $b->check_in_date->format('Y-m-d H:i:s'),
                        'check_out_date' => $b->check_out_date->format('Y-m-d H:i:s'),
                        'customer'       => $customer ? [
                            'name'  => trim($customer->first_name . ' ' . $customer->last_name),
                            'phone' => $customer->phone_number,
                            'email' => $customer->email,
                        ] : null,
                        'vehicle'        => $vehicle ? [
                            'plate_number'  => $vehicle->plate_number,
                            'vehicle_model' => $vehicle->vehicle_model,
                        ] : null,
                        'checked_in_by'  => $tx?->checkedInBy
                            ? $tx->checkedInBy->first_name . ' ' . $tx->checkedInBy->last_name
                            : null,
                        'approved_by'    => $b->confirmedBy
                            ? $b->confirmedBy->first_name . ' ' . $b->confirmedBy->last_name
                            : null,
                    ];
                })
                ->sortByDesc('is_checked_in')
                ->values();

            return response()->json([
                'success'  => true,
                'slot'     => $slot,
                'bookings' => $bookings,
            ]);
        } catch (\Exception $e) {
            Log::error('Slot details error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to load slot details'], 500);
        }
    }

    /**
     * True if this slot has a customer currently checked in
     * (parking transaction exists and is not yet paid / checked out).
     */
    private function slotHasActiveCheckIn(int $slotId): bool
    {
        return ParkingTransaction::whereDoesntHave('payment', function ($q) {
                $q->where('status', 'paid');
            })
            ->whereHas('booking', function ($q) use ($slotId) {
                $q->where('parking_slot_id', $slotId);
            })
            ->exists();
    }
}
