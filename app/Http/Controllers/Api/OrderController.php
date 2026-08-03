<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OrderController extends Controller
{
    /** GET /api/orders */
    public function index(Request $request)
    {
        // NOTE: 'creator' added so the frontend (OrderList.jsx) can tell
        // whether an order was placed by the end_user themself ("My
        // Orders") or by one of their customers directly ("Customer
        // Orders") — see detectPlacement() on the frontend. Requires an
        // Order::creator() relationship, e.g.
        //   public function creator() { return $this->belongsTo(User::class, 'CreatedBy'); }
        // If that relationship doesn't exist on the Order model yet, add
        // it before deploying this change.
        $query = Order::with(['customer', 'product', 'assignee', 'creator']);
        $caller = $request->user();

        if ($status = $request->query('status')) {
            $query->where('Status', $status);
        }

        // Comma-separated list of statuses — used by the Order Enquiry
        // screen to pull everything still "in the enquiry pipeline"
        // (pending + assigned + approved) in one call.
        if ($statusIn = $request->query('status_in')) {
            $statuses = array_filter(array_map('trim', explode(',', $statusIn)));
            if (!empty($statuses)) {
                $query->whereIn('Status', $statuses);
            }
        }

        if ($paymentStatus = $request->query('payment_status')) {
            $query->where('PaymentStatus', $paymentStatus);
        }

        if ($category = $request->query('category')) {
            $query->where('Category', $category);
        }

        // Used by Add Order to check a specific customer's payment history
        // (credit-limit warning) and by any screen that wants one
        // customer's order book without pulling everything.
        if ($customerId = $request->query('customerId')) {
            $query->where('CustomerId', $customerId);
        }

        // End Users (Field Officers) see:
        //   - orders they personally created (CreatedBy = them), i.e.
        //     staff-placed orders (My Orders), AND
        //   - orders placed by any of their own customers directly via
        //     cart checkout (Customer Orders) — these have CreatedBy set
        //     to the customer's own user id, not the field officer's, so
        //     they have to be pulled in via CustomerId + Taluk instead.
        //
        // Pass ?scope=area to instead see every order (any creator, any
        // customer) for customers within their own assigned Taluk(s) —
        // used by the read-only "Order Enquiry" screen so a field officer
        // can see what's pending approval across their whole area, not
        // just their own entries / their own customers.
        if ($caller && $caller->role === 'end_user') {
            $taluks = $this->callerAreas($caller, 'Taluk');
            $customerIds = Customer::whereIn('Taluk', $taluks)->pluck('Id');

            if ($request->query('scope') === 'area') {
                $query->whereIn('CustomerId', $customerIds->isEmpty() ? [0] : $customerIds);
            } else {
                // "own" scope (default): mine + my customers'.
                $query->where(function ($q) use ($caller, $customerIds) {
                    $q->where('CreatedBy', $caller->id)
                        ->orWhereIn('CustomerId', $customerIds->isEmpty() ? [0] : $customerIds);
                });
            }
        }

        // Admins only see orders for customers within their own assigned
        // District(s) — matches the same scoping already applied to which
        // customers they can see/order for. System/Super Admin unscoped.
        if ($caller && $caller->role === 'admin') {
            $districts = $this->callerAreas($caller, 'District');
            $customerIds = Customer::whereIn('District', $districts)->pluck('Id');
            $query->whereIn('CustomerId', $customerIds->isEmpty() ? [0] : $customerIds);
        }

        // Customers only ever see their own orders (for tracking delivery
        // status) — never the full company order book.
        if ($caller && $caller->role === 'customer') {
            $customer = Customer::where('UserId', $caller->id)->first();
            $query->where('CustomerId', $customer->Id ?? 0);
        }

        return response()->json(
            $query->orderByDesc('Id')->get()
        );
    }

    /** GET /api/orders/{id} */
    public function show($id)
    {
        // NOTE: 'creator' added here too, for consistency with index()
        // (e.g. the view/edit order screen also benefits from knowing who
        // placed the order).
        $order = Order::with(['customer', 'product', 'invoice', 'creator'])->find($id);

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        return response()->json($order);
    }

    /**
     * POST /api/orders
     *
     * Staff-only (Field Officer / Admin / System Admin) — they set pricing
     * and discount directly. Customers place orders through the cart/
     * enquiry flow instead (see storeBulk below), where price always comes
     * from the Product itself and no self-discount is possible.
     */
    public function store(Request $request)
    {
        if ($request->user() && $request->user()->role === 'customer') {
            return response()->json(['message' => 'Please use the cart to submit an enquiry.'], 403);
        }

        $validated = $request->validate([
            'customerId' => 'required|integer|exists:Customers,Id',
            'productId' => 'required|integer|exists:Products,Id',
            'qty' => 'required|integer|min:1',
            'pricePerUnit' => 'required|numeric|min:0',
            'discount' => 'nullable|numeric|min:0|max:100',
            'deliveryDate' => 'nullable|date',
            'notes' => 'nullable|string',
            'orderDetails' => 'nullable|array',   // ← product-specific fields
        ]);

        $orderCustomer = Customer::find($validated['customerId']);
        $caller = $request->user();

        // Field Officer (end_user) can only place orders for customers in
        // their own assigned Taluk(s); Admin only within their own assigned
        // District(s). System/Super Admin unscoped.
        if ($caller && $caller->role === 'end_user') {
            $taluks = $this->callerAreas($caller, 'Taluk');
            if (!$orderCustomer || !in_array($orderCustomer->Taluk, $taluks, true)) {
                return response()->json(['message' => 'You can only place orders for customers in your own assigned Taluk(s).'], 403);
            }
        }
        if ($caller && $caller->role === 'admin') {
            $districts = $this->callerAreas($caller, 'District');
            if (!$orderCustomer || !in_array($orderCustomer->District, $districts, true)) {
                return response()->json(['message' => 'You can only place orders for customers in your own assigned District(s).'], 403);
            }
        }

        $product = Product::find($validated['productId']);

        $qty = (float) $validated['qty'];
        $pricePerUnit = (float) $validated['pricePerUnit'];
        $discountPct = (float) ($validated['discount'] ?? 0);
        $totalAmount = round($qty * $pricePerUnit * (1 - $discountPct / 100), 2);

        $order = Order::create([
            'Code' => $this->generateOrderCode(),
            'CustomerId' => $validated['customerId'],
            'ProductId' => $validated['productId'],
            'Category' => $product->Category,
            'SubType' => $product->SubType,
            'Quantity' => $validated['qty'],
            'PricePerUnit' => $pricePerUnit,
            'DiscountPct' => $discountPct,
            'TotalAmount' => $totalAmount,
            'Status' => 'pending',
            'PaymentStatus' => 'unpaid',
            'DeliveryDate' => $validated['deliveryDate'] ?? null,
            'Notes' => $validated['notes'] ?? null,
            'CreatedBy' => $request->user()->id,
            // NOTE: OrderDetails is cast as 'array' on the Order model, so
            // Eloquent handles the JSON encode/decode itself — pass the
            // plain array (or null), never a pre-encoded JSON string here.
            'OrderDetails' => $validated['orderDetails'] ?? null,
        ]);

        return response()->json($order->load(['customer', 'product']), 201);
    }

    /**
     * POST /api/orders/bulk
     *
     * Customer "Add to Cart → Submit Enquiry" checkout. Accepts multiple
     * products in one go and creates one Order (= one enquiry line) per
     * item, all tied together by a shared CartRef.
     *
     * Deliberately customer-only:
     *   - CustomerId is always the caller's own linked Customer — never
     *     client-supplied, so a customer can never order on someone else's
     *     behalf.
     *   - PricePerUnit always comes from the Product's own price — the
     *     customer can never set their own price.
     *   - DiscountPct is always 0 — discounting only happens later, when
     *     Marketing reviews the enquiry (Step 3 of the O2C flow).
     */
    public function storeBulk(Request $request)
    {
        $caller = $request->user();

        if (!$caller || $caller->role !== 'customer') {
            return response()->json(['message' => 'This endpoint is for customer cart checkout only.'], 403);
        }

        $customer = Customer::where('UserId', $caller->id)->first();
        if (!$customer) {
            return response()->json(['message' => 'No customer profile is linked to this account.'], 422);
        }
        if ($customer->Status !== 'approved') {
            return response()->json(['message' => 'Your account is not yet approved to place orders.'], 403);
        }

        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.productId' => 'required|integer|exists:Products,Id',
            'items.*.qty' => 'required|integer|min:1',
            'items.*.color' => 'nullable|string|max:100',
            'items.*.size' => 'nullable|string|max:50',
            'deliveryDate' => 'nullable|date',
            'notes' => 'nullable|string',
        ]);

        $cartRef = 'CART-' . now()->format('YmdHis') . '-' . $customer->Id;

        $orders = DB::transaction(function () use ($validated, $customer, $caller, $cartRef) {
            $created = [];
            foreach ($validated['items'] as $item) {
                $product = Product::find($item['productId']);
                if (!$product || $product->Status !== 'active') {
                    continue; // skip anything that vanished / went inactive mid-checkout
                }

                $qty = (int) $item['qty'];
                $pricePerUnit = (float) $product->Price;
                $totalAmount = round($qty * $pricePerUnit, 2);

                $orderDetails = ['GroupRef' => $cartRef];
                if (!empty($item['color']))
                    $orderDetails['Color'] = $item['color'];
                if (!empty($item['size']))
                    $orderDetails['Size'] = $item['size'];

                $created[] = Order::create([
                    'Code' => $this->generateOrderCode(),
                    'CustomerId' => $customer->Id,
                    'ProductId' => $product->Id,
                    'Category' => $product->Category,
                    'SubType' => $product->SubType,
                    'Quantity' => $qty,
                    'PricePerUnit' => $pricePerUnit,
                    'DiscountPct' => 0,
                    'TotalAmount' => $totalAmount,
                    'Status' => 'pending',
                    'PaymentStatus' => 'unpaid',
                    'DeliveryDate' => $validated['deliveryDate'] ?? null,
                    'Notes' => $validated['notes'] ?? null,
                    'CreatedBy' => $caller->id,
                    // Plain array — the model's 'array' cast encodes it for us.
                    'OrderDetails' => $orderDetails,
                ]);
            }
            return $created;
        });

        if (empty($orders)) {
            return response()->json(['message' => 'None of the items in your cart are available anymore.'], 422);
        }

        return response()->json([
            'message' => count($orders) . ' item(s) submitted as an enquiry.',
            'orders' => collect($orders)->map(fn($o) => $o->load(['customer', 'product'])),
        ], 201);
    }

    /** PUT /api/orders/{id} */
    public function update(Request $request, $id)
    {
        $order = Order::find($id);

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $validated = $request->validate([
            'qty' => 'sometimes|required|integer|min:1',
            'pricePerUnit' => 'sometimes|required|numeric|min:0',
            'discount' => 'nullable|numeric|min:0|max:100',
            'status' => 'sometimes|required|in:approved,pending,assigned,processing,dispatched,delivered,declined',
            'paymentStatus' => 'sometimes|required|in:paid,unpaid,partial,refund',
            'deliveryDate' => 'nullable|date',
            'notes' => 'nullable|string',
            'orderDetails' => 'nullable|array',   // ← product-specific fields
        ]);

        $caller = $request->user();

        // Same final-approval gate as updateStatus() — this generic PUT is
        // also how Add Order finalizes a placed enquiry, so it needs the
        // same Marketing Head (system_admin) restriction.
        if (($validated['status'] ?? null) === 'approved' && (!$caller || $caller->role !== 'system_admin')) {
            return response()->json([
                'message' => 'Only the Marketing Head (System Admin) can give final approval on a sales order.',
            ], 403);
        }

        // ERP hand-off (O2C Step 4, "Transfer to ERP") is a Marketing Head
        // / System Admin-only action — Marketing can review and allocate,
        // but pushing the approved Sales Order into ERP is reserved for
        // System Admin, matching the Final Approval screen in the O2C scope.
        if (isset($validated['orderDetails']['ErpSynced']) && $validated['orderDetails']['ErpSynced']) {
            if (!$caller || $caller->role !== 'system_admin') {
                return response()->json([
                    'message' => 'Only the System Admin can transfer an approved order to ERP.',
                ], 403);
            }
            if ($order->Status !== 'approved') {
                return response()->json([
                    'message' => 'Only an approved order can be transferred to ERP.',
                ], 422);
            }
        }

        $qty = $validated['qty'] ?? $order->Quantity;
        $pricePerUnit = $validated['pricePerUnit'] ?? $order->PricePerUnit;
        $discountPct = $validated['discount'] ?? $order->DiscountPct;

        $update = [
            'Quantity' => $qty,
            'PricePerUnit' => $pricePerUnit,
            'DiscountPct' => $discountPct,
            'TotalAmount' => round($qty * $pricePerUnit * (1 - $discountPct / 100), 2),
        ];

        if (isset($validated['status'])) {
            $update['Status'] = $validated['status'];
            if ($validated['status'] === 'approved') {
                $update['ApprovedBy'] = $request->user()->id;
            }
        }

        if (isset($validated['paymentStatus'])) {
            $wasPaid = $order->PaymentStatus === 'paid';
            $willBePaid = $validated['paymentStatus'] === 'paid';

            $update['PaymentStatus'] = $validated['paymentStatus'];

            // Keep AmountPaid and the customer's Outstanding balance in
            // sync with a manual status override, same as recordPayment()
            // does for an incremental payment.
            if ($willBePaid && !$wasPaid) {
                $already = (float) ($order->AmountPaid ?? 0);
                $remaining = round((float) $order->TotalAmount - $already, 2);
                $update['AmountPaid'] = $order->TotalAmount;
                if ($remaining > 0 && $order->customer) {
                    $order->customer->decrement('Outstanding', $remaining);
                }
            } elseif (!$willBePaid && $wasPaid) {
                $update['AmountPaid'] = 0;
                if ($order->customer) {
                    $order->customer->increment('Outstanding', (float) $order->TotalAmount);
                }
            }
        }

        if (array_key_exists('deliveryDate', $validated)) {
            $update['DeliveryDate'] = $validated['deliveryDate'];
        }

        if (array_key_exists('notes', $validated)) {
            $update['Notes'] = $validated['notes'];
        }

        if (array_key_exists('orderDetails', $validated)) {
            // Plain array (or null) — the model's 'array' cast encodes it.
            $update['OrderDetails'] = $validated['orderDetails'] ?: null;
        }

        $order->update($update);

        return response()->json($order->load(['customer', 'product']));
    }

    /** DELETE /api/orders/{id} */
    public function destroy($id)
    {
        $order = Order::find($id);

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $order->delete();

        return response()->json(['message' => 'Order deleted']);
    }

    /** PATCH /api/orders/{id}/status */
    /**
     * PATCH /api/orders/{id}/assign
     *
     * Order Enquiry step 1: before anyone can approve a freshly-submitted
     * enquiry (Status = 'pending'), it has to be assigned to whoever is
     * going to handle it — usually the caller themselves ("Assign to me").
     * Admin / System Admin can also hand it to a specific staff member by
     * passing assignedTo explicitly. Only valid starting from 'pending' —
     * an enquiry that's already assigned/approved doesn't get reassigned
     * from this screen (avoids two people fighting over the same order).
     */
    public function assign(Request $request, $id)
    {
        $order = Order::find($id);

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $caller = $request->user();
        $allowedRoles = ['admin', 'system_admin', 'end_user'];
        if (!$caller || !in_array($caller->role, $allowedRoles, true)) {
            return response()->json(['message' => 'Not permitted to assign enquiries.'], 403);
        }

        if ($order->Status !== 'pending') {
            return response()->json(['message' => "Only a pending enquiry can be assigned (this one is '{$order->Status}')."], 422);
        }

        $validated = $request->validate([
            'assignedTo' => 'nullable|integer|exists:users,id',
        ]);

        $order->update([
            'Status' => 'assigned',
            'AssignedTo' => $validated['assignedTo'] ?? $caller->id,
            'AssignedAt' => now(),
        ]);

        return response()->json($order->load(['customer', 'product', 'assignee']));
    }

    public function updateStatus(Request $request, $id)
    {
        $order = Order::find($id);

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $validated = $request->validate([
            'status' => 'required|in:pending,assigned,approved,processing,dispatched,delivered,declined',
        ]);

        // O2C Step 4 — "Inquiry approval and SO creation in ERP": Marketing
        // (admin) reviews/allocates and places the enquiry, but the FINAL
        // approval that turns it into a real Sales Order is reserved for
        // the Marketing Head, modelled here as the 'system_admin' role.
        // Until this gate, the enquiry sits in the Marketing Head's
        // "Pending Final Approvals" queue (see OrderEnquiry.jsx).
        $caller = $request->user();
        if ($validated['status'] === 'approved' && (!$caller || $caller->role !== 'system_admin')) {
            return response()->json([
                'message' => 'Only the Marketing Head (System Admin) can give final approval on a sales order.',
            ], 403);
        }

        // Goods must actually be dispatched (LR number recorded via the
        // dedicated /dispatch endpoint) before they can be marked delivered.
        if ($validated['status'] === 'delivered' && $order->Status !== 'dispatched') {
            return response()->json(['message' => 'Order must be dispatched (with an LR number) before it can be marked delivered.'], 422);
        }

        $update = ['Status' => $validated['status']];

        if ($validated['status'] === 'approved') {
            $update['ApprovedBy'] = $caller->id;
        }

        $order->update($update);

        if ($validated['status'] === 'approved') {
            $this->notifyCustomer(
                $order,
                'order_approved',
                'Your order has been approved',
                "Order {$order->Code} has been approved and will move to dispatch."
            );
        }
        if ($validated['status'] === 'declined') {
            $this->notifyCustomer(
                $order,
                'order_declined',
                'Your order was declined',
                "Order {$order->Code} was declined." . ($order->RejectionReason ? " Reason: {$order->RejectionReason}" : '')
            );
        }

        return response()->json($order->load(['customer', 'product']));
    }

    /**
     * PATCH /api/orders/{id}/reject
     * Body: { reason }
     *
     * Explicit reject action (O2C Step 4/6 — "If PO Approve/Rejected an
     * information triggered to customer") — separate from the generic
     * updateStatus() so a reason is always required and the customer is
     * always notified, matching the flow diagram.
     */
    public function reject(Request $request, $id)
    {
        $order = Order::find($id);
        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $caller = $request->user();
        if (!$caller || !in_array($caller->role, ['admin', 'system_admin', 'end_user'], true)) {
            return response()->json(['message' => 'Not permitted to reject enquiries.'], 403);
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:255',
        ]);

        $order->update([
            'Status' => 'declined',
            'RejectionReason' => $validated['reason'],
        ]);

        $this->notifyCustomer(
            $order,
            'order_declined',
            'Your order was declined',
            "Order {$order->Code} was declined. Reason: {$validated['reason']}"
        );

        return response()->json($order->load(['customer', 'product']));
    }

    /**
     * PATCH /api/orders/{id}/dispatch
     *
     * Goods Dispatch (O2C Step 7): packing team hands the order to
     * transport. Records the LR number + transport name and flips Status
     * to 'dispatched'. Only allowed from 'approved' or 'processing'.
     */
    public function dispatch(Request $request, $id)
    {
        if ($request->user() && $request->user()->role === 'customer') {
            return response()->json(['message' => 'Not permitted.'], 403);
        }

        $order = Order::find($id);

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        if (!in_array($order->Status, ['approved', 'processing'], true)) {
            return response()->json(['message' => 'Only an approved / processing order can be dispatched.'], 422);
        }

        // Customer-wise Credit and Discount Validation (O2C Step 9) — must
        // pass before goods can leave. If it fails, the order goes on hold
        // instead of being dispatched; Marketing has to explicitly release
        // the hold (see releaseHold()) to proceed, which is itself the
        // audit trail of that review.
        if ($holdReason = $this->creditHoldReason($order)) {
            $order->update(['OnHold' => true, 'HoldReason' => $holdReason, 'HoldPlacedAt' => now()]);
            return response()->json([
                'message' => 'Order held for credit/discount review, not dispatched.',
                'holdReason' => $holdReason,
                'order' => $order->fresh(['customer', 'product']),
            ], 422);
        }

        $validated = $request->validate([
            'lrNumber' => 'required|string|max:100',
            'transportName' => 'required|string|max:150',
            'dispatchedAt' => 'nullable|date',
        ]);

        $dispatchedAt = $validated['dispatchedAt'] ?? now();

        $order->update([
            'Status' => 'dispatched',
            'OnHold' => false,
            'LRNumber' => $validated['lrNumber'],
            'TransportName' => $validated['transportName'],
            'DispatchedAt' => $dispatchedAt,
            'DispatchedBy' => $request->user()->id,
            'WarehouseSource' => $order->product->warehouse ?? null,
            // Bill's payment clock starts at dispatch — default credit
            // term (15 days unless already customized) counts from here.
            // Never overwrite a due date someone has already manually set.
            'PaymentDueDate' => $order->PaymentDueDate
                ?? \Carbon\Carbon::parse($dispatchedAt)->addDays((int) ($order->PaymentTermDays ?? 15))->toDateString(),
        ]);

        // The bill is now actually owed — this is the moment it counts
        // against the customer's credit limit (creditHoldReason() checks
        // Outstanding + a *new* order's total, so Outstanding has to
        // reflect bills that are already out the door).
        if ($order->customer && $order->PaymentStatus !== 'paid') {
            $order->customer->increment('Outstanding', (float) $order->TotalAmount);
        }

        $this->notifyCustomer(
            $order,
            'order_dispatched',
            'Your order has been dispatched',
            "Order {$order->Code} has been dispatched via {$validated['transportName']} (LR: {$validated['lrNumber']})."
        );

        return response()->json($order->load(['customer', 'product', 'dispatcher']));
    }

    /**
     * PATCH /api/orders/{id}/release-hold
     * Body: { note? }
     *
     * Marketing/System Admin explicitly clears a credit/discount hold
     * (e.g. after the customer pays down their overdue balance, or a
     * manager approves an exception) so the order can be dispatched.
     */
    public function releaseHold(Request $request, $id)
    {
        $order = Order::find($id);
        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $caller = $request->user();
        if (!$caller || !in_array($caller->role, ['admin', 'system_admin'], true)) {
            return response()->json(['message' => 'Not permitted to release a hold.'], 403);
        }

        $validated = $request->validate(['note' => 'nullable|string|max:255']);

        $order->update([
            'OnHold' => false,
            'HoldReason' => trim(($order->HoldReason ?? '') . ' — released' . (!empty($validated['note']) ? ": {$validated['note']}" : '')),
        ]);

        return response()->json($order->fresh(['customer', 'product']));
    }

    /**
     * Returns a hold reason string if this order's customer fails credit
     * limit, overdue-balance, or discount-policy checks — null if clear.
     */
    private function creditHoldReason(Order $order): ?string
    {
        $customer = $order->customer;
        if (!$customer)
            return null;

        $reasons = [];

        if ($customer->CreditLimit !== null) {
            $projected = (float) $customer->Outstanding + (float) $order->TotalAmount;
            if ($projected > (float) $customer->CreditLimit) {
                $reasons[] = sprintf(
                    'Credit limit exceeded: outstanding %.2f + this order %.2f > limit %.2f',
                    (float) $customer->Outstanding,
                    (float) $order->TotalAmount,
                    (float) $customer->CreditLimit
                );
            }
        }

        $hasOverdue = Order::where('CustomerId', $customer->Id)
            ->where('Id', '!=', $order->Id)
            ->whereNotNull('PaymentDueDate')
            ->where('PaymentDueDate', '<', now()->toDateString())
            ->where('PaymentStatus', '!=', 'paid')
            ->exists();
        if ($hasOverdue) {
            $reasons[] = 'Customer has an overdue, unpaid bill on a previous order.';
        }

        if ($customer->MaxDiscountPct !== null && (float) $order->DiscountPct > (float) $customer->MaxDiscountPct) {
            $reasons[] = sprintf(
                'Discount %.2f%% exceeds this customer\'s approved policy of %.2f%%',
                (float) $order->DiscountPct,
                (float) $customer->MaxDiscountPct
            );
        }

        return empty($reasons) ? null : implode(' | ', $reasons);
    }

    /** Fire-and-forget in-app notification to the customer who owns this order. */
    private function notifyCustomer(Order $order, string $type, string $title, string $message): void
    {
        $customer = $order->customer ?? $order->load('customer')->customer;
        $userId = $customer->UserId ?? null;
        if ($userId) {
            AppNotification::send($userId, $type, $title, $message, $order->Id);
        }
    }

    /**
     * PATCH /api/orders/{id}/payment-due
     *
     * Manually reassign a bill's payment due date — e.g. a customer asks
     * for more time. Callable by Admin, System Admin, Super Admin, or the
     * End User (Field Officer) who owns/created the order, per the
     * business rule that the time limit is "assigned by specific (end
     * user, admin)". Accepts either an explicit new date or a fresh term
     * length in days from today.
     */
    public function updatePaymentDue(Request $request, $id)
    {
        $order = Order::find($id);

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $caller = $request->user();
        $allowedRoles = ['admin', 'system_admin', 'super_admin', 'end_user'];
        if (!$caller || !in_array($caller->role, $allowedRoles, true)) {
            return response()->json(['message' => 'Not permitted to change the payment due date.'], 403);
        }

        $validated = $request->validate([
            'paymentDueDate' => 'nullable|date',
            'paymentTermDays' => 'nullable|integer|min:1|max:365',
            'note' => 'nullable|string|max:255',
        ]);

        if (empty($validated['paymentDueDate']) && empty($validated['paymentTermDays'])) {
            return response()->json(['message' => 'Provide either a new due date or a new term length in days.'], 422);
        }

        $update = [
            'PaymentDueDateSetBy' => $caller->id,
            'PaymentDueDateNote' => $validated['note'] ?? null,
        ];

        if (!empty($validated['paymentTermDays'])) {
            $update['PaymentTermDays'] = $validated['paymentTermDays'];
            $from = $order->DispatchedAt ?? now();
            $update['PaymentDueDate'] = \Carbon\Carbon::parse($from)->addDays((int) $validated['paymentTermDays'])->toDateString();
        }

        if (!empty($validated['paymentDueDate'])) {
            $update['PaymentDueDate'] = $validated['paymentDueDate'];
        }

        $order->update($update);

        return response()->json($order->load(['customer', 'product', 'dueDateSetter']));
    }

    /**
     * PATCH /api/orders/{id}/record-payment
     * Body: { amount, note? }
     *
     * Credit Limit feature — records a (possibly partial) payment against
     * a billed order. A ₹1,00,000 order paid down by ₹50,000 becomes
     * PaymentStatus 'partial' with a ₹50,000 balance still due against
     * the same PaymentDueDate; the customer's Outstanding balance drops
     * by the amount paid so the credit-limit check on their next order
     * reflects it.
     */
    public function recordPayment(Request $request, $id)
    {
        $order = Order::find($id);
        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $caller = $request->user();
        if (!$caller || !in_array($caller->role, ['admin', 'system_admin'], true)) {
            return response()->json(['message' => 'Not permitted to record a payment.'], 403);
        }

        if (!in_array($order->Status, ['dispatched', 'delivered'], true)) {
            return response()->json(['message' => 'Only a dispatched/delivered (billed) order can take a payment.'], 422);
        }

        $balanceDue = round((float) $order->TotalAmount - (float) ($order->AmountPaid ?? 0), 2);

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01', 'max:' . max($balanceDue, 0.01)],
            'note' => 'nullable|string|max:255',
        ]);

        $amount = round((float) $validated['amount'], 2);
        $newAmountPaid = round((float) ($order->AmountPaid ?? 0) + $amount, 2);
        $newStatus = $newAmountPaid >= (float) $order->TotalAmount ? 'paid' : 'partial';

        $order->update([
            'AmountPaid' => $newAmountPaid,
            'PaymentStatus' => $newStatus,
        ]);

        if ($order->customer) {
            $order->customer->decrement('Outstanding', $amount);
        }

        return response()->json($order->fresh(['customer', 'product']));
    }

    private function generateOrderCode(): string
    {
        $last = Order::orderByDesc('Id')->first();
        $nextNumber = $last ? ((int) Str::after($last->Code, 'ORD-')) + 1 : 1001;

        return 'ORD-' . $nextNumber;
    }

    /**
     * Normalise a caller's own assigned District/Taluk (from their linked
     * Employee record, falling back to the User row) into a clean array.
     * Mirrors CustomerController::callerAreas().
     */
    private function callerAreas($caller, string $field): array
    {
        $employee = Employee::where('UserId', $caller->id)->first();
        $value = $employee->{$field} ?? $caller->{$field} ?? null;

        if (is_array($value)) {
            return array_values(array_filter($value, fn($v) => $v !== null && $v !== ''));
        }
        if (is_string($value) && $value !== '') {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return array_values(array_filter($decoded, fn($v) => $v !== null && $v !== ''));
            }
            return [$value];
        }
        return [];
    }
}