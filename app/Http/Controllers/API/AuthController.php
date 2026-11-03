<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\OtpCode;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use App\Mail\OtpMail;
use Illuminate\Support\Facades\Mail;

class AuthController extends Controller
{
    // ============================================
    // ADMIN LOGIN — STEP 1: PASSWORD
    // ============================================
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email'    => 'required|email',
            'password' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $email = strtolower(trim($request->email));

        $user = User::where('email', $email)->where('is_active', true)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Admin access only'], 403);
        }

        // Password OK → issue OTP instead of a token
        $otp = $user->issueOtp();

        try {
            Mail::to($user->email)->send(new OtpMail($otp->otp_code, $user->first_name));
        } catch (\Exception $e) {
            Log::error('Admin login OTP email failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to send verification code.'], 500);
        }

        // Short-lived challenge proves the password step was passed
        $challenge = Str::random(48);
        Cache::put("admin_login:{$challenge}", [
            'user_id'  => $user->id,
            'attempts' => 0,
        ], now()->addMinutes(5));

        [$name, $domain] = explode('@', $user->email);
        $masked = substr($name, 0, 2)
            . str_repeat('*', max(1, strlen($name) - 2))
            . '@' . $domain;

        Log::info('Admin login OTP issued', ['user_id' => $user->id]);

        return response()->json([
            'success'      => true,
            'otp_required' => true,
            'challenge'    => $challenge,
            'email_hint'   => $masked,
            'message'      => 'Verification code sent to your email.',
        ]);
    }

    // ============================================
    // ADMIN LOGIN — STEP 2: VERIFY OTP & ISSUE TOKEN
    // ============================================
    public function adminVerifyLoginOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'challenge' => 'required|string',
            'otp'       => 'required|string|size:6',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Invalid code format'], 422);
        }

        $key  = "admin_login:{$request->challenge}";
        $data = Cache::get($key);

        if (! $data) {
            return response()->json(['message' => 'Session expired. Please log in again.'], 422);
        }

        if ($data['attempts'] >= 5) {
            Cache::forget($key);
            return response()->json(['message' => 'Too many attempts. Please log in again.'], 429);
        }

        $user = User::where('id', $data['user_id'])
            ->where('role', 'admin')
            ->where('is_active', true)
            ->first();

        if (! $user) {
            Cache::forget($key);
            return response()->json(['message' => 'Account unavailable.'], 403);
        }

        $otpRecord = OtpCode::where('user_id', $user->id)
            ->where('otp_code', trim($request->otp))
            ->where('is_used', false)
            ->where('expires_at', '>', now())
            ->first();

        if (! $otpRecord) {
            $data['attempts']++;
            Cache::put($key, $data, now()->addMinutes(5));

            Log::warning('Admin OTP verify failed', [
                'user_id'  => $user->id,
                'attempts' => $data['attempts'],
            ]);

            return response()->json(['message' => 'Invalid or expired code.'], 422);
        }

        $otpRecord->update(['is_used' => true]);
        Cache::forget($key);

        $token = $user->createToken('auth_token')->plainTextToken;

        Log::info('Admin login successful', ['user_id' => $user->id]);

        return response()->json([
            'success'   => true,
            'user'      => [
                'id'         => $user->id,
                'first_name' => $user->first_name,
                'last_name'  => $user->last_name,
                'email'      => $user->email,
                'role'       => $user->role,
            ],
            'token'     => $token,
            'user_type' => 'admin',
        ]);
    }

    // ============================================
    // ADMIN LOGIN — RESEND OTP
    // ============================================
    public function adminResendLoginOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'challenge' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Invalid request'], 422);
        }

        $key  = "admin_login:{$request->challenge}";
        $data = Cache::get($key);

        if (! $data) {
            return response()->json(['message' => 'Session expired. Please log in again.'], 422);
        }

        $user = User::where('id', $data['user_id'])
            ->where('role', 'admin')
            ->where('is_active', true)
            ->first();

        if (! $user) {
            Cache::forget($key);
            return response()->json(['message' => 'Account unavailable.'], 403);
        }

        $otp = $user->issueOtp();

        try {
            Mail::to($user->email)->send(new OtpMail($otp->otp_code, $user->first_name));
        } catch (\Exception $e) {
            Log::error('Admin resend OTP failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to send code.'], 500);
        }

        // Reset attempt counter on resend
        $data['attempts'] = 0;
        Cache::put($key, $data, now()->addMinutes(5));

        return response()->json([
            'success' => true,
            'message' => 'New code sent.',
        ]);
    }

    // ============================================
    // STAFF LOGIN
    // ============================================
    public function staffLogin(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email'    => 'required|email',
            'password' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = User::where('email', $request->email)->where('is_active', true)->first();

        if (! $user) {
            return response()->json(['success' => false, 'message' => 'Account not found'], 401);
        }

        // ============================================================
        // SECURITY FIX: Admins must NOT authenticate here.
        // /staff/login only performs password verification with no OTP,
        // so allowing admins would bypass the OTP second factor enforced
        // by /login + /admin/verify-login-otp.
        // ============================================================
        if ($user->role === 'admin') {
            Log::warning('Admin attempted login via /staff/login', [
                'user_id' => $user->id,
                'email'   => $user->email,
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Admins must sign in through the admin portal (with OTP verification).',
            ], 403);
        }

        if ($user->role !== 'staff') {
            return response()->json(['success' => false, 'message' => 'Staff access only'], 403);
        }

        if (! Hash::check($request->password, $user->password)) {
            return response()->json(['success' => false, 'message' => 'Invalid credentials'], 401);
        }

        $token = $user->createToken('staff-token')->plainTextToken;

        Log::info('Staff login successful', ['user_id' => $user->id, 'role' => $user->role]);

        return response()->json([
            'success'   => true,
            'user'      => [
                'id'           => $user->id,
                'first_name'   => $user->first_name,
                'last_name'    => $user->last_name,
                'email'        => $user->email,
                'phone_number' => $user->phone_number,
                'employee_id'  => $user->employee_id,
                'role'         => $user->role,
                'is_active'    => $user->is_active,
            ],
            'token'     => $token,
            'user_type' => $user->role,
        ]);
    }

    // ============================================
    // CUSTOMER LOGIN
    // ============================================
    public function customerLogin(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email'    => 'required|email',
            'password' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $email = strtolower(trim($request->email));

        $user = User::where('email', $email)->first();

        if (! $user) {
            return response()->json(['success' => false, 'message' => 'Account not found'], 401);
        }

        if ($user->role !== 'customer') {
            return response()->json(['success' => false, 'message' => 'Customer access only'], 403);
        }

        // Explicit boolean check
        if (! (bool) $user->is_active) {
            Log::warning('Login blocked — account deactivated', [
                'user_id'       => $user->id,
                'email'         => $user->email,
                'is_active_raw' => $user->getRawOriginal('is_active'),
            ]);

            return response()->json([
                'success'     => false,
                'message'     => 'Account is deactivated',
                'deactivated' => true,
            ], 403);
        }

        if (! $user->email_verified) {
            return response()->json(['success' => false, 'message' => 'Please verify your email first'], 403);
        }

        if (! Hash::check($request->password, $user->password)) {
            return response()->json(['success' => false, 'message' => 'Invalid credentials'], 401);
        }

        $token = $user->createToken('customer-token')->plainTextToken;

        return response()->json([
            'success'   => true,
            'user'      => [
                'id'           => $user->id,
                'first_name'   => $user->first_name,
                'middle_name'  => $user->middle_name ?? '',
                'last_name'    => $user->last_name,
                'email'        => $user->email,
                'phone_number' => $user->phone_number,
                'address'      => $user->address,
                'role'         => $user->role,
                'is_active'    => (bool) $user->is_active,
            ],
            'token'     => $token,
            'user_type' => 'customer',
        ]);
    }

    // ============================================
    // SEND OTP (customer registration only)
    // ============================================
    public function sendOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email'      => 'required|email',
            'first_name' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Invalid email'], 422);
        }

        $email = strtolower(trim($request->email));

        if (User::where('email', $email)->where('is_active', true)->exists()) {
            return response()->json(['success' => false, 'message' => 'Email is already registered'], 422);
        }

        $customerName = $request->first_name ?: 'Customer';

        // Reuse the pending user (huwag burahin) para hindi masira ang OTP sa resend
        $pendingUser = User::where('email', $email)->where('is_active', false)->first();
        $created = false;

        if (! $pendingUser) {
            $pendingUser = new User();
            $pendingUser->forceFill([
                'email'          => $email,
                'email_verified' => false,
                'is_active'      => false,
                'role'           => 'customer',
                'first_name'     => $request->first_name ?: 'Pending',
                'last_name'      => 'Pending',
                'phone_number'   => 'pending_' . md5($email),
                'password'       => Hash::make(Str::random(16)),
            ])->save();
            $created = true;
        } else {
            $pendingUser->forceFill([
                'email_verified' => false,
                'is_active'      => false,
            ])->save();
        }

        // Invalidate old unused codes
        OtpCode::where('user_id', $pendingUser->id)
            ->where('is_used', false)
            ->update(['is_used' => true]);

        // Create fresh code (independent from issueOtp() used by admin)
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $otp = new OtpCode();
        $otp->forceFill([
            'user_id'    => $pendingUser->id,
            'otp_code'   => $code,
            'expires_at' => now()->addMinutes(10),
            'is_used'    => false,
        ])->save();

        try {
            Mail::to($email)->send(new OtpMail($code, $customerName));

            return response()->json([
                'success' => true,
                'message' => 'OTP sent to your email! Please check your inbox.',
            ]);
        } catch (\Exception $e) {
            Log::error('OTP email failed: ' . $e->getMessage());
            $otp->delete();
            if ($created) {
                $pendingUser->delete();
            }

            return response()->json([
                'success' => false,
                'message' => 'Failed to send OTP. Please try again.',
            ], 500);
        }
    }

    // ============================================
    // VERIFY OTP (customer registration only)
    // ============================================
    public function verifyOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'otp'   => 'required|string|size:6',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Invalid OTP format'], 422);
        }

        $email = strtolower(trim($request->email));
        $code  = trim((string) $request->otp);

        $pendingUser = User::where('email', $email)
            ->where('is_active', false)
            ->first();

        if (! $pendingUser) {
            Log::warning('Registration OTP verify: no pending user', ['email' => $email]);
            return response()->json([
                'success' => false,
                'message' => 'No pending registration found. Please request a new code.',
            ], 422);
        }

        // Pinakabagong unused code lang
        $otpRecord = OtpCode::where('user_id', $pendingUser->id)
            ->where('is_used', false)
            ->orderByDesc('id')
            ->first();

        if (! $otpRecord) {
            Log::warning('Registration OTP verify: no active otp', ['user_id' => $pendingUser->id]);
            return response()->json([
                'success' => false,
                'message' => 'No active code. Please request a new one.',
            ], 422);
        }

        if (! hash_equals((string) $otpRecord->otp_code, $code)) {
            Log::warning('Registration OTP verify: mismatch', ['user_id' => $pendingUser->id]);
            return response()->json(['success' => false, 'message' => 'Invalid OTP code.'], 422);
        }

        if (\Carbon\Carbon::parse($otpRecord->expires_at)->isPast()) {
            Log::warning('Registration OTP verify: expired', [
                'user_id'    => $pendingUser->id,
                'expires_at' => (string) $otpRecord->expires_at,
                'now'        => now()->toDateTimeString(),
            ]);
            return response()->json([
                'success' => false,
                'message' => 'OTP has expired. Please request a new one.',
            ], 422);
        }

        $otpRecord->forceFill(['is_used' => true])->save();
        $pendingUser->forceFill(['email_verified' => true])->save();

        return response()->json([
            'success' => true,
            'message' => 'Email verified successfully!',
        ]);
    }

    // ============================================
    // FORGOT PASSWORD — SEND OTP (for existing/active accounts)
    // ============================================
    public function forgotPasswordSendOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Invalid email'], 422);
        }

        $email = strtolower(trim($request->email));

        $user = User::where('email', $email)
            ->where('role', 'customer')
            ->first();

        if (! $user) {
            return response()->json(['success' => false, 'message' => 'No account found with that email.'], 404);
        }

        if (! (bool) $user->is_active) {
            return response()->json(['success' => false, 'message' => 'Account is deactivated. Please contact support.'], 403);
        }

        $otp = $user->issueOtp();

        try {
            Mail::to($email)->send(new OtpMail($otp->otp_code, $user->first_name));

            return response()->json([
                'success' => true,
                'message' => 'OTP sent to your email! Please check your inbox.',
            ]);
        } catch (\Exception $e) {
            Log::error('Forgot password OTP email failed: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to send OTP. Please try again.'], 500);
        }
    }

    // ============================================
    // FORGOT PASSWORD — VERIFY OTP & RESET
    // ============================================
    public function forgotPasswordReset(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email'    => 'required|email',
            'otp'      => 'required|string|size:6',
            'password' => 'required|string|min:6|confirmed',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $email = strtolower(trim($request->email));

        $user = User::where('email', $email)
            ->where('role', 'customer')
            ->first();

        if (! $user) {
            return response()->json(['success' => false, 'message' => 'Account not found.'], 404);
        }

        $otpRecord = OtpCode::where('user_id', $user->id)
            ->where('otp_code', trim($request->otp))
            ->where('is_used', false)
            ->where('expires_at', '>', now())
            ->first();

        if (! $otpRecord) {
            $expired = OtpCode::where('user_id', $user->id)
                ->where('otp_code', trim($request->otp))
                ->where('is_used', false)
                ->first();

            if ($expired) {
                return response()->json(['success' => false, 'message' => 'OTP has expired. Please request a new one.'], 422);
            }

            return response()->json(['success' => false, 'message' => 'Invalid OTP code.'], 422);
        }

        $otpRecord->update(['is_used' => true]);

        $user->update(['password' => Hash::make($request->password)]);

        // Revoke existing tokens so old sessions are logged out
        $user->tokens()->delete();

        Log::info('Customer password reset via OTP', ['user_id' => $user->id]);

        return response()->json([
            'success' => true,
            'message' => 'Password reset successfully! Please log in with your new password.',
        ]);
    }

    // ============================================
    // CUSTOMER REGISTER
    // ============================================
    public function customerRegister(Request $request)
    {
        $email = strtolower(trim($request->email ?? ''));

        // Must have a verified pending user
        $pendingUser = User::where('email', $email)
            ->where('email_verified', true)
            ->where('is_active', false)
            ->first();

        if (! $pendingUser) {
            return response()->json([
                'success' => false,
                'message' => 'Please verify your email address first.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'first_name'    => 'required|string|max:255',
            'middle_name'   => 'nullable|string|max:255',
            'last_name'     => 'required|string|max:255',
            'email'         => 'required|string|email|max:255',
            'phone_number'  => 'required|string|max:20|unique:users,phone_number,' . $pendingUser->id,
            'password'      => 'required|string|min:6|confirmed',
            'address'       => 'nullable|string|max:500',
            'plate_number'  => 'required|string|max:20',
            'vehicle_model' => 'required|string|max:255',
            // License fields
            'license_number'     => 'nullable|string|max:50',
            'license_type'       => 'nullable|in:professional,non_professional,student',
            'license_expiration' => 'nullable|date|after:today',
            'license_photo'      => 'nullable|image|mimes:jpeg,png,jpg|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors'  => $validator->errors(),
            ], 422);
        }

        try {
            DB::beginTransaction();

            $licensePhotoPath         = null;
            $licensePhotoOriginalName = null;

            // Handle license photo upload if provided
            if ($request->hasFile('license_photo')) {
                $file                     = $request->file('license_photo');
                $licensePhotoOriginalName = $file->getClientOriginalName();
                $licensePhotoPath         = $file->store('license_photos', 'public');
            }

            $pendingUser->update([
                'first_name'     => $request->first_name,
                'middle_name'    => $request->middle_name ?? null,
                'last_name'      => $request->last_name,
                'phone_number'   => $request->phone_number,
                'address'        => $request->address ?? null,
                'password'       => Hash::make($request->password),
                'role'           => 'customer',
                'customer_type'  => 'registered',
                'is_active'      => true,
                'email_verified' => true,
                // License fields
                'license_number'              => $request->license_number ?? null,
                'license_type'                => $request->license_type ?? null,
                'license_expiration'          => $request->license_expiration ?? null,
                'license_photo'               => $licensePhotoPath,
                'license_photo_original_name' => $licensePhotoOriginalName,
            ]);

            Vehicle::create([
                'customer_id'   => $pendingUser->id,
                'plate_number'  => strtoupper(trim($request->plate_number)),
                'vehicle_model' => trim($request->vehicle_model),
            ]);

            DB::commit();

            Log::info('Customer registered', ['user_id' => $pendingUser->id, 'email' => $pendingUser->email]);

            return response()->json([
                'success' => true,
                'message' => 'Registration successful! Please login.',
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Registration error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Registration failed. Please try again.',
            ], 500);
        }
    }

    // ============================================
    // LOGOUT / ME helpers
    // ============================================
    public function staffLogout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['success' => true, 'message' => 'Logged out successfully']);
    }

    public function staffMe(Request $request)
    {
        $user = $request->user();
        return response()->json([
            'success' => true,
            'user'    => [
                'id'           => $user->id,
                'first_name'   => $user->first_name,
                'middle_name'  => $user->middle_name,
                'last_name'    => $user->last_name,
                'email'        => $user->email,
                'phone_number' => $user->phone_number,
                'employee_id'  => $user->employee_id,
                'role'         => $user->role,
                'is_active'    => $user->is_active,
            ],
        ]);
    }

    public function customerLogout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['success' => true, 'message' => 'Logged out successfully']);
    }

    public function customerMe(Request $request)
    {
        return response()->json($request->user());
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully']);
    }

    // ============================================
    // SHARED /me — also guards against deactivated customers
    // ============================================
    public function me(Request $request)
    {
        $user = $request->user();

        if ($user && $user->role === 'customer' && ! $user->is_active) {
            // Revoke the token being used right now so the mobile app is forced out
            $token = $user->currentAccessToken();
            if ($token) {
                $token->delete();
            }

            return response()->json([
                'success'     => false,
                'message'     => 'Your account has been deactivated. Please contact support.',
                'deactivated' => true,
            ], 403);
        }

        return response()->json($user);
    }

    public function customerProfile(Request $request)
    {
        $user = $request->user()->load('vehicles');

        return response()->json(['success' => true, 'user' => $user]);
    }

    public function updateCustomerProfile(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'first_name'       => 'sometimes|required|string|max:255',
            'last_name'        => 'sometimes|required|string|max:255',
            'phone_number'     => 'sometimes|required|string|max:20',
            'password'         => 'sometimes|required|string|min:6|confirmed',
            'current_password' => 'required_with:password',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $user = $request->user();

        if ($request->filled('password')) {
            if (! Hash::check($request->current_password, $user->password)) {
                return response()->json(['success' => false, 'message' => 'Current password is incorrect.'], 422);
            }
            $user->password = Hash::make($request->password);
        }

        $user->fill($request->only([
            'first_name', 'middle_name', 'last_name', 'phone_number', 'address',
        ]))->save();

        return response()->json(['success' => true, 'message' => 'Profile updated successfully.', 'user' => $user]);
    }
}
