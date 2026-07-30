<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductAllocation;
use App\Models\StockBatch;
use App\Models\AllocationBatchConsumption;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// Orders in these statuses are still "live demand" competing for stock.
// Declined orders don't count; dispatched/delivered orders have already
// physically left, so they're excluded from the pool being allocated.
const ALLOCATION_ACTIVE_STATUSES = ['pending', 'approved', 'processing'];

class AllocationController extends Controller
{
    /**
     * GET /api/allocations/products
     *
     * One row per product that currently has any active (pending/approved/
     * processing) order demand — used to populate the product picker on the
     * Allocation screen, with a quick "oversubscribed?" indicator.
     */
    public function products(Request $request)
    {
        $this->authorizeStaff($request);

        $rows = Order::whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->select('ProductId', DB::raw('SUM(Quantity) as TotalOrdered'))
            ->groupBy('ProductId')
            ->get()
            ->keyBy('ProductId');

        if ($rows->isEmpty()) {
            return response()->json([]);
        }

        $products = Product::whereIn('Id', $rows->keys())->get()->keyBy('Id');

        $allocated = ProductAllocation::whereIn('ProductId', $rows->keys())
            ->select('ProductId', DB::raw('SUM(AllocatedQty) as TotalAllocated'))
            ->groupBy('ProductId')
            ->get()
            ->keyBy('ProductId');

        $result = [];
        foreach ($rows as $productId => $row) {
            $product = $products->get($productId);
            if (!$product)
                continue;

            $totalOrdered = (int) $row->TotalOrdered;
            $totalAllocated = (int) ($allocated->get($productId)->TotalAllocated ?? 0);

            $result[] = [
                'productId' => $product->Id,
                'code' => $product->Code,
                'name' => $product->Name,
                'category' => $product->Category,
                'availableQty' => (int) $product->Quantity,
                'totalOrdered' => $totalOrdered,
                'totalAllocated' => $totalAllocated,
                'shortfall' => max(0, $totalOrdered - (int) $product->Quantity),
            ];
        }

        // Oversubscribed products first — those need attention.
        usort($result, fn($a, $b) => $b['shortfall'] <=> $a['shortfall']);

        return response()->json($result);
    }

    /**
     * GET /api/allocations?product_id=X
     *
     * Per-customer breakdown for one product: how much each customer has
     * ordered (active demand) vs. how much they've been allocated so far.
     */
    public function index(Request $request)
    {
        $this->authorizeStaff($request);

        $validated = $request->validate([
            'product_id' => 'required|integer|exists:Products,Id',
        ]);

        $product = Product::find($validated['product_id']);

        $ordered = Order::where('ProductId', $product->Id)
            ->whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->select('CustomerId', DB::raw('SUM(Quantity) as OrderedQty'), DB::raw('MAX(CreatedAt) as LastOrderedAt'), DB::raw('MAX(Id) as LastOrderId'))
            ->groupBy('CustomerId')
            ->get()
            ->keyBy('CustomerId');

        if ($ordered->isEmpty()) {
            return response()->json([
                'product' => [
                    'id' => $product->Id,
                    'code' => $product->Code,
                    'name' => $product->Name,
                    'availableQty' => (int) $product->Quantity,
                ],
                'customers' => [],
            ]);
        }

        $customers = Customer::whereIn('Id', $ordered->keys())->get()->keyBy('Id');

        $allocations = ProductAllocation::where('ProductId', $product->Id)
            ->whereIn('CustomerId', $ordered->keys())
            ->get()
            ->keyBy('CustomerId');

        // Most recent Order's Code (+ who logged it — the End User / "Field
        // Officer") per customer, shown as "Order No." / used for the Sales
        // Officer filter on the Marketing Review / Sales Order screens
        // instead of a synthesized inquiry reference.
        $lastOrderIds = $ordered->pluck('LastOrderId')->filter()->values();
        $lastOrders = Order::whereIn('Id', $lastOrderIds)->get()->keyBy('Id');
        $officerIds = $lastOrders->pluck('CreatedBy')->filter()->unique()->values();
        $officers = User::whereIn('id', $officerIds)->pluck('name', 'id');

        $rows = [];
        foreach ($ordered as $customerId => $row) {
            $customer = $customers->get($customerId);
            if (!$customer)
                continue;

            $allocation = $allocations->get($customerId);
            $lastOrder = $lastOrders->get($row->LastOrderId);

            $rows[] = [
                'customerId' => $customer->Id,
                'code' => $customer->Code,
                'name' => $customer->Name,
                'district' => $customer->District,
                'taluk' => $customer->Taluk,
                'orderedQty' => (int) $row->OrderedQty,
                'allocatedQty' => (int) ($allocation->AllocatedQty ?? 0),
                'inquiryDate' => $row->LastOrderedAt ? substr($row->LastOrderedAt, 0, 10) : null,
                'orderNo' => $lastOrder->Code ?? null,
                'officerName' => $lastOrder && $lastOrder->CreatedBy ? ($officers->get($lastOrder->CreatedBy) ?? null) : null,
                'allocationId' => $allocation->Id ?? null,
                'status' => $allocation->Status ?? null,
                'remarks' => $allocation->Remarks ?? null,
                'erpStatus' => $allocation->ErpStatus ?? 'not_transferred',
                'decidedAt' => $allocation->DecidedAt ? $allocation->DecidedAt->toDateTimeString() : null,
                'erpTransferredAt' => $allocation->ErpTransferredAt ? $allocation->ErpTransferredAt->toDateTimeString() : null,
            ];
        }

        // Biggest requests first, so the admin sees who needs the most first.
        usort($rows, fn($a, $b) => $b['orderedQty'] <=> $a['orderedQty']);

        $totalAllocated = array_sum(array_column($rows, 'allocatedQty'));

        return response()->json([
            'product' => [
                'id' => $product->Id,
                'code' => $product->Code,
                'name' => $product->Name,
                'availableQty' => (int) $product->Quantity,
                'totalOrdered' => array_sum(array_column($rows, 'orderedQty')),
                'totalAllocated' => $totalAllocated,
                'remaining' => (int) $product->Quantity - $totalAllocated,
            ],
            'customers' => $rows,
        ]);
    }

    /**
     * POST /api/allocations
     * Body: { productId, allocations: [{ customerId, allocatedQty }] }
     *
     * Bulk upsert. Rejected if the total allocated would exceed the
     * product's available stock — an admin can always allocate *less*
     * than what was ordered, never more than what's on hand.
     */
    public function store(Request $request)
    {
        $this->authorizeStaff($request);

        $validated = $request->validate([
            'productId' => 'required|integer|exists:Products,Id',
            'allocations' => 'required|array|min:1',
            'allocations.*.customerId' => 'required|integer|exists:Customers,Id',
            'allocations.*.allocatedQty' => 'required|integer|min:0',
        ]);

        $product = Product::find($validated['productId']);

        $totalRequested = array_sum(array_column($validated['allocations'], 'allocatedQty'));

        if ($totalRequested > (int) $product->Quantity) {
            return response()->json([
                'message' => "Total allocated (" . $totalRequested . ") can't exceed available stock (" . (int) $product->Quantity . ").",
            ], 422);
        }

        DB::transaction(function () use ($validated, $request) {
            foreach ($validated['allocations'] as $item) {
                $existing = ProductAllocation::where('ProductId', $validated['productId'])
                    ->where('CustomerId', $item['customerId'])->first();
                $qtyChanged = !$existing || (int) $existing->AllocatedQty !== (int) $item['allocatedQty'];

                $allocation = ProductAllocation::updateOrCreate(
                    ['ProductId' => $validated['productId'], 'CustomerId' => $item['customerId']],
                    array_merge(
                        ['AllocatedQty' => $item['allocatedQty'], 'AllocatedBy' => $request->user()->id],
                        // Save & Submit hands the row to the System Admin for
                        // final approval. A fresh row, or a row whose qty just
                        // changed, always goes back to "pending" — but leave a
                        // row's decision alone if the qty on this save is
                        // identical to what's already on record (so re-loading
                        // the page and re-saving unchanged rows doesn't quietly
                        // reopen something already Approved/Rejected).
                        $qtyChanged ? ['Status' => 'pending', 'DecidedBy' => null, 'DecidedAt' => null] : []
                    )
                );
                $this->consumeFifo($allocation);
            }
        });

        return response()->json(['message' => 'Allocation saved.']);
    }

    /**
     * GET /api/allocations/customers
     *
     * One row per customer who currently has any active (pending/approved/
     * processing) order demand — used to populate the customer picker on
     * the Customer-wise tab of the Allocation screen.
     */
    public function customers(Request $request)
    {
        $this->authorizeStaff($request);

        $rows = Order::whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->select('CustomerId', DB::raw('COUNT(DISTINCT ProductId) as ProductCount'), DB::raw('SUM(Quantity) as TotalOrdered'))
            ->groupBy('CustomerId')
            ->get()
            ->keyBy('CustomerId');

        if ($rows->isEmpty()) {
            return response()->json([]);
        }

        $customers = Customer::whereIn('Id', $rows->keys())->get()->keyBy('Id');

        $productIds = Order::whereIn('CustomerId', $rows->keys())
            ->whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->pluck('ProductId')
            ->unique();

        $productTotals = Order::whereIn('ProductId', $productIds)
            ->whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->select('ProductId', DB::raw('SUM(Quantity) as TotalOrdered'))
            ->groupBy('ProductId')
            ->get()
            ->keyBy('ProductId');

        $products = Product::whereIn('Id', $productIds)->get()->keyBy('Id');

        $shortageByCustomer = Order::whereIn('CustomerId', $rows->keys())
            ->whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->get()
            ->groupBy('CustomerId')
            ->map(function ($orders) use ($productTotals, $products) {
                foreach ($orders as $o) {
                    $product = $products->get($o->ProductId);
                    $totalOrdered = (int) ($productTotals->get($o->ProductId)->TotalOrdered ?? 0);
                    if ($product && $totalOrdered > (int) $product->Quantity) {
                        return true;
                    }
                }
                return false;
            });

        $result = [];
        foreach ($rows as $customerId => $row) {
            $customer = $customers->get($customerId);
            if (!$customer)
                continue;

            $result[] = [
                'customerId' => $customer->Id,
                'code' => $customer->Code,
                'name' => $customer->Name,
                'district' => $customer->District,
                'taluk' => $customer->Taluk,
                'productCount' => (int) $row->ProductCount,
                'totalOrdered' => (int) $row->TotalOrdered,
                'hasShortage' => (bool) ($shortageByCustomer->get($customerId) ?? false),
            ];
        }

        usort($result, fn($a, $b) => $b['hasShortage'] <=> $a['hasShortage']);

        return response()->json($result);
    }

    /**
     * GET /api/allocations/by-customer?customer_id=X
     *
     * Per-product breakdown for one customer: every product they currently
     * have active demand for, how much they ordered vs. have been
     * allocated, plus enough stock context (total stock, total ordered by
     * everyone, allocated to everyone else) to safely edit this customer's
     * share without re-fetching the product-wise screen.
     */
    public function byCustomer(Request $request)
    {
        $this->authorizeStaff($request);

        $validated = $request->validate([
            'customer_id' => 'required|integer|exists:Customers,Id',
        ]);

        $customer = Customer::find($validated['customer_id']);

        $ordered = Order::where('CustomerId', $customer->Id)
            ->whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->select('ProductId', DB::raw('SUM(Quantity) as OrderedQty'))
            ->groupBy('ProductId')
            ->get()
            ->keyBy('ProductId');

        if ($ordered->isEmpty()) {
            return response()->json([
                'customer' => ['id' => $customer->Id, 'code' => $customer->Code, 'name' => $customer->Name],
                'products' => [],
            ]);
        }

        $products = Product::whereIn('Id', $ordered->keys())->get()->keyBy('Id');

        $allTotalOrdered = Order::whereIn('ProductId', $ordered->keys())
            ->whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->select('ProductId', DB::raw('SUM(Quantity) as TotalOrdered'))
            ->groupBy('ProductId')
            ->get()
            ->keyBy('ProductId');

        $allAllocated = ProductAllocation::whereIn('ProductId', $ordered->keys())
            ->select('ProductId', DB::raw('SUM(AllocatedQty) as TotalAllocated'))
            ->groupBy('ProductId')
            ->get()
            ->keyBy('ProductId');

        $myAllocated = ProductAllocation::where('CustomerId', $customer->Id)
            ->whereIn('ProductId', $ordered->keys())
            ->get()
            ->keyBy('ProductId');

        $rows = [];
        foreach ($ordered as $productId => $row) {
            $product = $products->get($productId);
            if (!$product)
                continue;

            $availableQty = (int) $product->Quantity;
            $totalOrdered = (int) ($allTotalOrdered->get($productId)->TotalOrdered ?? 0);
            $totalAllocated = (int) ($allAllocated->get($productId)->TotalAllocated ?? 0);
            $myAllocatedQty = (int) ($myAllocated->get($productId)->AllocatedQty ?? 0);
            $allocatedToOthers = $totalAllocated - $myAllocatedQty;

            $rows[] = [
                'productId' => $product->Id,
                'code' => $product->Code,
                'name' => $product->Name,
                'category' => $product->Category,
                'availableQty' => $availableQty,
                'totalOrdered' => $totalOrdered,
                'orderedQty' => (int) $row->OrderedQty,
                'allocatedQty' => $myAllocatedQty,
                'allocatedToOthers' => $allocatedToOthers,
                'shortfall' => max(0, $totalOrdered - $availableQty),
            ];
        }

        usort($rows, fn($a, $b) => $b['shortfall'] <=> $a['shortfall']);

        return response()->json([
            'customer' => ['id' => $customer->Id, 'code' => $customer->Code, 'name' => $customer->Name, 'district' => $customer->District, 'taluk' => $customer->Taluk],
            'products' => $rows,
        ]);
    }

    /**
     * POST /api/allocations/by-customer
     * Body: { customerId, allocations: [{ productId, allocatedQty }] }
     *
     * Same rule as the product-wise store(): can never push a product's
     * grand total (this customer + everyone else already allocated) past
     * its available stock. Checked per line item since a customer-wise
     * save can touch several different products at once.
     */
    public function storeByCustomer(Request $request)
    {
        $this->authorizeStaff($request);

        $validated = $request->validate([
            'customerId' => 'required|integer|exists:Customers,Id',
            'allocations' => 'required|array|min:1',
            'allocations.*.productId' => 'required|integer|exists:Products,Id',
            'allocations.*.allocatedQty' => 'required|integer|min:0',
        ]);

        $productIds = array_column($validated['allocations'], 'productId');
        $products = Product::whereIn('Id', $productIds)->get()->keyBy('Id');

        $allocatedElsewhere = ProductAllocation::whereIn('ProductId', $productIds)
            ->where('CustomerId', '!=', $validated['customerId'])
            ->select('ProductId', DB::raw('SUM(AllocatedQty) as TotalAllocated'))
            ->groupBy('ProductId')
            ->get()
            ->keyBy('ProductId');

        foreach ($validated['allocations'] as $item) {
            $product = $products->get($item['productId']);
            if (!$product)
                continue;

            $others = (int) ($allocatedElsewhere->get($item['productId'])->TotalAllocated ?? 0);
            $grandTotal = $others + $item['allocatedQty'];

            if ($grandTotal > (int) $product->Quantity) {
                return response()->json([
                    'message' => "Total allocated for {$product->Name} ({$grandTotal}) can't exceed available stock (" . (int) $product->Quantity . ").",
                ], 422);
            }
        }

        DB::transaction(function () use ($validated, $request) {
            foreach ($validated['allocations'] as $item) {
                $existing = ProductAllocation::where('ProductId', $item['productId'])
                    ->where('CustomerId', $validated['customerId'])->first();
                $qtyChanged = !$existing || (int) $existing->AllocatedQty !== (int) $item['allocatedQty'];

                $allocation = ProductAllocation::updateOrCreate(
                    ['ProductId' => $item['productId'], 'CustomerId' => $validated['customerId']],
                    array_merge(
                        ['AllocatedQty' => $item['allocatedQty'], 'AllocatedBy' => $request->user()->id],
                        $qtyChanged ? ['Status' => 'pending', 'DecidedBy' => null, 'DecidedAt' => null] : []
                    )
                );
                $this->consumeFifo($allocation);
            }
        });

        return response()->json(['message' => 'Allocation saved.']);
    }

    /**
     * GET /api/allocations/{id}/batches
     *
     * The FIFO breakdown for one saved allocation — "300 from BATCH-0004
     * (received 12-May-2026, rack) + 200 from BATCH-0007 (18-May-2026,
     * rack)". This is what turns "Goods allocation and movement on FIFO
     * basis" (O2C Step 8) from a number into an auditable paper trail.
     */
    public function batchBreakdown(Request $request, $id)
    {
        $this->authorizeStaff($request);

        $allocation = ProductAllocation::with(['consumptions.batch'])->find($id);
        if (!$allocation) {
            return response()->json(['message' => 'Allocation not found.'], 404);
        }

        return response()->json([
            'allocationId' => $allocation->Id,
            'allocatedQty' => $allocation->AllocatedQty,
            'consumptions' => $allocation->consumptions->map(fn($c) => [
                'batchNo' => $c->batch->BatchNo ?? '—',
                'warehouse' => $c->batch->Warehouse ?? '—',
                'receivedAt' => optional($c->batch->ReceivedAt ?? null)->toDateString(),
                'consumedQty' => $c->ConsumedQty,
            ])->values(),
        ]);
    }

    /**
     * GET /api/allocations/list
     * Optional filters: status=pending|approved|rejected,
     * erp_status=not_transferred|erp_so_created, date=YYYY-MM-DD (matches
     * DecidedAt), search=text (customer/product name or code).
     *
     * Flat list across every product/customer with a saved allocation —
     * feeds the Sales Order page's four "View Details" drill-downs
     * (Pending Final Approval / Approved Orders Today / Total Order Value /
     * ERP Transfer Pending), which all read from this same table rather
     * than from Orders directly.
     */
    public function list(Request $request)
    {
        $this->authorizeStaff($request);

        $query = ProductAllocation::with(['product', 'customer']);

        if ($status = $request->query('status')) {
            $query->where('Status', $status);
        }
        if ($erpStatus = $request->query('erp_status')) {
            $query->where('ErpStatus', $erpStatus);
        }
        if ($date = $request->query('date')) {
            $query->whereDate('DecidedAt', $date);
        }

        $allocations = $query->orderByDesc('UpdatedAt')->get();

        if ($search = $request->query('search')) {
            $q = mb_strtolower($search);
            $allocations = $allocations->filter(function ($a) use ($q) {
                return str_contains(mb_strtolower($a->product->Name ?? ''), $q)
                    || str_contains(mb_strtolower($a->product->Code ?? ''), $q)
                    || str_contains(mb_strtolower($a->customer->Name ?? ''), $q)
                    || str_contains(mb_strtolower($a->customer->Code ?? ''), $q);
            })->values();
        }

        return response()->json($allocations->map(fn($a) => [
            'allocationId' => $a->Id,
            'productId' => $a->ProductId,
            'productCode' => $a->product->Code ?? null,
            'productName' => $a->product->Name ?? null,
            'customerId' => $a->CustomerId,
            'customerCode' => $a->customer->Code ?? null,
            'customerName' => $a->customer->Name ?? null,
            'allocatedQty' => (int) $a->AllocatedQty,
            'price' => (float) ($a->product->Price ?? 0),
            'totalValue' => round((float) $a->AllocatedQty * (float) ($a->product->Price ?? 0), 2),
            'status' => $a->Status,
            'remarks' => $a->Remarks,
            'erpStatus' => $a->ErpStatus,
            'decidedAt' => optional($a->DecidedAt)->toDateTimeString(),
            'erpTransferredAt' => optional($a->ErpTransferredAt)->toDateTimeString(),
            'updatedAt' => $a->UpdatedAt,
        ])->values());
    }

    /**
     * PATCH /api/allocations/{id}/decision
     * Body: { status?: 'approved'|'rejected', remarks?: string|null }
     *
     * System Admin's tick (approved) / cross (rejected) action in the
     * Marketing Review "Actions" column. Only allowed while the row is
     * still 'pending' when changing status — Remarks alone can be updated
     * at any time (the Remarks box is freeform and independent of the
     * approve/reject decision).
     */
    public function decision(Request $request, $id)
    {
        $this->authorizeSystemAdmin($request);

        $validated = $request->validate([
            'status' => 'nullable|in:approved,rejected',
            'remarks' => 'nullable|string|max:2000',
        ]);

        $allocation = ProductAllocation::find($id);
        if (!$allocation) {
            return response()->json(['message' => 'Allocation not found.'], 404);
        }

        if (!empty($validated['status'])) {
            if ($allocation->Status !== 'pending') {
                return response()->json(['message' => 'Only a Pending row can be approved or rejected.'], 422);
            }
            $allocation->Status = $validated['status'];
            $allocation->DecidedBy = $request->user()->id;
            $allocation->DecidedAt = now();
        }

        if ($request->has('remarks')) {
            $allocation->Remarks = $validated['remarks'];
        }

        $allocation->save();

        return response()->json(['message' => 'Saved.', 'status' => $allocation->Status, 'remarks' => $allocation->Remarks]);
    }

    /**
     * POST /api/allocations/bulk-decision
     * Body: { ids: [1,2,3], status: 'approved'|'rejected' }
     * "Approve Selected" / "Reject Selected" — only rows still Pending are
     * actually moved; anything else in the list is silently skipped.
     */
    public function bulkDecision(Request $request)
    {
        $this->authorizeSystemAdmin($request);

        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer',
            'status' => 'required|in:approved,rejected',
        ]);

        $updated = ProductAllocation::whereIn('Id', $validated['ids'])
            ->where('Status', 'pending')
            ->update([
                'Status' => $validated['status'],
                'DecidedBy' => $request->user()->id,
                'DecidedAt' => now(),
            ]);

        return response()->json(['message' => "{$updated} row(s) updated.", 'updated' => $updated]);
    }

    /**
     * POST /api/allocations/{id}/erp-transfer
     * Only an Approved row can be pushed to ERP; moves ErpStatus to
     * 'erp_so_created'. No live ERP system is wired up yet — this records
     * the handoff on our side so the workflow/UI are ready to plug a real
     * ERP integration in behind this same endpoint.
     */
    public function erpTransfer(Request $request, $id)
    {
        $this->authorizeSystemAdmin($request);

        $allocation = ProductAllocation::find($id);
        if (!$allocation) {
            return response()->json(['message' => 'Allocation not found.'], 404);
        }
        if ($allocation->Status !== 'approved') {
            return response()->json(['message' => 'Only an Approved allocation can be transferred to ERP.'], 422);
        }
        if ($allocation->ErpStatus === 'erp_so_created') {
            return response()->json(['message' => 'Already transferred.', 'erpStatus' => $allocation->ErpStatus]);
        }

        $allocation->ErpStatus = 'erp_so_created';
        $allocation->ErpTransferredAt = now();
        $allocation->save();

        return response()->json(['message' => 'Transferred to ERP.', 'erpStatus' => $allocation->ErpStatus]);
    }

    /**
     * POST /api/allocations/bulk-erp-transfer
     * Body: { ids: [1,2,3] } — bulk version of erpTransfer(); only rows
     * that are Approved and not yet transferred are actually moved.
     */
    public function bulkErpTransfer(Request $request)
    {
        $this->authorizeSystemAdmin($request);

        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer',
        ]);

        $updated = ProductAllocation::whereIn('Id', $validated['ids'])
            ->where('Status', 'approved')
            ->where('ErpStatus', '!=', 'erp_so_created')
            ->update([
                'ErpStatus' => 'erp_so_created',
                'ErpTransferredAt' => now(),
            ]);

        return response()->json(['message' => "{$updated} row(s) transferred.", 'updated' => $updated]);
    }

    /** Only System Admin may give final approval/rejection or push to ERP. */
    private function authorizeSystemAdmin(Request $request): void
    {
        $role = $request->user()->role ?? null;
        abort_unless($role === 'system_admin', 403, 'Only System Admin can perform this action.');
    }

    /**
     * Draws AllocatedQty units from this product's batches, oldest
     * ReceivedAt first (FIFO), and records the consumption trail. Re-runs
     * cleanly if an allocation is edited: previously-consumed quantity is
     * released back to its batches before redrawing, so editing an
     * allocation up or down never leaves stale reservations behind.
     */
    private function consumeFifo(ProductAllocation $allocation): void
    {
        // Release whatever this allocation previously consumed.
        $previous = AllocationBatchConsumption::where('ProductAllocationId', $allocation->Id)->get();
        foreach ($previous as $c) {
            StockBatch::where('Id', $c->BatchId)->increment('RemainingQty', $c->ConsumedQty);
        }
        AllocationBatchConsumption::where('ProductAllocationId', $allocation->Id)->delete();

        $needed = (int) $allocation->AllocatedQty;
        if ($needed <= 0) {
            return;
        }

        $this->ensureOpeningBatch($allocation->ProductId);

        $batches = StockBatch::where('ProductId', $allocation->ProductId)
            ->where('RemainingQty', '>', 0)
            ->orderBy('ReceivedAt')
            ->lockForUpdate()
            ->get();

        foreach ($batches as $batch) {
            if ($needed <= 0)
                break;
            $take = min($needed, $batch->RemainingQty);
            if ($take <= 0)
                continue;

            $batch->decrement('RemainingQty', $take);
            AllocationBatchConsumption::create([
                'ProductAllocationId' => $allocation->Id,
                'BatchId' => $batch->Id,
                'ConsumedQty' => $take,
            ]);
            $needed -= $take;
        }
        // If $needed > 0 here, batch records haven't caught up with
        // Products.Quantity (e.g. stock adjusted directly). The allocation
        // itself is still saved — this only affects the FIFO paper trail.
    }
    /**
     * GET /api/allocations/board
     *
     * Everything Marketing Review's loadBoard() needs in one response:
     * every product with active order demand, each with its full
     * per-customer breakdown — replacing the old pattern of calling
     * GET /allocations/products then GET /allocations?product_id=X once
     * per product (an N+1 request per page load).
     */
    public function board(Request $request)
    {
        $this->authorizeStaff($request);

        // Same aggregate as products(): total ordered qty per product,
        // across every customer, for products with active demand.
        $orderedByProduct = Order::whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->select('ProductId', DB::raw('SUM(Quantity) as TotalOrdered'))
            ->groupBy('ProductId')
            ->get()
            ->keyBy('ProductId');

        if ($orderedByProduct->isEmpty()) {
            return response()->json([]);
        }

        $productIds = $orderedByProduct->keys();
        $products = Product::whereIn('Id', $productIds)->get()->keyBy('Id');

        // Per-customer ordered qty, for every product+customer pair with
        // active demand, in ONE query instead of one per product.
        $orderedRows = Order::whereIn('ProductId', $productIds)
            ->whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->select('ProductId', 'CustomerId', DB::raw('SUM(Quantity) as OrderedQty'), DB::raw('MAX(CreatedAt) as LastOrderedAt'), DB::raw('MAX(Id) as LastOrderId'))
            ->groupBy('ProductId', 'CustomerId')
            ->get()
            ->groupBy('ProductId');

        $allCustomerIds = Order::whereIn('ProductId', $productIds)
            ->whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->pluck('CustomerId')->unique();
        $customers = Customer::whereIn('Id', $allCustomerIds)->get()->keyBy('Id');

        // All allocations for these products, in one query.
        $allocations = ProductAllocation::whereIn('ProductId', $productIds)
            ->get()
            ->groupBy('ProductId');

        // Total allocated per product (for the pool-available calculation).
        $allocatedTotals = ProductAllocation::whereIn('ProductId', $productIds)
            ->select('ProductId', DB::raw('SUM(AllocatedQty) as TotalAllocated'))
            ->groupBy('ProductId')
            ->get()
            ->keyBy('ProductId');

        // Last order + officer lookups, batched across every product.
        $lastOrderIds = $orderedRows->flatten()->pluck('LastOrderId')->filter()->unique()->values();
        $lastOrders = Order::whereIn('Id', $lastOrderIds)->get()->keyBy('Id');
        $officerIds = $lastOrders->pluck('CreatedBy')->filter()->unique()->values();
        $officers = User::whereIn('id', $officerIds)->pluck('name', 'id');

        $result = [];
        foreach ($orderedByProduct as $productId => $row) {
            $product = $products->get($productId);
            if (!$product)
                continue;

            $totalOrdered = (int) $row->TotalOrdered;
            $totalAllocated = (int) ($allocatedTotals->get($productId)->TotalAllocated ?? 0);
            $poolAvailable = max(0, (int) $product->Quantity - $totalAllocated);

            $productAllocations = ($allocations->get($productId) ?? collect())->keyBy('CustomerId');
            $productOrderedRows = $orderedRows->get($productId) ?? collect();

            $customerRows = [];
            foreach ($productOrderedRows as $orderedRow) {
                $customer = $customers->get($orderedRow->CustomerId);
                if (!$customer)
                    continue;

                $allocation = $productAllocations->get($orderedRow->CustomerId);
                $lastOrder = $lastOrders->get($orderedRow->LastOrderId);

                $customerRows[] = [
                    'customerId' => $customer->Id,
                    'code' => $customer->Code,
                    'name' => $customer->Name,
                    'district' => $customer->District,
                    'taluk' => $customer->Taluk,
                    'orderedQty' => (int) $orderedRow->OrderedQty,
                    'allocatedQty' => (int) ($allocation->AllocatedQty ?? 0),
                    'inquiryDate' => $orderedRow->LastOrderedAt ? substr($orderedRow->LastOrderedAt, 0, 10) : null,
                    'orderNo' => $lastOrder->Code ?? null,
                    'officerName' => $lastOrder && $lastOrder->CreatedBy ? ($officers->get($lastOrder->CreatedBy) ?? null) : null,
                    'allocationId' => $allocation->Id ?? null,
                    'status' => $allocation->Status ?? null,
                    'remarks' => $allocation->Remarks ?? null,
                    'erpStatus' => $allocation->ErpStatus ?? 'not_transferred',
                    'decidedAt' => $allocation?->DecidedAt?->toDateTimeString(),
                    'erpTransferredAt' => $allocation?->ErpTransferredAt?->toDateTimeString(),
                ];
            }

            $result[] = [
                'productId' => $product->Id,
                'code' => $product->Code,
                'name' => $product->Name,
                'category' => $product->Category,
                'price' => (float) ($product->Price ?? 0),
                'subType' => $product->SubType ?? $product->subType ?? $product->sub_type ?? $product->Category,
                'shadeNo' => $product->ShadeNo ?? null,
                'availableQty' => (int) $product->Quantity,
                'totalOrdered' => $totalOrdered,
                'totalAllocated' => $totalAllocated,
                'poolAvailable' => $poolAvailable,
                'customers' => $customerRows,
            ];
        }

        return response()->json($result);
    }

    /**
     * Bridges legacy stock: a product created before batch tracking existed
     * has a Quantity but zero StockBatch rows. The first time it's ever
     * allocated against, open one batch for its current on-hand quantity
     * (dated at the product's own creation) so FIFO has something to draw
     * from without requiring a manual backfill for every product.
     */
    private function ensureOpeningBatch(int $productId): void
    {
        $hasBatches = StockBatch::where('ProductId', $productId)->exists();
        if ($hasBatches)
            return;

        $product = Product::find($productId);
        if (!$product || (int) $product->Quantity <= 0)
            return;

        StockBatch::create([
            'BatchNo' => 'BATCH-OPEN-' . $productId,
            'ProductId' => $productId,
            'Warehouse' => StockBatch::warehouseForCategory($product->Category),
            'ReceivedQty' => (int) $product->Quantity,
            'RemainingQty' => (int) $product->Quantity,
            'ReceivedAt' => $product->CreatedAt ?? now(),
            'Notes' => 'Opening stock (auto-created on first allocation, pre-dates batch tracking).',
        ]);
    }

    /** Only Admin / System Admin may view or set allocations; Super Admin can view but not save. */
    private function authorizeStaff(Request $request): void
    {
        $role = $request->user()->role ?? null;
        abort_unless(in_array($role, ['admin', 'system_admin', 'super_admin'], true), 403, 'Not permitted.');

        if ($request->isMethod('post')) {
            abort_if($role === 'super_admin', 403, 'Super Admin is read-only.');
        }
    }
}