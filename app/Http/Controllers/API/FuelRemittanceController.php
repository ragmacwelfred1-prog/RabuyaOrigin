<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\FuelRemittance;
use App\Models\FuelSale;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Http\Controllers\API\NotificationController; // Added import

class FuelRemittanceController extends Controller
{
    
    public function checkToday()
    {
        $staffId = Auth::id();
        $today = now()->toDateString();

        $remittance = FuelRemittance::where('staff_id', $staffId)
            ->where('remittance_date', $today)
            ->first();

        return response()->json([
            'exists' => !is_null($remittance),
            'remittance' => $remittance,
        ]);
    }

    
    public function getTodaySalesTotal()
    {
        $staffId = Auth::id();
        $today = now()->toDateString();

        $total = FuelSale::where('recorded_by', $staffId)
            ->whereDate('sale_date', $today)
            ->sum(DB::raw('liters_sold * price_per_liter'));

        return response()->json([
            'actual_sales_amount' => round($total, 2),
        ]);
    }

   
    public function store(Request $request)
{
    $request->validate([
        'remitted_amount' => 'required|numeric|min:0.01',
    ]);

    $staffId   = Auth::id();
    $today     = now()->toDateString();

    $actual = FuelSale::where('recorded_by', $staffId)
        ->whereDate('sale_date', $today)
        ->sum(DB::raw('liters_sold * price_per_liter'));
    $actual = round((float) $actual, 2);

    $newAmount = round((float) $request->remitted_amount, 2);

    // Sum of all APPROVED (auto-approved) remits — this is what's already been paid
    $approvedSum = (float) FuelRemittance::where('staff_id', $staffId)
        ->where('remittance_date', $today)
        ->where('status', 'approved')
        ->sum('remitted_amount');
    $approvedSum = round($approvedSum, 2);

    $remaining = round(max(0, $actual - $approvedSum), 2);

    if ($remaining <= 0.01) {
        return response()->json([
            'message' => 'Nothing left to remit for today — everything is already remitted.',
        ], 422);
    }

    if ($newAmount > $remaining + 0.01) {
        return response()->json([
            'message' => 'Only ₱' . number_format($remaining, 2) . ' remains to be remitted.',
        ], 422);
    }

    // Reuse today's row (accumulate), or create one — always approved
    $existing = FuelRemittance::where('staff_id', $staffId)
        ->where('remittance_date', $today)
        ->first();

    if ($existing) {
        $existing->update([
            'remitted_amount'     => round($approvedSum + $newAmount, 2),
            'actual_sales_amount' => $actual,
            'status'              => 'approved',      // ← auto-approved
            'reviewed_at'         => now(),           // ← stamped at submit time
        ]);

        return response()->json([
            'message'    => 'Remittance accepted.',
            'remittance' => $existing->fresh(),
        ], 200);
    }

    $remittance = FuelRemittance::create([
        'staff_id'            => $staffId,
        'remittance_date'     => $today,
        'remitted_amount'     => $newAmount,
        'actual_sales_amount' => $actual,
        'status'              => 'approved',          // ← auto-approved
        'reviewed_at'         => now(),
    ]);

    return response()->json([
        'message'    => 'Remittance accepted.',
        'remittance' => $remittance,
    ], 201);
}

    
    public function index(Request $request)
    {
        $query = FuelRemittance::with('staff');

        if ($request->has('status') && in_array($request->status, ['pending', 'approved', 'rejected'])) {
            $query->where('status', $request->status);
        }

        if ($request->has('staff_id')) {
            $query->where('staff_id', $request->staff_id);
        }

        if ($request->has('date_from')) {
            $query->where('remittance_date', '>=', $request->date_from);
        }

        if ($request->has('date_to')) {
            $query->where('remittance_date', '<=', $request->date_to);
        }

        return response()->json($query->orderBy('created_at', 'desc')->get());
    }

   
    public function show($id)
    {
        $remittance = FuelRemittance::with('staff')->findOrFail($id);
        return response()->json($remittance);
    }

   
    public function update(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:approved,rejected',
        ]);

        $remittance = FuelRemittance::findOrFail($id);

        if ($remittance->status !== 'pending') {
            return response()->json([
                'message' => 'This remittance has already been reviewed.',
            ], 422);
        }

        $remittance->update([
            'status' => $request->status,
            'reviewed_at' => now(),
        ]);

        // Trigger notification for the staff
        $this->notifyStaff($remittance, $request->status, 'Fuel', '/(staff)/gasoline');

        return response()->json([
            'message' => "Remittance {$request->status}.",
            'remittance' => $remittance,
        ]);
    }

    /**
     * Send notification to staff regarding remittance status.
     */
    private function notifyStaff(FuelRemittance $r, string $status, string $label, string $route): void
    {
        $remitted = (float) $r->remitted_amount;
        $actual   = (float) $r->actual_sales_amount;
        $diff     = round($remitted - $actual, 2);   // + = sobra, - = kulang
        $date     = \Carbon\Carbon::parse($r->remittance_date)->format('M d, Y');

        if (abs($diff) < 0.01) {
            $variance = 'exact';
            $varianceText = 'Exact match ✓';
        } elseif ($diff > 0) {
            $variance = 'over';
            $varianceText = 'SOBRA ng ₱' . number_format($diff, 2);
        } else {
            $variance = 'short';
            $varianceText = 'KULANG ng ₱' . number_format(abs($diff), 2);
        }

        if ($status === 'rejected') {
            $title = "❌ {$label} Remittance Rejected";
            $type  = 'error';
            $msg   = "Ang {$label} remittance mo para sa {$date} ay na-reject. {$varianceText}.";
        } elseif ($variance === 'exact') {
            $title = "✅ {$label} Remittance Approved";
            $type  = 'success';
            $msg   = "Na-approve ang {$label} remittance mo para sa {$date}. {$varianceText}.";
        } else {
            $title = "⚠️ {$label} Remittance Approved — {$varianceText}";
            $type  = 'warning';
            $msg   = "Na-approve ang remittance mo para sa {$date}, pero {$varianceText}. "
                   . "Remitted: ₱" . number_format($remitted, 2)
                   . " | Actual: ₱" . number_format($actual, 2) . ".";
        }

        NotificationController::createNotification(
            $r->staff_id,
            $title,
            $msg,
            $type,
            [
                'remittance_id'  => $r->id,
                'category'       => 'remittance',
                'priority'       => $variance === 'exact' && $status === 'approved' ? 'medium' : 'high',
                'variance'       => $variance,
                'difference'     => $diff,
                'remitted'       => $remitted,
                'actual'         => $actual,
                'action'         => ['label' => 'View', 'route' => $route],
            ]
        );
    }
}
