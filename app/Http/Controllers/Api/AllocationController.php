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
     * processing), newest first. Previously this summed every active
     * Order a customer had for the product into a single merged row —
     * Marketing wants each Order to keep showing up as its own line, so
     * we build the list from Orders directly instead of grouping by
     * CustomerId.
     *
     * IMPORTANT CAVEAT: the allocation itself (AllocatedQty / Status /
     * Remarks / ERP state) is still tracked per (Product, Customer) on
     * ProductAllocation — there's no OrderId column there yet. So if the
     * same customer has two active Orders for this product, both rows
     * below will display the *same* AllocatedQty/Status/allocationId
     * (they share one allocation record), and approving/allocating one
     * currently affects both. Giving each Order its own independent
     * allocation needs a follow-up migration adding an OrderId column to
     * product_allocations (with the unique key becoming
     * [ProductId, CustomerId, OrderId]), plus matching updates to
     * store(), storeByCustomer(), decision(), bulkDecision() and
     * erpTransfer()/bulkErpTransfer() below. This method only fixes the
     * *display* — each Order is its own line now — pending that schema
     * change.
     *
     * (Same caveat applies to cascadeOrderStatus() below: since one
     * allocation still represents every active Order a customer has for
     * this product, mirroring its decision onto "the Order" really means
     * mirroring it onto all of them, until that migration lands.)
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

        // Still keyed by CustomerId (see caveat above) — every Order line
        // from the same customer reads off this same allocation record.
        $allocations = ProductAllocation::where('ProductId', $product->Id)
            ->whereIn('CustomerId', $customerIds)
            ->get()
            ->keyBy('CustomerId');

        $officerIds = $orders->pluck('CreatedBy')->filter()->unique()->values();
        $officers = User::whereIn('id', $officerIds)->pluck('name', 'id');

        $rows = [];
        foreach ($orders as $order) {
            $customer = $customers->get($order->CustomerId);
            if (!$customer)
                continue;

            $allocation = $allocations->get($order->CustomerId);

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

        // Biggest requests first, so the admin sees who needs the most first.
        usort($rows, fn($a, $b) => $b['orderedQty'] <=> $a['orderedQty']);

        // Allocated/remaining totals still come from the (Product,Customer)
        // allocation records, not summed per-Order, since that's still the
        // real unit of allocation on the server today.
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
     * per-customer breakdown — computed in one pass instead of the old
     * GET /allocations/products followed by one GET
     * /allocations?product_id=X per product (which was loading the page
     * one product at a time — see Batches.jsx's previous loadBoard()).
     *
     * Same underlying rules as products()/index() above: active demand =
     * pending/approved/processing orders; allocations are still keyed by
     * (ProductId, CustomerId) (see the caveat on index()), so every Order
     * line from the same customer for the same product reads off the
     * same allocation record.
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

        // Still keyed by (ProductId, CustomerId) — same caveat as index()
        // above: every Order line from the same customer for the same
        // product reads off this same allocation record.
        $allocationsByProduct = ProductAllocation::whereIn('ProductId', $activeProductIds)
            ->whereIn('CustomerId', $customerIds)
            ->get()
            ->groupBy('ProductId')
            ->map(fn($group) => $group->keyBy('CustomerId'));

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

                $allocation = $productAllocations->get($order->CustomerId);

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

            // Biggest requests first, same as index() above.
            usort($rows, fn($a, $b) => $b['orderedQty'] <=> $a['orderedQty']);

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

        // Multiple entries can share a CustomerId (a customer with more than
        // one active Order for this product — see the caveat in index()).
        // Only one ProductAllocation row per (Product, Customer) ever actually
        // gets written below, so dedupe here first — keep the LAST value per
        // customer, matching what updateOrCreate() will persist — otherwise
        // the same customer's demand gets double-counted against stock.
        $byCustomer = [];
        foreach ($validated['allocations'] as $item) {
            $byCustomer[$item['customerId']] = $item['allocatedQty'];
        }

        $totalRequested = array_sum($byCustomer);

        if ($totalRequested > (int) $product->Quantity) {
            return response()->json([
                'message' => "Total allocated (" . $totalRequested . ") can't exceed available stock (" . (int) $product->Quantity . ").",
            ], 422);
        }

        DB::transaction(function () use ($byCustomer, $validated, $request) {
            foreach ($byCustomer as $customerId => $allocatedQty) {
                $existing = ProductAllocation::where('ProductId', $validated['productId'])
                    ->where('CustomerId', $customerId)->first();
                $qtyChanged = !$existing || (int) $existing->AllocatedQty !== (int) $allocatedQty;

                $allocation = ProductAllocation::updateOrCreate(
                    ['ProductId' => $validated['productId'], 'CustomerId' => $customerId],
                    array_merge(
                        ['AllocatedQty' => $allocatedQty, 'AllocatedBy' => $request->user()->id],
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
     *
     * Approving/rejecting here also mirrors onto the underlying Order(s)
     * (see cascadeOrderStatus()) so Order Status / customer / end-user
     * dashboards agree with what Marketing Review just decided, instead of
     * only ProductAllocation knowing about it:
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

            $this->cascadeOrderStatus(
                $allocation->ProductId,
                $allocation->CustomerId,
                $validated['status'] === 'approved' ? 'approved' : 'declined'
            );
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
     * (Product, Customer) pair actually touched by this batch.
     */
    public function bulkDecision(Request $request)
    {
        $this->authorizeSystemAdmin($request);

        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer',
            'status' => 'required|in:approved,rejected',
        ]);

        // Snapshot which (Product, Customer) pairs are actually Pending and
        // about to move, BEFORE updating, so we know exactly which Orders
        // to cascade onto afterwards.
        $targets = ProductAllocation::whereIn('Id', $validated['ids'])
            ->where('Status', 'pending')
            ->get(['Id', 'ProductId', 'CustomerId']);

        $updated = ProductAllocation::whereIn('Id', $validated['ids'])
            ->where('Status', 'pending')
            ->update([
                'Status' => $validated['status'],
                'DecidedBy' => $request->user()->id,
                'DecidedAt' => now(),
            ]);

        $orderStatus = $validated['status'] === 'approved' ? 'approved' : 'declined';
        foreach ($targets as $t) {
            $this->cascadeOrderStatus($t->ProductId, $t->CustomerId, $orderStatus);
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
     * Also mirrors onto the underlying Order(s): the ERP handoff means
     * production/fulfilment now starts, so Order.Status advances to
     * 'processing' — matching the Order Status tab's own pending -> approved
     * -> processing -> dispatched -> delivered flow.
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

        $this->cascadeOrderStatus($allocation->ProductId, $allocation->CustomerId, 'processing');

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
     * applied per (Product, Customer) pair actually transferred.
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
            ->get(['Id', 'ProductId', 'CustomerId']);

        $updated = ProductAllocation::whereIn('Id', $validated['ids'])
            ->where('Status', 'approved')
            ->where('ErpStatus', '!=', 'erp_so_created')
            ->update([
                'ErpStatus' => 'erp_so_created',
                'ErpTransferredAt' => now(),
            ]);

        foreach ($targets as $t) {
            $this->cascadeOrderStatus($t->ProductId, $t->CustomerId, 'processing');
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
     * every currently-active Order this allocation actually represents
     * (Orders.ProductId + Orders.CustomerId, status still in
     * pending/approved/processing) — so Order Status, the customer
     * dashboard, and the end-user dashboard all agree with what Marketing
     * Review just decided, instead of only ProductAllocation knowing
     * about it.
     *
     * CAVEAT: ProductAllocation is still keyed by [ProductId, CustomerId],
     * not OrderId (see the caveat in index()). So if this customer has
     * more than one active Order for this product, ALL of them get moved
     * together — there's no way yet to approve/advance just one of them
     * independently. Once a follow-up migration adds OrderId to
     * product_allocations, this should instead target the single matching
     * Order.
     */
    private function cascadeOrderStatus(int $productId, int $customerId, string $orderStatus): void
    {
        Order::where('ProductId', $productId)
            ->where('CustomerId', $customerId)
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