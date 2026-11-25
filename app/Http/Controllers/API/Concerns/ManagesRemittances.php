<?php

namespace App\Http\Controllers\API\Concerns;

use App\Http\Controllers\API\NotificationController;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

trait ManagesRemittances
{
    abstract protected function remittanceModel(): string;
    abstract protected function computeTodayCollection(int $staffId): float;
    abstract protected function remittanceLabel(): string;   // 'Fuel' | 'Parking'
    abstract protected function staffRoute(): string;        // mobile route
    abstract protected function adminRoute(): string;        // web route

    /** Sum of APPROVED remittances only — pending/rejected never reduce the balance. */
    private function approvedTotal(int $staffId, string $date): float
    {
        $m = $this->remittanceModel();

        return round((float) $m::where('staff_id', $staffId)
            ->where('remittance_date', $date)
            ->where('status', 'approved')
            ->sum('remitted_amount'), 2);
    }

    // ─── Staff: status of today ───────────────────────────────────────────
    public function checkToday()
    {
        $m       = $this->remittanceModel();
        $staffId = (int) Auth::id();
        $today   = now()->toDateString();

        $rows = $m::where('staff_id', $staffId)
            ->where('remittance_date', $today)
            ->orderByDesc('id')
            ->get();

        $latest      = $rows->first();
        $pending     = $rows->firstWhere('status', 'pending');
        $approved    = $this->approvedTotal($staffId, $today);
        $actual      = $this->computeTodayCollection($staffId);
        $outstanding = round(max(0, $actual - $approved), 2);

        return response()->json([
            'exists'          => $rows->isNotEmpty(),
            'remittance'      => $latest,
            'pending'         => $pending,
            'rejected'        => ($latest && $latest->status === 'rejected') ? $latest : null,
            'has_pending'     => (bool) $pending,
            'approved_amount' => $approved,
            'outstanding'     => $outstanding,
            'today'           => $rows->values(),
        ]);
    }

    public function getTodaySalesTotal()
    {
        $staffId  = (int) Auth::id();
        $actual   = $this->computeTodayCollection($staffId);
        $approved = $this->approvedTotal($staffId, now()->toDateString());

        return response()->json([
            'actual_sales_amount' => $actual,
            'approved_amount'     => $approved,
            'outstanding'         => round(max(0, $actual - $approved), 2),
        ]);
    }

    // ─── Staff: submit (always PENDING) ───────────────────────────────────
    public function store(Request $request)
    {
        $request->validate(['remitted_amount' => 'required|numeric|min:0.01']);

        $m       = $this->remittanceModel();
        $staffId = (int) Auth::id();
        $today   = now()->toDateString();
        $amount  = round((float) $request->remitted_amount, 2);

        return DB::transaction(function () use ($m, $staffId, $today, $amount) {
            // serialize submissions per staff (prevents double submit)
            User::where('id', $staffId)->lockForUpdate()->first();

            $hasPending = $m::where('staff_id', $staffId)
                ->where('remittance_date', $today)
                ->where('status', 'pending')
                ->exists();

            if ($hasPending) {
                return response()->json([
                    'message' => 'You still have a remittance waiting for admin review. Please wait for the decision first.',
                ], 422);
            }

            $actual      = $this->computeTodayCollection($staffId);
            $approved    = $this->approvedTotal($staffId, $today);
            $outstanding = round(max(0, $actual - $approved), 2);

            if ($outstanding <= 0.01) {
                return response()->json([
                    'message' => 'Nothing left to remit for today.',
                ], 422);
            }

            $remittance = $m::create([
                'staff_id'            => $staffId,
                'remittance_date'     => $today,
                'remitted_amount'     => $amount,
                'actual_sales_amount' => $outstanding,                 // what the system expected
                'difference'          => round($amount - $outstanding, 2), // + over, - short
                'status'              => 'pending',
            ]);

            $this->notifyAdmins($remittance);

            return response()->json([
                'message'    => 'Remittance submitted. Waiting for admin approval.',
                'remittance' => $remittance,
            ], 201);
        });
    }

    // ─── Admin: list / show ───────────────────────────────────────────────
    public function index(Request $request)
    {
        $m     = $this->remittanceModel();
        $query = $m::with(['staff', 'reviewer']);

        if ($request->filled('status') && in_array($request->status, ['pending', 'approved', 'rejected'])) {
            $query->where('status', $request->status);
        }
        if ($request->filled('staff_id'))  $query->where('staff_id', $request->staff_id);
        if ($request->filled('date_from')) $query->where('remittance_date', '>=', $request->date_from);
        if ($request->filled('date_to'))   $query->where('remittance_date', '<=', $request->date_to);

        return response()->json($query->orderByDesc('id')->get());
    }

    public function show($id)
    {
        $m = $this->remittanceModel();

        return response()->json($m::with(['staff', 'reviewer'])->findOrFail($id));
    }

    // ─── Admin: approve / reject ──────────────────────────────────────────
    public function update(Request $request, $id)
    {
        $user = $request->user();

        if (! $user || $user->role !== 'admin') {
            return response()->json(['message' => 'Only an administrator can review remittances.'], 403);
        }

        $request->validate([
            'status'        => 'required|in:approved,rejected',
            'reject_reason' => 'required_if:status,rejected|nullable|string|max:500',
        ]);

        $m          = $this->remittanceModel();
        $remittance = $m::findOrFail($id);

        if ($remittance->status !== 'pending') {
            return response()->json(['message' => 'This remittance has already been reviewed.'], 422);
        }

        $remittance->update([
            'status'        => $request->status,
            'reviewed_by'   => $user->id,
            'reviewed_at'   => now(),
            'reject_reason' => $request->status === 'rejected' ? trim((string) $request->reject_reason) : null,
        ]);

        $this->notifyStaff($remittance, $request->status);

        return response()->json([
            'message'    => "Remittance {$request->status}.",
            'remittance' => $remittance->fresh(['staff', 'reviewer']),
        ]);
    }

    // ─── Notifications ────────────────────────────────────────────────────
    private function notifyAdmins($r): void
    {
        $label    = $this->remittanceLabel();
        $staff    = User::find($r->staff_id);
        $name     = trim(($staff->first_name ?? '') . ' ' . ($staff->last_name ?? ''));
        $diff     = (float) $r->difference;
        $diffText = abs($diff) < 0.01
            ? 'exact match'
            : ($diff > 0 ? 'SOBRA ng ₱' . number_format($diff, 2) : 'KULANG ng ₱' . number_format(abs($diff), 2));

        foreach (User::where('role', 'admin')->where('is_active', true)->get() as $admin) {
            NotificationController::createNotification(
                $admin->id,
                "💰 {$label} Remittance for Review",
                "{$name} remitted ₱" . number_format((float) $r->remitted_amount, 2)
                    . " (expected ₱" . number_format((float) $r->actual_sales_amount, 2) . ", {$diffText}).",
                abs($diff) < 0.01 ? 'info' : 'warning',
                [
                    'remittance_id' => $r->id,
                    'category'      => 'remittance',
                    'priority'      => 'high',
                    'difference'    => $diff,
                    'action'        => ['label' => 'Review', 'route' => $this->adminRoute()],
                ]
            );
        }
    }

    private function notifyStaff($r, string $status): void
    {
        $label    = $this->remittanceLabel();
        $remitted = (float) $r->remitted_amount;
        $expected = (float) $r->actual_sales_amount;
        $diff     = round($remitted - $expected, 2);
        $date     = Carbon::parse($r->remittance_date)->format('M d, Y');

        if (abs($diff) < 0.01) {
            $variance = 'exact';
            $varText  = 'Exact match ✓';
        } elseif ($diff > 0) {
            $variance = 'over';
            $varText  = 'SOBRA ng ₱' . number_format($diff, 2);
        } else {
            $variance = 'short';
            $varText  = 'KULANG ng ₱' . number_format(abs($diff), 2);
        }

        if ($status === 'rejected') {
            $title = "❌ {$label} Remittance Rejected";
            $type  = 'error';
            $msg   = "Your {$label} remittance for {$date} (₱" . number_format($remitted, 2) . ") was rejected. "
                   . "Reason: {$r->reject_reason}. Please submit the correct amount again.";
        } elseif ($variance === 'exact') {
            $title = "✅ {$label} Remittance Approved";
            $type  = 'success';
            $msg   = "Your {$label} remittance for {$date} was approved. {$varText}.";
        } else {
            $title = "⚠️ {$label} Remittance Approved — {$varText}";
            $type  = 'warning';
            $msg   = "Approved, but {$varText}. Remitted: ₱" . number_format($remitted, 2)
                   . " | Expected: ₱" . number_format($expected, 2) . ".";
        }

        NotificationController::createNotification(
            $r->staff_id,
            $title,
            $msg,
            $type,
            [
                'remittance_id' => $r->id,
                'category'      => 'remittance',
                'priority'      => $status === 'rejected' || $variance !== 'exact' ? 'high' : 'medium',
                'variance'      => $variance,
                'difference'    => $diff,
                'remitted'      => $remitted,
                'actual'        => $expected,
                'reject_reason' => $r->reject_reason,
                'action'        => ['label' => 'View', 'route' => $this->staffRoute()],
            ]
        );
    }
}