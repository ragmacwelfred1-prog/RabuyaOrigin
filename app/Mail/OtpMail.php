<?php
namespace App\Mail;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $otpCode,
        public string $customerName,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your Email Verification Code - Park & Fuel',
        );
    }

    public function content(): Content
    {
        return new Content(
            // ✅ FIXED: was 'emails.otp' but blade is at resources/views/otp.blade.php
            view: 'otp',
            with: [
                'otpCode'      => $this->otpCode,
                'customerName' => $this->customerName,
            ],
        );
    }
}