<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
  .container { max-width: 480px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
  .header { background: #0B0F1A; padding: 32px 24px; text-align: center; }
  .header h1 { color: #fff; margin: 0; font-size: 22px; }
  .header p { color: #94A3B8; margin: 6px 0 0; font-size: 13px; }
  .body { padding: 36px 32px; text-align: center; }
  .body p { color: #475569; font-size: 15px; line-height: 1.6; }
  .otp-box { display: inline-block; background: #F0FDF4; border: 2px solid #10B981; border-radius: 12px; padding: 16px 40px; margin: 24px 0; }
  .otp-code { font-size: 36px; font-weight: 800; color: #10B981; letter-spacing: 8px; }
  .note { font-size: 13px; color: #94A3B8; margin-top: 8px; }
  .footer { background: #F8FAFC; padding: 20px 32px; text-align: center; border-top: 1px solid #E2E8F0; }
  .footer p { color: #94A3B8; font-size: 12px; margin: 0; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Rabuya &amp; Parking Services</h1>
      <p>Email Verification</p>
    </div>
    <div class="body">
      <p>Hi <strong>{{ $customerName }}</strong>,</p>
      <p>Use the code below to verify your email. Expires in <strong>10 minutes</strong>.</p>
      <div class="otp-box">
        <div class="otp-code">{{ $otpCode }}</div>
      </div>
      <p class="note">Do not share this code to anyone</p>
    </div>
    <div class="footer">
      <p>&copy; {{ date('Y') }} Park &amp; Fuel. All rights reserved.</p>
    </div>
  </div>
</body>
</html>