<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\ParkingPayment;
use App\Services\PayMongoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class DownpaymentController extends Controller
{
    public function __construct(protected PayMongoService $payMongo) {}

    public function createDownpayment(Request $request, $id)
    {
        $request->validate([
            'amount' => 'required|numeric|min:1',
        ]);

        $user = auth()->user();

        $booking = Booking::where('id', $id)
            ->where('customer_id', $user->id)
            ->first();

        if (! $booking) {
            return response()->json(['success' => false, 'message' => 'Booking not found.'], 404);
        }

        if ($booking->status !== 'approved' && $booking->status !== 'pending') {
            return response()->json([
                'success' => false,
                'message' => 'Downpayment is only allowed for pending or approved bookings.',
            ], 422);
        }

        // Block if there's already a paid downpayment
        $existingPaid = $booking->downpayment()->where('status', 'paid')->first();
        if ($existingPaid) {
            return response()->json([
                'success' => false,
                'message' => 'A downpayment has already been paid for this booking.',
            ], 422);
        }

        try {
            DB::beginTransaction();

            // Reuse / create an "unpaid" downpayment row
            $payment = ParkingPayment::where('booking_id', $booking->id)
                ->where('payment_method', 'gcash')
                ->whereNull('parking_transaction_id')
                ->where('status', 'unpaid')
                ->latest()
                ->first();

            if (! $payment) {
                $payment = ParkingPayment::create([
                    'booking_id'    => $booking->id,
                    'amount_paid'   => $request->amount,
                    'change_amount' => 0,
                    'discount'      => 0,
                    'payment_method'=> 'gcash',
                    'status'        => 'unpaid',
                ]);
            } else {
                $payment->update(['amount_paid' => $request->amount]);
            }

            $reference = 'DP-' . $booking->id . '-' . $payment->id;
            $payment->update(['reference_number' => $reference]);

            $frontendBase = rtrim(config('app.url'), '/');
            $successUrl = $frontendBase . '/payment/success?booking_id=' . $booking->id;
            $cancelUrl  = $frontendBase . '/payment/cancel?booking_id=' . $booking->id;

            $session = $this->payMongo->createCheckoutSession(
                amount: (float) $request->amount,
                description: 'Parking Downpayment - Booking #' . $booking->id . ' (' . $reference . ')',
                referenceId: $reference,
                successUrl: $successUrl,
                cancelUrl: $cancelUrl,
            );

            $payment->update([
                'paymongo_checkout_session_id' => $session['id'],
            ]);

            DB::commit();

            return response()->json([
                'success'          => true,
                'checkout_url'     => $session['checkout_url'],
                'payment_id'       => $payment->id,
                'reference_number' => $reference,   
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Create downpayment error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to create downpayment session: ' . $e->getMessage(),
            ], 500);
        }
    }


    public function downpaymentStatus($id)
    {
        $user = auth()->user();

        $booking = Booking::where('id', $id)
            ->where('customer_id', $user->id)
            ->with('downpayment')
            ->first();

        if (! $booking) {
            return response()->json(['success' => false, 'message' => 'Booking not found.'], 404);
        }

        $dp = $booking->downpayment;

        // If still unpaid but has a checkout session, try to sync status from PayMongo
        if ($dp && $dp->status === 'unpaid' && $dp->paymongo_checkout_session_id) {
            try {
                $session = $this->payMongo->retrieveCheckoutSession($dp->paymongo_checkout_session_id);
                $paymentIntentStatus = $session['attributes']['payment_intent']['attributes']['status'] ?? null;
                $paymongoPaymentId = $session['attributes']['payment_intent']['attributes']['payments'][0]['id'] ?? null;

                if ($paymentIntentStatus === 'succeeded') {
                    $dp->update([
                        'status'              => 'paid',
                        'paid_at'             => now(),
                        'paymongo_payment_id' => $paymongoPaymentId,
                    ]);
                }
            } catch (\Exception $e) {
                Log::warning('Downpayment status sync failed: ' . $e->getMessage());
            }
        }

        return response()->json([
            'success' => true,
            'downpayment' => $dp ? [
                'status'              => $dp->status,
                'amount_paid'         => (float) $dp->amount_paid,
                'paid_at'             => $dp->paid_at,
                'reference_number'    => $dp->reference_number,      
                'paymongo_payment_id' => $dp->paymongo_payment_id, 
            ] : null,
        ]);
    }

    
    public function adminDownpayment($id)
    {
        $booking = Booking::with('downpayment')->find($id);

        if (! $booking) {
            return response()->json(['success' => false, 'message' => 'Booking not found.'], 404);
        }

        $dp = $booking->downpayment;

        return response()->json([
            'success' => true,
            'booking_id' => $booking->id,
            'downpayment' => $dp ? [
                'id'                  => $dp->id,
                'status'              => $dp->status,
                'amount_paid'         => (float) $dp->amount_paid,
                'payment_method'      => $dp->payment_method,
                'paid_at'             => $dp->paid_at,
                'created_at'          => $dp->created_at,
                'reference_number'    => $dp->reference_number,
                'paymongo_payment_id' => $dp->paymongo_payment_id,
            ] : null,
        ]);
    }

    public function webhook(Request $request)
    {
        $payload = $request->getContent();
        $signatureHeader = $request->header('Paymongo-Signature');
        $webhookSecret = config('services.paymongo.webhook_secret');

        if (! $signatureHeader || ! $webhookSecret) {
            Log::warning('PayMongo webhook missing signature or secret.');
            return response()->json(['message' => 'Invalid request'], 400);
        }

        if (! $this->payMongo->verifyWebhookSignature($payload, $signatureHeader, $webhookSecret)) {
            Log::warning('PayMongo webhook signature verification failed.');
            return response()->json(['message' => 'Invalid signature'], 400);
        }

        $event = json_decode($payload, true);
        $eventType = $event['data']['attributes']['type'] ?? null;

        Log::info('PayMongo webhook received', ['type' => $eventType]);

        // Handle checkout_session.payment.paid (most reliable for Checkout Sessions)
        if (in_array($eventType, ['checkout_session.payment.paid', 'payment.paid'])) {
            $resource = $event['data']['attributes']['data'] ?? null;

            // Try to resolve the checkout session id depending on event shape
            $checkoutSessionId = $resource['attributes']['checkout_session_id']
                ?? $resource['id']
                ?? null;

            // For checkout_session.payment.paid the resource itself IS the checkout session
            if ($eventType === 'checkout_session.payment.paid') {
                $checkoutSessionId = $resource['id'] ?? $checkoutSessionId;
            }

            if ($checkoutSessionId) {
                $payment = ParkingPayment::where('paymongo_checkout_session_id', $checkoutSessionId)->first();

                if ($payment && $payment->status !== 'paid') {
                    $payment->update([
                        'status'              => 'paid',
                        'paid_at'             => now(),
                        'paymongo_payment_id' => $resource['attributes']['payments'][0]['id']
                            ?? $resource['id']
                            ?? null,
                  
                    ]);

                    Log::info('Downpayment marked as paid via webhook', ['payment_id' => $payment->id]);
                }
            }
        }

        return response()->json(['success' => true]);
    }
}
