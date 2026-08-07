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
     * One row per active Order for this product (pending/approved/
     * processing), newest-ordered-first within priority (see below).
     *
     * ── PER-ORDER ALLOCATION (fixed) ────────────────────────────────────
     * Previously the allocation itself (AllocatedQty / Status / Remarks /
     * ERP state) was tracked per (Product, Customer) only, with no OrderId
     * column. That meant: if the same customer had two active Orders for
     * the same product, BOTH rows showed the same AllocatedQty/Status —
     * approving/allocating one silently affected the other, a brand-new
     * Order could inherit a stale "rejected" status from an unrelated
     * earlier order, and a row's Allocated Qty could show a combined total
     * that didn't match its own Requested Qty (e.g. "Requested 10,
     * Allocated 12" because 12 was really the sum across two orders).
     *
     * Fix: product_allocations now carries OrderId, and every allocation
     * lookup/write below is keyed by (ProductId, OrderId) — each Order is
     * fully independent. CustomerId is still stored on the row (useful for
     * joins/reporting) but is no longer part of the identity key.
     */
    public function index(Request $request)
    {
        $this->authorizeStaff($request);

        $validated = $request->validate([
            'product_id' => 'required|integer|exists:Products,Id',
        ]);

        $product = Product::find($validated['product_id']);

        $orders = Order::where('ProductId', $product->Id)
            ->whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->orderByDesc('Id')
            ->get();

        if ($orders->isEmpty()) {
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

        $customerIds = $orders->pluck('CustomerId')->unique()->values();
        $customers = Customer::whereIn('Id', $customerIds)->get()->keyBy('Id');

        // Keyed by OrderId now — each Order reads its own, independent
        // allocation record (see class-level note above).
        $allocations = ProductAllocation::where('ProductId', $product->Id)
            ->whereIn('OrderId', $orders->pluck('Id'))
            ->get()
            ->keyBy('OrderId');

        $officerIds = $orders->pluck('CreatedBy')->filter()->unique()->values();
        $officers = User::whereIn('id', $officerIds)->pluck('name', 'id');

        $rows = [];
        foreach ($orders as $order) {
            $customer = $customers->get($order->CustomerId);
            if (!$customer)
                continue;

            $allocation = $allocations->get($order->Id);

            $rows[] = [
                'orderId' => $order->Id,
                'customerId' => $customer->Id,
                'code' => $customer->Code,
                'name' => $customer->Name,
                'district' => $customer->District,
                'taluk' => $customer->Taluk,
                'orderedQty' => (int) $order->Quantity,
                'allocatedQty' => (int) ($allocation->AllocatedQty ?? 0),
                'inquiryDate' => $order->CreatedAt ? substr($order->CreatedAt, 0, 10) : null,
                'orderNo' => $order->Code,
                'officerName' => $order->CreatedBy ? ($officers->get($order->CreatedBy) ?? null) : null,
                'allocationId' => $allocation->Id ?? null,
                'status' => $allocation->Status ?? null,
                'remarks' => $allocation->Remarks ?? null,
                'erpStatus' => $allocation->ErpStatus ?? 'not_transferred',
                'decidedAt' => $allocation && $allocation->DecidedAt ? $allocation->DecidedAt->toDateTimeString() : null,
                'erpTransferredAt' => $allocation && $allocation->ErpTransferredAt ? $allocation->ErpTransferredAt->toDateTimeString() : null,
            ];
        }

        // Pending / partially-allocated demand first, then biggest
        // requests — matches board()'s ordering intent, applied here too
        // since this endpoint can be called standalone.
        usort($rows, function ($a, $b) {
            $pa = $this->rowUrgency($a);
            $pb = $this->rowUrgency($b);
            if ($pa !== $pb)
                return $pa <=> $pb;
            return $b['orderedQty'] <=> $a['orderedQty'];
        });

        $totalAllocated = (int) $allocations->sum('AllocatedQty');

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
     * GET /api/allocations/board
     *
     * Single combined payload for the whole Marketing Review board: every
     * product that currently has active order demand, each with its full
     * per-customer/per-order breakdown — computed in one pass instead of
     * the old GET /allocations/products followed by one GET
     * /allocations?product_id=X per product.
     *
     * Per-order allocation keying — see the note on index() above; this
     * endpoint uses the same (ProductId, OrderId) lookup.
     *
     * Rows within each product are ordered PENDING / PARTIALLY ALLOCATED
     * FIRST (System Admin: Not Submitted/Pending decisions first; Admin:
     * Not Allocated/Partial Allocated first), then by largest outstanding
     * quantity — so the Marketing Review table naturally surfaces the
     * work that still needs attention instead of already-settled rows.
     */
    public function board(Request $request)
    {
        $this->authorizeStaff($request);

        // Every product — needed for price/category/sort-no context.
        // Sort No. is a plain running sequence (1, 2, 3…) ordered by
        // Product Code, computed across every product (not just the ones
        // with active demand) so it stays stable as demand changes.
        $allProducts = Product::all(['Id', 'Code', 'Name', 'Category', 'SubType', 'ShadeNo', 'Price', 'Quantity']);
        $sortedByCode = $allProducts->all();
        usort($sortedByCode, fn($a, $b) => strnatcmp((string) $a->Code, (string) $b->Code));
        $sortNoByProduct = [];
        foreach ($sortedByCode as $i => $p) {
            $sortNoByProduct[$p->Id] = $i + 1;
        }
        $productsById = $allProducts->keyBy('Id');

        $orderTotals = Order::whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->select('ProductId', DB::raw('SUM(Quantity) as TotalOrdered'))
            ->groupBy('ProductId')
            ->get()
            ->keyBy('ProductId');

        if ($orderTotals->isEmpty()) {
            return response()->json(['products' => []]);
        }

        $activeProductIds = $orderTotals->keys();

        $allocatedSumByProduct = ProductAllocation::whereIn('ProductId', $activeProductIds)
            ->select('ProductId', DB::raw('SUM(AllocatedQty) as TotalAllocated'))
            ->groupBy('ProductId')
            ->get()
            ->keyBy('ProductId');

        // Every active order across every one of those products, in one
        // query — this is what replaces the old per-product round trip.
        $orders = Order::whereIn('ProductId', $activeProductIds)
            ->whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->orderByDesc('Id')
            ->get();

        $customerIds = $orders->pluck('CustomerId')->unique()->values();
        $customers = Customer::whereIn('Id', $customerIds)->get()->keyBy('Id');

        $officerIds = $orders->pluck('CreatedBy')->filter()->unique()->values();
        $officers = User::whereIn('id', $officerIds)->pluck('name', 'id');

        // Keyed by (ProductId, then OrderId) — each Order reads its own,
        // independent allocation record. See the note on index() above.
        $allocationsByProduct = ProductAllocation::whereIn('ProductId', $activeProductIds)
            ->whereIn('OrderId', $orders->pluck('Id'))
            ->get()
            ->groupBy('ProductId')
            ->map(fn($group) => $group->keyBy('OrderId'));

        $ordersByProduct = $orders->groupBy('ProductId');

        $result = [];
        foreach ($activeProductIds as $productId) {
            $product = $productsById->get($productId);
            if (!$product) {
                continue;
            }

            $productAllocations = $allocationsByProduct->get($productId, collect());
            $rows = [];
            foreach ($ordersByProduct->get($productId, collect()) as $order) {
                $customer = $customers->get($order->CustomerId);
                if (!$customer) {
                    continue;
                }

                $allocation = $productAllocations->get($order->Id);

                $rows[] = [
                    'orderId' => $order->Id,
                    'customerId' => $customer->Id,
                    'code' => $customer->Code,
                    'name' => $customer->Name,
                    'district' => $customer->District,
                    'taluk' => $customer->Taluk,
                    'orderedQty' => (int) $order->Quantity,
                    'allocatedQty' => (int) ($allocation->AllocatedQty ?? 0),
                    'inquiryDate' => $order->CreatedAt ? substr($order->CreatedAt, 0, 10) : null,
                    'orderNo' => $order->Code,
                    'officerName' => $order->CreatedBy ? ($officers->get($order->CreatedBy) ?? null) : null,
                    'allocationId' => $allocation->Id ?? null,
                    'status' => $allocation->Status ?? null,
                    'remarks' => $allocation->Remarks ?? null,
                    'erpStatus' => $allocation->ErpStatus ?? 'not_transferred',
                    'decidedAt' => $allocation && $allocation->DecidedAt ? $allocation->DecidedAt->toDateTimeString() : null,
                    'erpTransferredAt' => $allocation && $allocation->ErpTransferredAt ? $allocation->ErpTransferredAt->toDateTimeString() : null,
                ];
            }

            // Pending / partially-allocated first, then largest requests —
            // see method doc-block above.
            usort($rows, function ($a, $b) {
                $pa = $this->rowUrgency($a);
                $pb = $this->rowUrgency($b);
                if ($pa !== $pb)
                    return $pa <=> $pb;
                return $b['orderedQty'] <=> $a['orderedQty'];
            });

            $totalAllocated = (int) $productAllocations->sum('AllocatedQty');
            $totalOrdered = (int) $orderTotals->get($productId)->TotalOrdered;

            $result[] = [
                'productId' => $product->Id,
                'code' => $product->Code,
                'name' => $product->Name,
                'category' => $product->Category,
                'subType' => $product->SubType,
                'sortNo' => $sortNoByProduct[$product->Id] ?? null,
                'shadeNo' => $product->ShadeNo,
                'price' => (float) $product->Price,
                'availableQty' => (int) $product->Quantity,
                'totalOrdered' => $totalOrdered,
                'totalAllocated' => $totalAllocated,
                'shortfall' => max(0, $totalOrdered - (int) $product->Quantity),
                'customers' => $rows,
            ];
        }

        // Oversubscribed products first, same as products() above.
        usort($result, fn($a, $b) => $b['shortfall'] <=> $a['shortfall']);

        return response()->json(['products' => $result]);
    }

    /**
     * Ranks a board/index row by how urgently it needs attention:
     *   0 = not yet submitted, or submitted and still Pending decision,
     *       or not fully allocated yet (Requested > Allocated)
     *   1 = everything else (Approved/Rejected AND fully allocated)
     * Used to sort Pending/Partially-Allocated rows to the top of the
     * table, both in the flat index() list and within each product group
     * in board().
     */
    private function rowUrgency(array $row): int
    {
        if (($row['status'] ?? null) === null || $row['status'] === 'pending') {
            return 0;
        }
        if ((int) $row['allocatedQty'] < (int) $row['orderedQty']) {
            return 0;
        }
        return 1;
    }

    /**
     * POST /api/allocations
     * Body: { productId, allocations: [{ orderId, customerId, allocatedQty }] }
     *
     * Bulk upsert, ONE allocation record per Order now (keyed on
     * (ProductId, OrderId) — see the note on index() above). Rejected if
     * the total allocated would exceed the product's available stock — an
     * admin can always allocate *less* than what was ordered, never more
     * than what's on hand.
     *
     * ── ERP-STATUS CARRY-OVER FIX ─────────────────────────────────────
     * A row can already be ErpStatus = 'erp_so_created' from a PREVIOUS,
     * smaller allocation (e.g. 700 of an 800-unit order was allocated,
     * approved, and transferred). If Admin later tops that row up (e.g.
     * +100 to reach the full 800) and clicks Approval, the extra 100
     * units have obviously never reached ERP — but without this check
     * ErpStatus would just sit at 'erp_so_created' forever, so the badge
     * would keep reading "ERP SO Created" even though only 700 of the
     * new 800 total were ever actually transferred.
     *
     * Fix: whenever a row that's currently 'erp_so_created' receives a
     * NEW AllocatedQty that's higher than what's already stored, drop
     * ErpStatus back to 'not_transferred' (and clear ErpTransferredAt) so
     * the row re-enters the normal Approve -> Ready for ERP -> Transfer
     * cycle for the full new total.
     *
     * NOTE: this compares against the PREVIOUS AllocatedQty as a stand-in
     * for "what was actually transferred", which is safe as long as a row
     * is never partially transferred (bulkErpTransfer() always transfers
     * the row's *entire* AllocatedQty in one go — see below). If partial
     * ERP transfers are ever introduced, track a dedicated
     * TransferredQty column instead of inferring it from AllocatedQty.
     */
    public function store(Request $request)
    {
        $this->authorizeStaff($request);

        $validated = $request->validate([
            'productId' => 'required|integer|exists:Products,Id',
            'allocations' => 'required|array|min:1',
            'allocations.*.orderId' => 'required|integer|exists:Orders,Id',
            'allocations.*.customerId' => 'required|integer|exists:Customers,Id',
            'allocations.*.allocatedQty' => 'required|integer|min:0',
        ]);

        $product = Product::find($validated['productId']);

        // One entry per OrderId — each Order is its own allocation record
        // now. Dedupe defensively by OrderId (keep the last value) in case
        // the client ever sends the same order twice in one payload.
        $byOrder = [];
        foreach ($validated['allocations'] as $item) {
            $byOrder[$item['orderId']] = $item;
        }

        $totalRequested = array_sum(array_column($byOrder, 'allocatedQty'));

        if ($totalRequested > (int) $product->Quantity) {
            return response()->json([
                'message' => "Total allocated (" . $totalRequested . ") can't exceed available stock (" . (int) $product->Quantity . ").",
            ], 422);
        }

        DB::transaction(function () use ($byOrder, $validated, $request) {
            foreach ($byOrder as $orderId => $item) {
                $allocatedQty = $item['allocatedQty'];

                $existing = ProductAllocation::where('ProductId', $validated['productId'])
                    ->where('OrderId', $orderId)->first();
                $qtyChanged = !$existing || (int) $existing->AllocatedQty !== (int) $allocatedQty;

                $attributes = [
                    'CustomerId' => $item['customerId'],
                    'AllocatedQty' => $allocatedQty,
                    'AllocatedBy' => $request->user()->id,
                ];

                if ($qtyChanged) {
                    $attributes['Status'] = 'pending';
                    $attributes['DecidedBy'] = null;
                    $attributes['DecidedAt'] = null;
                }

                // Carry-over fix — see method doc-block above.
                if (
                    $existing
                    && $existing->ErpStatus === 'erp_so_created'
                    && (int) $allocatedQty > (int) $existing->AllocatedQty
                ) {
                    $attributes['ErpStatus'] = 'not_transferred';
                    $attributes['ErpTransferredAt'] = null;
                }

                $allocation = ProductAllocation::updateOrCreate(
                    ['ProductId' => $validated['productId'], 'OrderId' => $orderId],
                    $attributes
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
     *
     * NOTE: this view is aggregated per PRODUCT for the customer (a
     * customer can have several active Orders for the same product, and
     * this rolls them up into one line). "MyAllocatedQty" now SUMS across
     * every one of that customer's per-order allocation rows for the
     * product, since each Order has its own allocation record —
     * previously there was only ever one row per (Product, Customer) to
     * read, so a plain keyBy() was enough; with per-order rows that would
     * silently drop all but one Order's allocation.
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

        // SUM across this customer's per-order allocation rows for each
        // product — see method doc-block above.
        $myAllocated = ProductAllocation::where('CustomerId', $customer->Id)
            ->whereIn('ProductId', $ordered->keys())
            ->select('ProductId', DB::raw('SUM(AllocatedQty) as MyAllocatedQty'))
            ->groupBy('ProductId')
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
            $myAllocatedQty = (int) ($myAllocated->get($productId)->MyAllocatedQty ?? 0);
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
     * Body: { customerId, allocations: [{ productId, orderId, allocatedQty }] }
     *
     * Customer-wise save, now keyed by (ProductId, OrderId) — a customer
     * with two active Orders for the same product gets two independent
     * allocation rows here too, matching store() above. Same rule as the
     * product-wise store(): can never push a product's grand total (every
     * order's allocation, this customer's and everyone else's) past its
     * available stock.
     *
     * Same ERP-status carry-over fix as store() above — see that
     * method's doc-block for the full rationale.
     */
    public function storeByCustomer(Request $request)
    {
        $this->authorizeStaff($request);

        $validated = $request->validate([
            'customerId' => 'required|integer|exists:Customers,Id',
            'allocations' => 'required|array|min:1',
            'allocations.*.productId' => 'required|integer|exists:Products,Id',
            'allocations.*.orderId' => 'required|integer|exists:Orders,Id',
            'allocations.*.allocatedQty' => 'required|integer|min:0',
        ]);

        $productIds = array_column($validated['allocations'], 'productId');
        $products = Product::whereIn('Id', $productIds)->get()->keyBy('Id');

        // "Elsewhere" = every other allocation row for this product,
        // regardless of which order it belongs to — excluded by OrderId
        // now instead of by CustomerId, since the same customer's other
        // Order for this product also needs to count towards the total.
        $orderIds = array_column($validated['allocations'], 'orderId');
        $allocatedElsewhere = ProductAllocation::whereIn('ProductId', $productIds)
            ->whereNotIn('OrderId', $orderIds)
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
                    ->where('OrderId', $item['orderId'])->first();
                $qtyChanged = !$existing || (int) $existing->AllocatedQty !== (int) $item['allocatedQty'];

                $attributes = [
                    'CustomerId' => $validated['customerId'],
                    'AllocatedQty' => $item['allocatedQty'],
                    'AllocatedBy' => $request->user()->id,
                ];

                if ($qtyChanged) {
                    $attributes['Status'] = 'pending';
                    $attributes['DecidedBy'] = null;
                    $attributes['DecidedAt'] = null;
                }

                // Carry-over fix — see store()'s doc-block above.
                if (
                    $existing
                    && $existing->ErpStatus === 'erp_so_created'
                    && (int) $item['allocatedQty'] > (int) $existing->AllocatedQty
                ) {
                    $attributes['ErpStatus'] = 'not_transferred';
                    $attributes['ErpTransferredAt'] = null;
                }

                $allocation = ProductAllocation::updateOrCreate(
                    ['ProductId' => $item['productId'], 'OrderId' => $item['orderId']],
                    $attributes
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
     * Flat list across every product/order with a saved allocation —
     * feeds the Sales Order page's four "View Details" drill-downs
     * (Pending Final Approval / Approved Orders Today / Total Order Value /
     * ERP Transfer Pending), which all read from this same table rather
     * than from Orders directly.
     *
     * Order context (Order No / Requested Qty) now comes straight off the
     * allocation's own OrderId relation — no more guessing the right
     * Order by (ProductId, CustomerId), which could previously attach the
     * wrong Order's numbers to a row when a customer had more than one
     * Order for the same product.
     */
    public function list(Request $request)
    {
        $this->authorizeStaff($request);

        $query = ProductAllocation::with(['product', 'customer', 'order']);

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

        // ── DEDUPE (defensive) ─────────────────────────────────────────
        // product_allocations has no enforced DB-level unique constraint on
        // (ProductId, OrderId) in every environment — updateOrCreate() in
        // store() relies on the application layer to find the "existing"
        // row, which can lose a race and insert a second row for the same
        // pair. Collapse to the most-recently-updated row per
        // (ProductId, OrderId) here so a stray duplicate never surfaces as
        // two identical lines in the UI.
        $allocations = $allocations
            ->groupBy(fn($a) => $a->ProductId . '-' . $a->OrderId)
            ->map(fn($group) => $group->sortByDesc('UpdatedAt')->first())
            ->values();

        if ($search = $request->query('search')) {
            $q = mb_strtolower($search);
            $allocations = $allocations->filter(function ($a) use ($q) {
                return str_contains(mb_strtolower($a->product->Name ?? ''), $q)
                    || str_contains(mb_strtolower($a->product->Code ?? ''), $q)
                    || str_contains(mb_strtolower($a->customer->Name ?? ''), $q)
                    || str_contains(mb_strtolower($a->customer->Code ?? ''), $q);
            })->values();
        }

        $productIds = $allocations->pluck('ProductId')->unique()->values();
        $products = Product::whereIn('Id', $productIds)->get()->keyBy('Id');
        $allocatedSumByProduct = ProductAllocation::whereIn('ProductId', $productIds)
            ->select('ProductId', DB::raw('SUM(AllocatedQty) as TotalAllocated'))
            ->groupBy('ProductId')
            ->get()
            ->keyBy('ProductId');

        return response()->json($allocations->map(function ($a) use ($products, $allocatedSumByProduct) {
            $product = $products->get($a->ProductId);
            $poolAvailable = $product
                ? max(0, (int) $product->Quantity - (int) ($allocatedSumByProduct->get($a->ProductId)->TotalAllocated ?? 0))
                : 0;
            $rowAvailable = $poolAvailable + (int) $a->AllocatedQty;

            return [
                'allocationId' => $a->Id,
                'productId' => $a->ProductId,
                'productCode' => $a->product->Code ?? null,
                'productName' => $a->product->Name ?? null,
                'customerId' => $a->CustomerId,
                'customerCode' => $a->customer->Code ?? null,
                'customerName' => $a->customer->Name ?? null,
                'orderId' => $a->OrderId,
                'orderNo' => $a->order->Code ?? null,
                'requestedQty' => $a->order->Quantity ?? null,
                'availableQty' => $rowAvailable,
                'allocatedQty' => (int) $a->AllocatedQty,
                'price' => (float) ($a->product->Price ?? 0),
                'totalValue' => round((float) $a->AllocatedQty * (float) ($a->product->Price ?? 0), 2),
                'status' => $a->Status,
                'remarks' => $a->Remarks,
                'erpStatus' => $a->ErpStatus,
                'decidedAt' => optional($a->DecidedAt)->toDateTimeString(),
                'erpTransferredAt' => optional($a->ErpTransferredAt)->toDateTimeString(),
                'updatedAt' => $a->UpdatedAt,
            ];
        })->values());
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
     *
     * Approving/rejecting here also mirrors onto the ONE underlying Order
     * this allocation now represents (see cascadeOrderStatus()) — since
     * allocations are per-order, this can no longer bleed onto a
     * customer's other, unrelated Order for the same product:
     *   - approved -> Order.Status = 'approved'
     *   - rejected -> Order.Status = 'declined'
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
            // ERP creation is a separate, later step — it only happens
            // when the "Transfer to ERP" button is clicked (see
            // erpTransfer() / bulkErpTransfer() below), never automatically
            // the instant a row is ticked here.

            if ($allocation->OrderId) {
                $this->cascadeOrderStatus(
                    $allocation->OrderId,
                    $validated['status'] === 'approved' ? 'approved' : 'declined'
                );
            }
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
     *
     * Same Order-status mirroring as decision() above, applied per
     * allocation's own OrderId.
     */
    public function bulkDecision(Request $request)
    {
        $this->authorizeSystemAdmin($request);

        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer',
            'status' => 'required|in:approved,rejected',
        ]);

        // Snapshot which OrderIds are actually Pending and about to move,
        // BEFORE updating, so we know exactly which Orders to cascade onto
        // afterwards.
        $targets = ProductAllocation::whereIn('Id', $validated['ids'])
            ->where('Status', 'pending')
            ->get(['Id', 'OrderId']);

        $updated = ProductAllocation::whereIn('Id', $validated['ids'])
            ->where('Status', 'pending')
            ->update([
                'Status' => $validated['status'],
                'DecidedBy' => $request->user()->id,
                'DecidedAt' => now(),
            ]);

        $orderStatus = $validated['status'] === 'approved' ? 'approved' : 'declined';
        foreach ($targets as $t) {
            if ($t->OrderId) {
                $this->cascadeOrderStatus($t->OrderId, $orderStatus);
            }
        }

        return response()->json(['message' => "{$updated} row(s) updated.", 'updated' => $updated]);
    }

    /**
     * POST /api/allocations/{id}/erp-transfer
     * Only an Approved row can be pushed to ERP; moves ErpStatus to
     * 'erp_so_created'. No live ERP system is wired up yet — this records
     * the handoff on our side so the workflow/UI are ready to plug a real
     * ERP integration in behind this same endpoint. This is a deliberate,
     * separate action from Approve — it is never triggered automatically.
     *
     * Also mirrors onto the ONE underlying Order this allocation
     * represents: the ERP handoff means production/fulfilment now starts,
     * so Order.Status advances to 'processing' — matching the Order
     * Status tab's own pending -> approved -> processing -> dispatched ->
     * delivered flow.
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

        if ($allocation->OrderId) {
            $this->cascadeOrderStatus($allocation->OrderId, 'processing');
        }

        return response()->json(['message' => 'Transferred to ERP.', 'erpStatus' => $allocation->ErpStatus]);
    }

    /**
     * POST /api/allocations/bulk-erp-transfer
     * Body: { ids: [1,2,3] } — bulk version of erpTransfer(); only rows
     * that are Approved and not yet transferred are actually moved. This
     * is what the Marketing Review page's standalone "Transfer to ERP"
     * button calls — completely separate from Approval/Approve.
     *
     * Same Order-status mirroring as erpTransfer() above (-> 'processing'),
     * applied per allocation's own OrderId.
     *
     * NOTE: this always transfers a row's ENTIRE current AllocatedQty in
     * one go — there's no partial-transfer concept today. That's what
     * makes the "compare against previous AllocatedQty" carry-over check
     * in store()/storeByCustomer() above safe; if partial ERP transfers
     * are ever introduced here, that check needs to move to a dedicated
     * TransferredQty column instead.
     */
    public function bulkErpTransfer(Request $request)
    {
        $this->authorizeSystemAdmin($request);

        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer',
        ]);

        $targets = ProductAllocation::whereIn('Id', $validated['ids'])
            ->where('Status', 'approved')
            ->where('ErpStatus', '!=', 'erp_so_created')
            ->get(['Id', 'OrderId']);

        $updated = ProductAllocation::whereIn('Id', $validated['ids'])
            ->where('Status', 'approved')
            ->where('ErpStatus', '!=', 'erp_so_created')
            ->update([
                'ErpStatus' => 'erp_so_created',
                'ErpTransferredAt' => now(),
            ]);

        foreach ($targets as $t) {
            if ($t->OrderId) {
                $this->cascadeOrderStatus($t->OrderId, 'processing');
            }
        }

        return response()->json(['message' => "{$updated} row(s) transferred.", 'updated' => $updated]);
    }

    /** Only System Admin may give final approval/rejection or push to ERP. */
    private function authorizeSystemAdmin(Request $request): void
    {
        $role = $request->user()->role ?? null;
        abort_unless($role === 'system_admin', 403, 'Only System Admin can perform this action.');
    }

    /**
     * Mirrors an allocation decision (approve/reject) or ERP handoff onto
     * the ONE Order this allocation represents (matched by OrderId
     * directly now — no more matching by ProductId+CustomerId, which
     * used to move every active Order a customer had for that product
     * together, even ones the decision never touched).
     */
    private function cascadeOrderStatus(int $orderId, string $orderStatus): void
    {
        Order::where('Id', $orderId)
            ->whereIn('Status', ALLOCATION_ACTIVE_STATUSES)
            ->update(['Status' => $orderStatus]);
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
    /**
     * POST /api/allocations/{id}/cancel
     *
     * Sales Order page's "Reject" button (Pending Final Approval view).
     * Distinct from decision()'s reject: that keeps the allocation row
     * around with Status = 'rejected' (shows elsewhere as "Lost"). This one
     * removes the row from the allocation pool entirely — any stock it had
     * reserved via FIFO is released back to its batches for other customers
     * to draw from, and the underlying Order is cascaded to 'declined', the
     * same way decision() does.
     */
    public function cancel(Request $request, $id)
    {
        $this->authorizeSystemAdmin($request);

        $allocation = ProductAllocation::find($id);
        if (!$allocation) {
            return response()->json(['message' => 'Allocation not found.'], 404);
        }

        $orderId = $allocation->OrderId;

        DB::transaction(function () use ($allocation) {
            // Release whatever this allocation had reserved via FIFO — same
            // release step consumeFifo() itself does before redrawing.
            $consumptions = AllocationBatchConsumption::where('ProductAllocationId', $allocation->Id)->get();
            foreach ($consumptions as $c) {
                StockBatch::where('Id', $c->BatchId)->increment('RemainingQty', $c->ConsumedQty);
            }
            AllocationBatchConsumption::where('ProductAllocationId', $allocation->Id)->delete();

            $allocation->delete();
        });

        if ($orderId) {
            $this->cascadeOrderStatus($orderId, 'declined');
        }

        return response()->json(['message' => 'Order removed from Sales Order.']);
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