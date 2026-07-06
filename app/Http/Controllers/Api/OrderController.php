<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
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
        $query = Order::with(['customer', 'product']);
        $caller = $request->user();

        if ($status = $request->query('status')) {
            $query->where('Status', $status);
        }

        if ($paymentStatus = $request->query('payment_status')) {
            $query->where('PaymentStatus', $paymentStatus);
        }

        if ($category = $request->query('category')) {
            $query->where('Category', $category);
        }

        // End Users only ever see orders they personally created — not the
        // full district/company order list.
        if ($caller && $caller->role === 'end_user') {
            $query->where('CreatedBy', $caller->id);
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
        $order = Order::with(['customer', 'product'])->find($id);

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
            'customerId'   => 'required|integer|exists:Customers,Id',
            'productId'    => 'required|integer|exists:Products,Id',
            'qty'          => 'required|integer|min:1',
            'pricePerUnit' => 'required|numeric|min:0',
            'discount'     => 'nullable|numeric|min:0|max:100',
            'deliveryDate' => 'nullable|date',
            'notes'        => 'nullable|string',
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

        $qty          = (float) $validated['qty'];
        $pricePerUnit = (float) $validated['pricePerUnit'];
        $discountPct  = (float) ($validated['discount'] ?? 0);
        $totalAmount  = round($qty * $pricePerUnit * (1 - $discountPct / 100), 2);

        $order = Order::create([
            'Code'          => $this->generateOrderCode(),
            'CustomerId'    => $validated['customerId'],
            'ProductId'     => $validated['productId'],
            'Category'      => $product->Category,
            'SubType'       => $product->SubType,
            'Quantity'      => $validated['qty'],
            'PricePerUnit'  => $pricePerUnit,
            'DiscountPct'   => $discountPct,
            'TotalAmount'   => $totalAmount,
            'Status'        => 'pending',
            'PaymentStatus' => 'unpaid',
            'DeliveryDate'  => $validated['deliveryDate'] ?? null,
            'Notes'         => $validated['notes'] ?? null,
            'CreatedBy'     => $request->user()->id,
            // NOTE: OrderDetails is cast as 'array' on the Order model, so
            // Eloquent handles the JSON encode/decode itself — pass the
            // plain array (or null), never a pre-encoded JSON string here.
            'OrderDetails'  => $validated['orderDetails'] ?? null,
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
            'items'              => 'required|array|min:1',
            'items.*.productId'  => 'required|integer|exists:Products,Id',
            'items.*.qty'        => 'required|integer|min:1',
            'items.*.color'      => 'nullable|string|max:100',
            'items.*.size'       => 'nullable|string|max:50',
            'deliveryDate'       => 'nullable|date',
            'notes'              => 'nullable|string',
        ]);

        $cartRef = 'CART-' . now()->format('YmdHis') . '-' . $customer->Id;

        $orders = DB::transaction(function () use ($validated, $customer, $caller, $cartRef) {
            $created = [];
            foreach ($validated['items'] as $item) {
                $product = Product::find($item['productId']);
                if (!$product || $product->Status !== 'active') {
                    continue; // skip anything that vanished / went inactive mid-checkout
                }

                $qty          = (int) $item['qty'];
                $pricePerUnit = (float) $product->Price;
                $totalAmount  = round($qty * $pricePerUnit, 2);

                $orderDetails = ['CartRef' => $cartRef];
                if (!empty($item['color'])) $orderDetails['Color'] = $item['color'];
                if (!empty($item['size']))  $orderDetails['Size']  = $item['size'];

                $created[] = Order::create([
                    'Code'          => $this->generateOrderCode(),
                    'CustomerId'    => $customer->Id,
                    'ProductId'     => $product->Id,
                    'Category'      => $product->Category,
                    'SubType'       => $product->SubType,
                    'Quantity'      => $qty,
                    'PricePerUnit'  => $pricePerUnit,
                    'DiscountPct'   => 0,
                    'TotalAmount'   => $totalAmount,
                    'Status'        => 'pending',
                    'PaymentStatus' => 'unpaid',
                    'DeliveryDate'  => $validated['deliveryDate'] ?? null,
                    'Notes'         => $validated['notes'] ?? null,
                    'CreatedBy'     => $caller->id,
                    // Plain array — the model's 'array' cast encodes it for us.
                    'OrderDetails'  => $orderDetails,
                ]);
            }
            return $created;
        });

        if (empty($orders)) {
            return response()->json(['message' => 'None of the items in your cart are available anymore.'], 422);
        }

        return response()->json([
            'message' => count($orders) . ' item(s) submitted as an enquiry.',
            'orders'  => collect($orders)->map(fn ($o) => $o->load(['customer', 'product'])),
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
            'qty'           => 'sometimes|required|integer|min:1',
            'pricePerUnit'  => 'sometimes|required|numeric|min:0',
            'discount'      => 'nullable|numeric|min:0|max:100',
            'status'        => 'sometimes|required|in:approved,pending,processing,dispatched,delivered,declined',
            'paymentStatus' => 'sometimes|required|in:paid,unpaid,partial,refund',
            'deliveryDate'  => 'nullable|date',
            'notes'         => 'nullable|string',
            'orderDetails'  => 'nullable|array',   // ← product-specific fields
        ]);

        $qty          = $validated['qty']          ?? $order->Quantity;
        $pricePerUnit = $validated['pricePerUnit'] ?? $order->PricePerUnit;
        $discountPct  = $validated['discount']     ?? $order->DiscountPct;

        $update = [
            'Quantity'     => $qty,
            'PricePerUnit' => $pricePerUnit,
            'DiscountPct'  => $discountPct,
            'TotalAmount'  => round($qty * $pricePerUnit * (1 - $discountPct / 100), 2),
        ];

        if (isset($validated['status'])) {
            $update['Status'] = $validated['status'];
            if ($validated['status'] === 'approved') {
                $update['ApprovedBy'] = $request->user()->id;
            }
        }

        if (isset($validated['paymentStatus'])) {
            $update['PaymentStatus'] = $validated['paymentStatus'];
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
    public function updateStatus(Request $request, $id)
    {
        $order = Order::find($id);

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $validated = $request->validate([
            'status' => 'required|in:approved,pending,processing,dispatched,delivered,declined',
        ]);

        // Goods must actually be dispatched (LR number recorded via the
        // dedicated /dispatch endpoint) before they can be marked delivered.
        if ($validated['status'] === 'delivered' && $order->Status !== 'dispatched') {
            return response()->json(['message' => 'Order must be dispatched (with an LR number) before it can be marked delivered.'], 422);
        }

        $update = ['Status' => $validated['status']];

        if ($validated['status'] === 'approved') {
            $update['ApprovedBy'] = $request->user()->id;
        }

        $order->update($update);

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

        $validated = $request->validate([
            'lrNumber'      => 'required|string|max:100',
            'transportName' => 'required|string|max:150',
            'dispatchedAt'  => 'nullable|date',
        ]);

        $order->update([
            'Status'        => 'dispatched',
            'LRNumber'      => $validated['lrNumber'],
            'TransportName' => $validated['transportName'],
            'DispatchedAt'  => $validated['dispatchedAt'] ?? now(),
            'DispatchedBy'  => $request->user()->id,
        ]);

        return response()->json($order->load(['customer', 'product', 'dispatcher']));
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