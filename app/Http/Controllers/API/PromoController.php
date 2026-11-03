<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class PromoController extends Controller
{
    // GET /promos  (public) and GET /admin/promos
    public function index()
    {
        try {
            $promos = DB::table('promo')
                ->leftJoin('users', 'promo.user_id', '=', 'users.id')
                ->select(
                    'promo.id',
                    'promo.title',
                    'promo.description',
                    'promo.discount',
                    'promo.user_id',
                    'promo.created_at',
                    'promo.updated_at',
                    DB::raw("CONCAT(users.first_name, ' ', users.last_name) as created_by")
                )
                ->orderBy('promo.created_at', 'desc')
                ->get();

            return response()->json($promos);
        } catch (\Exception $e) {
            Log::error('PromoController@index: ' . $e->getMessage());
            return response()->json([], 500);
        }
    }

    // POST /admin/promos
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'title'       => 'required|string|max:255',
            'description' => 'nullable|string',
            'discount'    => 'nullable|numeric|min:0', 
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        try {
            $discount = $request->discount ?? 0; // default to 0

            $id = DB::table('promo')->insertGetId([
                'title'       => $request->title,
                'description' => $request->description ?? null,
                'discount'    => $discount,
                'user_id'     => auth()->id(),
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);

            $promo = DB::table('promo')->find($id);

            return response()->json([
                'success' => true,
                'message' => 'Promo created successfully.',
                'promo'   => $promo,
            ], 201);
        } catch (\Exception $e) {
            Log::error('PromoController@store: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to create promo.',
            ], 500);
        }
    }

    // PUT /admin/promos/{id}
    public function update(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'title'       => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'discount'    => 'nullable|numeric|min:0', // ✅ optional – keep existing
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors'  => $validator->errors(),
            ], 422);
        }

        try {
            $promo = DB::table('promo')->find($id);

            if (!$promo) {
                return response()->json([
                    'success' => false,
                    'message' => 'Promo #' . $id . ' not found.',
                ], 404);
            }

            $data = [
                'title'       => $request->title       ?? $promo->title,
                'description' => $request->description ?? $promo->description,
                'updated_at'  => now(),
            ];

            // Only update discount if provided, otherwise keep existing
            if ($request->has('discount')) {
                $data['discount'] = $request->discount;
            }

            DB::table('promo')->where('id', $id)->update($data);

            $updated = DB::table('promo')->find($id);

            return response()->json([
                'success' => true,
                'message' => 'Promo updated successfully.',
                'promo'   => $updated,
            ]);
        } catch (\Exception $e) {
            Log::error('PromoController@update: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to update promo.',
            ], 500);
        }
    }

    // DELETE /admin/promos/{id}
    public function destroy($id)
    {
        try {
            $promo = DB::table('promo')->find($id);

            if (!$promo) {
                return response()->json([
                    'success' => false,
                    'message' => 'Promo #' . $id . ' not found.',
                ], 404);
            }

            DB::table('promo')->where('id', $id)->delete();

            Log::info('Promo deleted', ['promo_id' => $id, 'deleted_by' => auth()->id()]);

            return response()->json([
                'success' => true,
                'message' => 'Promo deleted successfully.',
            ]);
        } catch (\Exception $e) {
            Log::error('PromoController@destroy: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete promo: ' . $e->getMessage(),
            ], 500);
        }
    }
}
