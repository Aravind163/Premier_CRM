<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    /**
     * GET /api/dashboard
     * Returns real counts + recent orders for the dashboard.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        // Base scopes
        $customerQ = Customer::query();
        $orderQ    = Order::with(['customer', 'product']);
        $productQ  = Product::query();

        // Scope by role — District/Taluk are multi-value (JSON array) on
        // the caller's Employee record, so we match against that, not a
        // plain scalar on User. Mirrors OrderController/CustomerController.
        if ($user->role === 'end_user') {
            $taluks = $this->callerAreas($user, 'Taluk');
            $customerQ->whereIn('Taluk', $taluks);
            $orderQ->whereHas('customer', fn ($q) => $q->whereIn('Taluk', $taluks));
        } elseif ($user->role === 'admin') {
            $districts = $this->callerAreas($user, 'District');
            $customerQ->whereIn('District', $districts);
            $orderQ->whereHas('customer', fn ($q) => $q->whereIn('District', $districts));
        }

        $totalCustomers = (clone $customerQ)->where('Status', 'approved')->count();
        $activeOrders   = (clone $orderQ)->whereIn('Status', ['pending', 'processing', 'approved'])->count();
        $totalProducts  = $productQ->where('Status', 'active')->count();
        $totalRevenue   = (clone $orderQ)->where('PaymentStatus', 'paid')->sum('TotalAmount');

        $recentOrders = (clone $orderQ)
            ->orderBy('CreatedAt', 'desc')
            ->limit(10)
            ->get()
            ->map(fn($o) => [
                'id'            => $o->Code,
                'customer'      => $o->customer->Name ?? '—',
                'product'       => $o->product->Name ?? '—',
                'amount'        => $o->TotalAmount,
                'status'        => $o->Status,
                'payment'       => $o->PaymentStatus,
                'delivery_date' => $o->DeliveryDate,
            ]);

        return response()->json([
            'stats' => [
                'total_customers' => $totalCustomers,
                'active_orders'   => $activeOrders,
                'total_products'  => $totalProducts,
                'total_revenue'   => $totalRevenue,
            ],
            'recent_orders' => $recentOrders,
        ]);
    }

    /**
     * GET /api/dashboard/o2c
     *
     * Operational dashboard per the O2C blueprint (Section 5). Scoped the
     * same way as OrderController::index():
     *   - end_user  → only orders for customers in their own assigned Taluk(s)
     *   - admin     → only orders for customers in their own District(s)
     *   - system_admin / super_admin → everything
     *   - customer  → blocked, this is a staff dashboard
     *
     * NOTE ON ACCURACY: a few widgets are best-effort approximations until
     * dedicated Enquiry/Allocation tracking exists (see the `note` field in
     * the response):
     *   - "Partial dispatch" — we don't yet track partial-quantity dispatch,
     *     so this shows orders pending dispatch as a whole, not split qty.
     *   - "Stock shortage" — approximated by comparing requested Quantity
     *     against the Product's current stock at read time.
     *   - "Sales loss" — approximated as declined orders' value; no
     *     structured loss-reason field exists yet.
     *   - "Invalid indent / duplicates" — approximated as >1 pending order
     *     for the same Customer+Product pair; no real duplicate/validity
     *     flag exists yet.
     */
    public function o2c(Request $request)
    {
        $caller = $request->user();

        if (!$caller || $caller->role === 'customer') {
            return response()->json(['message' => 'Not permitted.'], 403);
        }

        $query = Order::with(['customer', 'product']);

        if ($caller->role === 'end_user') {
            $taluks = $this->callerAreas($caller, 'Taluk');
            $customerIds = Customer::whereIn('Taluk', $taluks)->pluck('Id');
            $query->whereIn('CustomerId', $customerIds->isEmpty() ? [0] : $customerIds);
        }

        if ($caller->role === 'admin') {
            $districts = $this->callerAreas($caller, 'District');
            $customerIds = Customer::whereIn('District', $districts)->pluck('Id');
            $query->whereIn('CustomerId', $customerIds->isEmpty() ? [0] : $customerIds);
        }

        $orders = $query->get();
        $today = now()->toDateString();

        // ── 1. Enquiry Status ──────────────────────────────────────────
        $enquiryStatus = [
            'total'    => $orders->count(),
            'pending'  => $orders->where('Status', 'pending')->count(),
            'approved' => $orders->whereIn('Status', ['approved', 'processing', 'dispatched', 'delivered'])->count(),
            'rejected' => $orders->where('Status', 'declined')->count(),
        ];

        // ── 2. Total Orders Placed ─────────────────────────────────────
        $dailyCount = $orders->filter(fn ($o) => optional($o->CreatedAt)->toDateString() === $today)->count();

        $customerWise = $orders->groupBy('CustomerId')->map(function ($g) {
            $first = $g->first();
            return [
                'customer' => $first->customer->Name ?? '—',
                'count'    => $g->count(),
                'value'    => (float) $g->sum('TotalAmount'),
            ];
        })->sortByDesc('value')->take(10)->values();

        $productWise = $orders->groupBy('ProductId')->map(function ($g) {
            $first = $g->first();
            return [
                'product' => $first->product->Name ?? '—',
                'count'   => $g->count(),
                'qty'     => (int) $g->sum('Quantity'),
            ];
        })->sortByDesc('qty')->take(10)->values();

        // ── 3. Dispatch Status ──────────────────────────────────────────
        $dispatchStatus = [
            'dispatched'      => $orders->where('Status', 'dispatched')->count(),
            'pendingDispatch' => $orders->whereIn('Status', ['approved', 'processing'])->count(),
            'delivered'       => $orders->where('Status', 'delivered')->count(),
        ];

        // ── 4. Previous Day Pending Dispatch + aging ────────────────────
        $pendingDispatchOrders = $orders->whereIn('Status', ['approved', 'processing']);
        $aging = ['0-1' => 0, '2-3' => 0, '4+' => 0];
        $agingList = [];
        foreach ($pendingDispatchOrders as $o) {
            $reference = $o->UpdatedAt ?? $o->CreatedAt;
            $days = $reference ? now()->diffInDays(Carbon::parse($reference)) : 0;
            if ($days <= 1) $aging['0-1']++;
            elseif ($days <= 3) $aging['2-3']++;
            else $aging['4+']++;

            $agingList[] = [
                'code'     => $o->Code,
                'customer' => $o->customer->Name ?? '—',
                'status'   => $o->Status,
                'days'     => $days,
            ];
        }
        usort($agingList, fn ($a, $b) => $b['days'] <=> $a['days']);

        // ── 5. Enquiries Awaiting Due to Stock Shortage ─────────────────
        $stockShortage = $orders->where('Status', 'pending')->filter(function ($o) {
            return $o->product && $o->Quantity > ($o->product->Quantity ?? 0);
        })->map(fn ($o) => [
            'code'      => $o->Code,
            'customer'  => $o->customer->Name ?? '—',
            'product'   => $o->product->Name ?? '—',
            'requested' => (int) $o->Quantity,
            'available' => (int) ($o->product->Quantity ?? 0),
        ])->values();

        // ── 6. Sales Loss Indication ─────────────────────────────────────
        $declined = $orders->where('Status', 'declined');
        $salesLoss = [
            'count' => $declined->count(),
            'value' => (float) $declined->sum('TotalAmount'),
            'list'  => $declined->map(fn ($o) => [
                'code'     => $o->Code,
                'customer' => $o->customer->Name ?? '—',
                'value'    => (float) $o->TotalAmount,
                'notes'    => $o->Notes,
            ])->values(),
        ];

        // ── 7. Invalid Indent List (proxy: possible duplicate pending) ──
        $duplicates = $orders->groupBy(fn ($o) => $o->CustomerId . '-' . $o->ProductId)
            ->filter(fn ($g) => $g->where('Status', 'pending')->count() > 1)
            ->map(function ($g) {
                $first = $g->first();
                return [
                    'customer' => $first->customer->Name ?? '—',
                    'product'  => $first->product->Name ?? '—',
                    'count'    => $g->where('Status', 'pending')->count(),
                ];
            })->values();

        // ── 8. Long Pending Orders (>=3 days, approved/processing) ──────
        $longPending = collect($agingList)->filter(fn ($a) => $a['days'] >= 3)->take(10)->values();

        return response()->json([
            'enquiryStatus'        => $enquiryStatus,
            'ordersPlaced'         => [
                'today'        => $dailyCount,
                'customerWise' => $customerWise,
                'productWise'  => $productWise,
            ],
            'dispatchStatus'       => $dispatchStatus,
            'pendingDispatchAging' => [
                'buckets' => $aging,
                'list'    => array_slice($agingList, 0, 10),
            ],
            'stockShortage'        => $stockShortage,
            'salesLoss'            => $salesLoss,
            'possibleDuplicates'   => $duplicates,
            'longPendingOrders'    => $longPending,
            'note' => 'Partial-dispatch quantities, stock-shortage, sales-loss reasons, and duplicate detection are approximate until dedicated Enquiry/Allocation tracking is built.',
        ]);
    }

    /**
     * Normalise a caller's own assigned District/Taluk. Mirrors
     * CustomerController::callerAreas() / OrderController::callerAreas().
     */
    private function callerAreas($caller, string $field): array
    {
        $employee = Employee::where('UserId', $caller->id)->first();
        $value = $employee->{$field} ?? $caller->{$field} ?? null;

        if (is_array($value)) {
            return array_values(array_filter($value, fn ($v) => $v !== null && $v !== ''));
        }
        if (is_string($value) && $value !== '') {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return array_values(array_filter($decoded, fn ($v) => $v !== null && $v !== ''));
            }
            return [$value];
        }
        return [];
    }
}