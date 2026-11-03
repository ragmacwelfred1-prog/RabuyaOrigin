<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\User;
use App\Models\ParkingSlot;
use App\Models\ParkingTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class AdminBookingController extends Controller
{
    // ─── Pending bookings (simple version) ────────────────────────────────────

    public function getPendingBookings()
    {
        try {
            $bookings = Booking::where('status', 'pending')
                ->with(['customer', 'parkingSlot', 'customer.vehicles'])
                ->orderBy('created_at', 'asc')
                ->get();

            $transformed = $bookings->map(function ($booking) {
                $customer = $booking->customer;
                if ($customer) {
                    $latestVehicle = $customer->vehicles->sortByDesc('created_at')->first();
                    $customer->vehicle_model = $latestVehicle->vehicle_model ?? '';
                    $customer->plate_number  = $latestVehicle->plate_number  ?? '';
                }
                return $booking;
            });

            return response()->json($transformed);
        } catch (\Exception $e) {
            Log::error('Get pending bookings error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([], 500);
        }
    }

    // ─── All bookings ─────────────────────────────────────────────────────────

    public function getAllBookings(Request $request)
    {
        try {
            $status = $request->input('status');
            $query = Booking::with([
                'customer',
                'parkingSlot',
                'customer.vehicles',
                'transaction',
                'transaction.payment',
                'downpayment',
                'confirmedBy',
            ])->orderBy('created_at', 'desc');
            if ($status && in_array($status, ['pending', 'approved', 'rejected', 'cancelled', 'completed'])) {
                $query->where('status', $status);
            }
            $bookings = $query->get();
            $bookings->each(function ($booking) {
                if ($booking->customer) {
                    $latestVehicle = $booking->customer->vehicles->sortByDesc('created_at')->first();
                    $booking->customer->plate_number  = $latestVehicle?->plate_number  ?? '';
                    $booking->customer->vehicle_model = $latestVehicle?->vehicle_model ?? '';
                }
                $booking->has_checked_in = $this->isCheckedIn($booking->transaction);

                $booking->downpayment_status   = $booking->downpayment?->status;
                $booking->downpayment_amount   = $booking->downpayment
                    ? (float) $booking->downpayment->amount_paid
                    : null;
                $booking->downpayment_reference = $booking->downpayment?->reference_number;
                $booking->downpayment_gcash_ref = $booking->downpayment?->paymongo_payment_id;

                $booking->approved_by = $booking->confirmedBy ? [
                    'first_name' => $booking->confirmedBy->first_name,
                    'last_name'  => $booking->confirmedBy->last_name,
                ] : null;
            });

            return response()->json($bookings);
        } catch (\Exception $e) {
            Log::error('Get all bookings error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([], 500);
        }
    }

    // ─── All Pending Bookings (with downpayment) ─────────────────────────────

    public function getAllPendingBookings()
    {
        try {
            $bookings = Booking::where('status', 'pending')
                ->with(['customer', 'parkingSlot', 'customer.vehicles', 'downpayment', 'confirmedBy'])
                ->orderBy('created_at', 'asc')
                ->get();

            $transformed = $bookings->map(function ($booking) {
                $customer = $booking->customer;
                if ($customer) {
                    $latestVehicle = $customer->vehicles->sortByDesc('created_at')->first();
                    $customer->vehicle_model = $latestVehicle->vehicle_model ?? '';
                    $customer->plate_number  = $latestVehicle->plate_number  ?? '';
                }

                $dp = $booking->downpayment;
                $booking->downpayment_status   = $dp?->status;
                $booking->downpayment_amount   = $dp
                    ? (float) ($dp->status === 'paid' ? $dp->amount_paid : $dp->payment)
                    : null;
                $booking->downpayment_reference = $dp?->reference_number;
                $booking->downpayment_gcash_ref = $dp?->paymongo_payment_id;

                $booking->approved_by = $booking->confirmedBy ? [
                    'first_name' => $booking->confirmedBy->first_name,
                    'last_name'  => $booking->confirmedBy->last_name,
                ] : null;

                return $booking;
            });

            return response()->json($transformed);
        } catch (\Exception $e) {
            Log::error('Get pending bookings error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([], 500);
        }
    }

    // ─── Cancel booking ───────────────────────────────────────────────────────

    public function cancelBooking($id)
    {
        try {
            DB::beginTransaction();

            $booking = Booking::find($id);

            if (! $booking) {
                DB::rollBack();
                return response()->json(['success' => false, 'message' => 'Booking not found.'], 404);
            }

            if (! in_array($booking->status, ['pending', 'approved'])) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Only pending or approved bookings can be cancelled.',
                ], 422);
            }

            $wasApproved = $booking->status === 'approved';

            $booking->status = 'cancelled';
            $booking->save();

            if ($wasApproved) {
                $slot = ParkingSlot::find($booking->parking_slot_id);
                if ($slot && $slot->status === 'occupied') {
                    $slot->status = 'available';
                    $slot->save();
                }
            }

            DB::commit();

            Log::info('Booking cancelled', ['booking_id' => $id, 'was_approved' => $wasApproved]);

            return response()->json(['success' => true, 'message' => 'Booking cancelled successfully.']);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Cancel booking error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to cancel booking'], 500);
        }
    }

    // ─── Complete booking ─────────────────────────────────────────────────────

    public function completeBooking($id)
    {
        try {
            DB::beginTransaction();

            $booking = Booking::with(['parkingSlot', 'transaction', 'transaction.payment'])->find($id);

            if (! $booking) {
                DB::rollBack();
                return response()->json(['success' => false, 'message' => 'Booking not found.'], 404);
            }

            if ($booking->status !== 'approved') {
                DB::rollBack();
                return response()->json(['success' => false, 'message' => 'Only approved bookings can be completed'], 422);
            }

            $booking->status = 'completed';
            $booking->save();

            if ($booking->parkingSlot) {
                $booking->parkingSlot->status = 'available';
                $booking->parkingSlot->save();
            }

            $checkOutNow = now();
            $transaction = $booking->transaction;

            if ($transaction) {
                $transaction->check_out_date = $checkOutNow;
                $transaction->save();

                if ($transaction->payment && $transaction->payment->status === 'unpaid') {
                    $transaction->payment->status = 'paid';
                    $transaction->payment->save();
                }
            }

            DB::commit();

            return response()->json([
                'success'        => true,
                'message'        => 'Booking completed.',
                'checked_out_at' => $checkOutNow->format('Y-m-d H:i:s'),
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Complete booking error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to complete booking'], 500);
        }
    }

    // ─── Delete booking ───────────────────────────────────────────────────────

    public function deleteBooking($id)
    {
        try {
            DB::beginTransaction();

            $booking = Booking::with(['transaction', 'transaction.payment', 'parkingSlot'])->find($id);

            if (! $booking) {
                DB::rollBack();
                return response()->json(['success' => false, 'message' => 'Booking not found.'], 404);
            }

            if ($booking->transaction && $this->isCheckedIn($booking->transaction)) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete — customer is currently checked in. Process checkout first.',
                ], 422);
            }

            if ($booking->parkingSlot && $booking->parkingSlot->status === 'occupied') {
                $booking->parkingSlot->status = 'available';
                $booking->parkingSlot->save();
            }

            if ($booking->transaction) {
                if ($booking->transaction->payment) {
                    $booking->transaction->payment->delete();
                }
                $booking->transaction->delete();
            }

            $booking->delete();

            DB::commit();

            Log::info('Booking deleted', ['booking_id' => $id, 'deleted_by' => auth()->id()]);

            return response()->json(['success' => true, 'message' => 'Booking deleted successfully.']);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Delete booking error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete booking: ' . $e->getMessage(),
            ], 500);
        }
    }

    private function isCheckedIn(?ParkingTransaction $tx): bool
    {
        if (! $tx) return false;
        return ! ($tx->payment && $tx->payment->status === 'paid');
    }

    // ─── Customers ────────────────────────────────────────────────────────────

    public function getAllCustomers()
    {
        try {
            $customers = User::where('role', 'customer')
                ->with(['vehicles', 'bookings' => function ($q) {
                    $q->latest()->limit(3);
                }])
                ->orderBy('created_at', 'desc')
                ->get();

            return response()->json($customers);
        } catch (\Exception $e) {
            Log::error('Get all customers error: ' . $e->getMessage());
            return response()->json([], 500);
        }
    }

    // ─── Customer details ─────────────────────────────────────────────────────

    public function getCustomerDetails($id)
    {
        try {
            $customer = User::where('role', 'customer')
                ->with(['vehicles', 'bookings' => function ($q) {
                    $q->latest()->limit(10);
                }, 'bookings.parkingSlot'])
                ->findOrFail($id);

            return response()->json($customer);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Customer not found'], 404);
        }
    }

    /**
     * Update customer profile (admin only) - EXTENDED with license fields
     */
    public function updateCustomer(Request $request, $id)
    {
        try {
            $customer = User::where('role', 'customer')->findOrFail($id);

            $validator = Validator::make($request->all(), [
                'first_name'         => 'sometimes|required|string|max:255',
                'middle_name'        => 'nullable|string|max:255',
                'last_name'          => 'sometimes|required|string|max:255',
                'phone_number'       => 'sometimes|required|string|max:20',
                'email'              => 'sometimes|required|email|max:255|unique:users,email,' . $id,
                'address'            => 'nullable|string|max:500',
                'is_active'          => 'sometimes|boolean',
                'license_number'     => 'nullable|string|max:50',
                'license_type'       => 'nullable|in:professional,non_professional,student',
                'license_expiration' => 'nullable|date|after:today',
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'errors'  => $validator->errors(),
                ], 422);
            }

            DB::beginTransaction();

            $updateData = $request->only([
                'first_name',
                'middle_name',
                'last_name',
                'phone_number',
                'email',
                'address',
                'is_active',
                'license_number',
                'license_type',
                'license_expiration',
            ]);

            $customer->update($updateData);

            DB::commit();

            Log::info('Customer updated by admin', [
                'customer_id' => $customer->id,
                'admin_id'    => auth()->id(),
            ]);

            $customer->load(['vehicles']);

            return response()->json([
                'success'  => true,
                'message'  => 'Customer updated successfully',
                'customer' => $customer,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Update customer error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to update customer: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Quick toggle active/inactive status (no need to open edit modal)
     */
    public function toggleCustomerStatus($id)
    {
        try {
            $customer = User::where('role', 'customer')->findOrFail($id);
            $customer->refresh();

            $customer->is_active = ! (bool) $customer->is_active;
            $customer->save();

            // Agad i-revoke ang lahat ng tokens kapag na-deactivate
            if (! $customer->is_active) {
                $customer->tokens()->delete();
            }

            Log::info('Customer status toggled', [
                'customer_id' => $customer->id,
                'email'       => $customer->email,
                'new_status'  => $customer->is_active ? 'active' : 'inactive',
                'admin_id'    => auth()->id(),
            ]);

            return response()->json([
                'success'     => true,
                'message'     => $customer->is_active
                    ? 'Customer account activated.'
                    : 'Customer account deactivated. They have been logged out.',
                'is_active'   => (bool) $customer->is_active,
                'customer_id' => $customer->id,
            ]);
        } catch (\Exception $e) {
            Log::error('Toggle customer status error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to update customer status.',
            ], 500);
        }
    }

    /**
     * Upload license photo
     */
    public function uploadLicense(Request $request, $id)
    {
        try {
            $customer = User::where('role', 'customer')->findOrFail($id);

            $validator = Validator::make($request->all(), [
                'license_photo' => 'required|image|mimes:jpeg,png,jpg,gif|max:5120',
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'errors'  => $validator->errors(),
                ], 422);
            }

            DB::beginTransaction();

            if ($customer->license_photo) {
                Storage::disk('public')->delete($customer->license_photo);
            }

            $file         = $request->file('license_photo');
            $originalName = $file->getClientOriginalName();
            $path         = $file->store('license_photos', 'public');

            $customer->update([
                'license_photo'               => $path,
                'license_photo_original_name' => $originalName,
            ]);

            DB::commit();

            return response()->json([
                'success'                     => true,
                'message'                     => 'License photo uploaded successfully',
                'license_photo_url'           => $customer->fresh()->license_photo_url,
                'license_photo_original_name' => $originalName,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Upload license error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to upload license photo: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Delete license photo
     */
    public function deleteLicensePhoto($id)
    {
        try {
            $customer = User::where('role', 'customer')->findOrFail($id);

            DB::beginTransaction();

            if ($customer->license_photo) {
                Storage::disk('public')->delete($customer->license_photo);
                $customer->update([
                    'license_photo'               => null,
                    'license_photo_original_name' => null,
                ]);
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'License photo deleted successfully',
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Delete license photo error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete license photo: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get customer statistics (for dashboard)
     */
    public function getCustomerStats()
    {
        try {
            $total    = User::where('role', 'customer')->count();
            $active   = User::where('role', 'customer')->where('is_active', true)->count();
            $inactive = User::where('role', 'customer')->where('is_active', false)->count();

            $withLicense = User::where('role', 'customer')
                ->whereNotNull('license_number')
                ->whereNotNull('license_photo')
                ->count();

            $expiringSoon = User::where('role', 'customer')
                ->whereNotNull('license_expiration')
                ->where('license_expiration', '<=', now()->addDays(30))
                ->where('license_expiration', '>=', now())
                ->count();

            $expired = User::where('role', 'customer')
                ->whereNotNull('license_expiration')
                ->where('license_expiration', '<', now())
                ->count();

            return response()->json([
                'total'         => $total,
                'active'        => $active,
                'inactive'      => $inactive,
                'with_license'  => $withLicense,
                'expiring_soon' => $expiringSoon,
                'expired'       => $expired,
            ]);
        } catch (\Exception $e) {
            Log::error('Get customer stats error: ' . $e->getMessage());
            return response()->json([
                'total'         => 0,
                'active'        => 0,
                'inactive'      => 0,
                'with_license'  => 0,
                'expiring_soon' => 0,
                'expired'       => 0,
            ], 500);
        }
    }

    /**
     * Export customers to CSV
     */
    public function exportCustomers()
    {
        try {
            $customers = User::where('role', 'customer')
                ->with(['vehicles'])
                ->get();

            $headers = [
                'Content-Type'        => 'text/csv',
                'Content-Disposition' => 'attachment; filename="customers_' . date('Y-m-d') . '.csv"',
            ];

            $callback = function () use ($customers) {
                $file = fopen('php://output', 'w');

                fputcsv($file, [
                    'ID',
                    'Name',
                    'Email',
                    'Phone',
                    'Address',
                    'License Number',
                    'License Type',
                    'License Expiration',
                    'Has License Photo',
                    'Status',
                    'Vehicle Count',
                    'Created At',
                ]);

                foreach ($customers as $customer) {
                    fputcsv($file, [
                        $customer->id,
                        $customer->first_name . ' ' . ($customer->middle_name ?? '') . ' ' . $customer->last_name,
                        $customer->email,
                        $customer->phone_number,
                        $customer->address,
                        $customer->license_number,
                        $customer->license_type,
                        $customer->license_expiration,
                        $customer->license_photo ? 'Yes' : 'No',
                        $customer->is_active ? 'Active' : 'Inactive',
                        $customer->vehicles->count(),
                        $customer->created_at,
                    ]);
                }

                fclose($file);
            };

            return response()->stream($callback, 200, $headers);
        } catch (\Exception $e) {
            Log::error('Export customers error: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to export customers'], 500);
        }
    }

    // ─── Approve booking ──────────────────────────────────────────────────────

    public function approveBooking($id)
    {
        try {
            DB::beginTransaction();

            $booking = Booking::where('id', $id)->where('status', 'pending')->first();

            if (! $booking) {
                DB::rollBack();
                $existing = Booking::find($id);
                return response()->json([
                    'success' => false,
                    'message' => 'Booking not found or already ' . ($existing->status ?? 'processed'),
                ], 422);
            }

            $booking->status        = 'approved';
            $booking->confirm_by_id = auth()->id();
            $booking->save();

            DB::commit();

            // ─── CREATE NOTIFICATIONS (persisted — poller picks them up) ─────
            // Ni-wrap sa try/catch para hindi i-fail ang approval kahit
            // mag-error ang notification.

            try {
                $staffUsers = User::whereIn('role', ['admin', 'staff'])->get();
                foreach ($staffUsers as $staff) {
                    NotificationController::createNotification(
                        $staff->id,
                        '✅ Booking Approved',
                        "Booking #{$booking->id} for {$booking->customer?->first_name} has been approved.",
                        'success',
                        [
                            'booking_id' => $booking->id,
                            'customer'   => $booking->customer?->first_name . ' ' . $booking->customer?->last_name,
                            'slot'       => $booking->parkingSlot?->slot_number,
                            'category'   => 'booking',
                        ]
                    );
                }

                if ($booking->customer_id) {
                    NotificationController::createNotification(
                        $booking->customer_id,
                        '✅ Booking Approved',
                        "Your booking for Slot {$booking->parkingSlot?->slot_number} has been approved!",
                        'success',
                        [
                            'booking_id' => $booking->id,
                            'slot'       => $booking->parkingSlot?->slot_number,
                            'check_in'   => $booking->check_in_date,
                            'category'   => 'booking',
                        ]
                    );
                }
            } catch (\Throwable $notifEx) {
                Log::error('Approve booking notification failed: ' . $notifEx->getMessage(), [
                    'booking_id' => $booking->id,
                    'trace'      => $notifEx->getTraceAsString(),
                ]);
            }

            $booking = Booking::with(['customer', 'parkingSlot', 'customer.vehicles'])->find($id);

            if ($booking && $booking->customer) {
                $latestVehicle = $booking->customer->vehicles->sortByDesc('created_at')->first();
                $booking->customer->plate_number  = $latestVehicle?->plate_number  ?? '';
                $booking->customer->vehicle_model = $latestVehicle?->vehicle_model ?? '';
            }

            $booking->has_checked_in = false;

            Log::info('Booking approved', ['booking_id' => $id, 'approved_by' => auth()->id()]);

            return response()->json([
                'success' => true,
                'message' => 'Booking approved! Customer can now check in.',
                'booking' => $booking,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Approve booking error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to approve booking: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ─── Reject booking ───────────────────────────────────────────────────────

    public function rejectBooking($id)
    {
        try {
            $booking = Booking::find($id);

            if (! $booking) {
                return response()->json([
                    'success' => false,
                    'message' => 'Booking #' . $id . ' not found.',
                ], 404);
            }

            if ($booking->status !== 'pending') {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot reject — booking is already ' . $booking->status . '.',
                ], 422);
            }

            $booking->status     = 'rejected';
            $booking->updated_at = now();
            $booking->save();

            // ─── CREATE NOTIFICATIONS (persisted) ─────────────────────────────

            try {
                $staffUsers = User::whereIn('role', ['admin', 'staff'])->get();
                foreach ($staffUsers as $staff) {
                    NotificationController::createNotification(
                        $staff->id,
                        '❌ Booking Rejected',
                        "Booking #{$booking->id} for {$booking->customer?->first_name} has been rejected.",
                        'error',
                        [
                            'booking_id' => $booking->id,
                            'category'   => 'booking',
                        ]
                    );
                }

                if ($booking->customer_id) {
                    NotificationController::createNotification(
                        $booking->customer_id,
                        '❌ Booking Rejected',
                        "Your booking for Slot {$booking->parkingSlot?->slot_number} was rejected.",
                        'error',
                        [
                            'booking_id' => $booking->id,
                            'slot'       => $booking->parkingSlot?->slot_number,
                            'category'   => 'booking',
                        ]
                    );
                }
            } catch (\Throwable $notifEx) {
                Log::error('Reject booking notification failed: ' . $notifEx->getMessage(), [
                    'booking_id' => $booking->id,
                    'trace'      => $notifEx->getTraceAsString(),
                ]);
            }

            Log::info('Booking rejected', ['booking_id' => $id, 'rejected_by' => auth()->id()]);

            return response()->json([
                'success' => true,
                'message' => 'Booking rejected successfully.',
            ]);
        } catch (\Exception $e) {
            Log::error('Reject booking error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to reject booking: ' . $e->getMessage(),
            ], 500);
        }
    }
}
