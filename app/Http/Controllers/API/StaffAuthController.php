<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;

class StaffAuthController extends Controller
{
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email'    => 'required|email',
            'password' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors()
            ], 422);
        }

        $user = User::where('email', $request->email)->first();

        if (!$user) {
            Log::warning('Staff login failed: User not found', ['email' => $request->email]);
            return response()->json([
                'success' => false,
                'message' => 'Account not found'
            ], 401);
        }

        if ($user->role !== 'staff') {
            Log::warning('Staff login failed: Wrong role', ['email' => $request->email, 'role' => $user->role]);
            return response()->json([
                'success' => false,
                'message' => 'Access denied. This app is for staff only.'
            ], 403);
        }

        if (!$user->is_active) {
            Log::warning('Staff login failed: Inactive account', ['email' => $request->email]);
            return response()->json([
                'success' => false,
                'message' => 'Your account is inactive. Please contact your administrator.'
            ], 403);
        }

        if (!Hash::check($request->password, $user->password)) {
            Log::warning('Staff login failed: Invalid password', ['email' => $request->email]);
            return response()->json([
                'success' => false,
                'message' => 'Invalid credentials'
            ], 401);
        }

        // Delete old tokens
        $user->tokens()->delete();

        // Create new token
        $token = $user->createToken('staff_mobile_token', ['staff'])->plainTextToken;

        Log::info('Staff login successful', ['email' => $request->email, 'user_id' => $user->id]);

        return response()->json([
            'success'   => true,
            'user_type' => 'staff',
            'token'     => $token,
            'user'      => [
                'id'          => $user->id,
                'employee_id' => $user->employee_id,
                'first_name'  => $user->first_name,
                'middle_name' => $user->middle_name,
                'last_name'   => $user->last_name,
                'email'       => $user->email,
                'phone_number'=> $user->phone_number,
                'role'        => $user->role,
                'is_active'   => (bool) $user->is_active,
            ],
        ]);
    }

    public function logout(Request $request)
    {
        try {
            $request->user()->currentAccessToken()->delete();
            return response()->json([
                'success' => true,
                'message' => 'Logged out successfully'
            ]);
        } catch (\Exception $e) {
            Log::error('Logout error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Logout failed'
            ], 500);
        }
    }

    public function me(Request $request)
    {
        $user = $request->user();

        if ($user->role !== 'staff') {
            return response()->json([
                'success' => false,
                'message' => 'Access denied'
            ], 403);
        }

        return response()->json([
            'success'     => true,
            'id'          => $user->id,
            'employee_id' => $user->employee_id,
            'first_name'  => $user->first_name,
            'middle_name' => $user->middle_name,
            'last_name'   => $user->last_name,
            'email'       => $user->email,
            'phone_number'=> $user->phone_number,
            'role'        => $user->role,
            'is_active'   => (bool) $user->is_active,
        ]);
    }
}

