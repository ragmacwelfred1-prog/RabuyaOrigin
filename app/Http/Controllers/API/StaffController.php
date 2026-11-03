<?php


namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class StaffController extends Controller
{
    public function index()
    {
        try {
            $staff = User::where('role', 'staff')->get();
            return response()->json($staff);
        } catch (\Exception $e) {
            Log::error('Get staff error: ' . $e->getMessage());
            return response()->json([], 500);
        }
    }

    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'first_name'   => 'required|string',
                'middle_name'  => 'nullable|string|max:255', 
                'last_name'    => 'required|string',
                'email'        => 'required|email|unique:users,email',
                'phone_number' => 'required|string',
                'employee_id'  => 'required|string|unique:users,employee_id',
                'password'     => 'required|string|min:6',
                'is_active'    => 'boolean',
            ]);

            $staff = User::create([
                'first_name'   => $validated['first_name'],
                'middle_name'  => $validated['middle_name'] ?? null, 
                'last_name'    => $validated['last_name'],
                'email'        => $validated['email'],
                'phone_number' => $validated['phone_number'],
                'employee_id'  => $validated['employee_id'],
                'password'     => Hash::make($validated['password']),
                'role'         => 'staff',
                'is_active'    => $validated['is_active'] ?? true,
            ]);

            return response()->json($staff, 201);
        } catch (\Exception $e) {
            Log::error('Store staff error: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request, $id)
    {
        try {
            $staff = User::where('role', 'staff')->findOrFail($id);

            $validated = $request->validate([
                'first_name'   => 'sometimes|string',
                'middle_name'  => 'nullable|string|max:255', 
                'last_name'    => 'sometimes|string',
                'email'        => 'sometimes|email|unique:users,email,' . $id,
                'phone_number' => 'sometimes|string',
                'is_active'    => 'sometimes|boolean',
                'password'     => 'nullable|string|min:6',
            ]);

            // Only update password if provided
            if (!empty($validated['password'])) {
                $validated['password'] = Hash::make($validated['password']);
            } else {
                unset($validated['password']);
            }

            // employee_id and role are not editable
            unset($validated['employee_id'], $validated['role']);

            $staff->update($validated);
            return response()->json($staff->fresh());
        } catch (\Exception $e) {
            Log::error('Update staff error: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function destroy($id)
    {
        try {
            $staff = User::where('role', 'staff')->findOrFail($id);

            // Prevent deleting yourself
            if ($staff->id === auth()->id()) {
                return response()->json(['message' => 'You cannot delete your own account'], 422);
            }

            $staff->delete();
            return response()->json(['message' => 'Staff deleted']);
        } catch (\Exception $e) {
            Log::error('Destroy staff error: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    // Search customers with vehicles
    public function searchCustomers(Request $request)
    {
        try {
            $keyword = $request->get('keyword', '');

            if (!$keyword) {
                return response()->json([]);
            }

            $customers = User::where('role', 'customer')
                ->with('vehicles')
                ->where(function ($query) use ($keyword) {
                    $query->where('first_name', 'like', "%{$keyword}%")
                        ->orWhere('last_name', 'like', "%{$keyword}%")
                        ->orWhere('phone_number', 'like', "%{$keyword}%")
                        ->orWhere('email', 'like', "%{$keyword}%");
                })
                ->limit(20)
                ->get()
                ->map(function (User $customer) {
                    $latestVehicle = $customer->vehicles()->latest()->first();
                    return [
                        'id'            => $customer->id,
                        'first_name'    => $customer->first_name,
                        'middle_name'   => $customer->middle_name,
                        'last_name'     => $customer->last_name,
                        'phone_number'  => $customer->phone_number,
                        'email'         => $customer->email,
                        'address'       => $customer->address,
                        'plate_number'  => $latestVehicle?->plate_number ?? '',
                        'vehicle_model' => $latestVehicle?->vehicle_model ?? '',
                    ];
                });

            return response()->json($customers);
        } catch (\Exception $e) {
            Log::error('Search customers error: ' . $e->getMessage());
            return response()->json([], 500);
        }
    }
}

