<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PayMongoService
{
    protected string $secretKey;
    protected string $baseUrl = 'https://api.paymongo.com/v1';

    public function __construct()
    {
        $this->secretKey = config('services.paymongo.secret_key', env('PAYMONGO_SECRET_KEY'));
    }

    protected function client()
    {
        return Http::withBasicAuth($this->secretKey, '')
            ->withHeaders(['Content-Type' => 'application/json', 'Accept' => 'application/json']);
    }

    /**
     * Create a GCash-only Checkout Session for a downpayment.
     *
     * @param  float  $amount        in PHP (e.g. 200.00)
     * @param  string $description
     * @param  string $referenceId   our own reference (e.g. "DP-{booking_id}")
     * @param  string $successUrl
     * @param  string $cancelUrl
     */
    public function createCheckoutSession(
        float $amount,
        string $description,
        string $referenceId,
        string $successUrl,
        string $cancelUrl
    ): array {
        $amountInCentavos = (int) round($amount * 100);

        $payload = [
            'data' => [
                'attributes' => [
                    'send_email_receipt' => false,
                    'show_description'   => true,
                    'show_line_items'    => true,
                    'payment_method_types' => ['gcash'],
                    'reference_number'   => $referenceId,
                    'description'        => $description,
                    'success_url'        => $successUrl,
                    'cancel_url'          => $cancelUrl,
                    'line_items' => [
                        [
                            'currency' => 'PHP',
                            'amount'   => $amountInCentavos,
                            'name'     => $description,
                            'quantity' => 1,
                        ],
                    ],
                ],
            ],
        ];

        $response = $this->client()->post("{$this->baseUrl}/checkout_sessions", $payload);

        if (! $response->successful()) {
            Log::error('PayMongo create checkout session failed', [
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);
            throw new \Exception('Failed to create PayMongo checkout session: ' . $response->body());
        }

        $data = $response->json('data');

        return [
            'id'           => $data['id'],
            'checkout_url' => $data['attributes']['checkout_url'],
            'raw'          => $data,
        ];
    }

    public function retrieveCheckoutSession(string $checkoutSessionId): array
    {
        $response = $this->client()->get("{$this->baseUrl}/checkout_sessions/{$checkoutSessionId}");

        if (! $response->successful()) {
            Log::error('PayMongo retrieve checkout session failed', [
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);
            throw new \Exception('Failed to retrieve PayMongo checkout session: ' . $response->body());
        }

        return $response->json('data');
    }

    /**
     * Verify the webhook signature header (Paymongo-Signature).
     * Format: t=...,te=...,li=...
     * We verify using the webhook secret's "live" or "test" signature segment.
     */
    public function verifyWebhookSignature(string $payload, string $signatureHeader, string $webhookSecret): bool
    {
        $parts = [];
        foreach (explode(',', $signatureHeader) as $segment) {
            [$key, $value] = array_pad(explode('=', $segment, 2), 2, null);
            $parts[$key] = $value;
        }

        $timestamp = $parts['t'] ?? null;
        $signature = $parts['te'] ?? $parts['li'] ?? null;

        if (! $timestamp || ! $signature) {
            return false;
        }

        $signedPayload = "{$timestamp}.{$payload}";
        $expected = hash_hmac('sha256', $signedPayload, $webhookSecret);

        return hash_equals($expected, $signature);
    }
}