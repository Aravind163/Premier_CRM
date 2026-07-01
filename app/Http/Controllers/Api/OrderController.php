<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Http\Request;
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
        // full district/company order list. Admins and System/Super Admins
        // see everything (no scoping) for now.
        if ($caller && $caller->role === 'end_user') {
            $query->where('CreatedBy', $caller->id);
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

    /** POST /api/orders */
    public function store(Request $request)
    {
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
            'OrderDetails'  => isset($validated['orderDetails'])   // ← save as JSON
                                ? json_encode($validated['orderDetails'])
                                : null,
        ]);

        return response()->json($order->load(['customer', 'product']), 201);
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
            'status'        => 'sometimes|required|in:approved,pending,processing,delivered,declined',
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
            $update['OrderDetails'] = $validated['orderDetails']
                ? json_encode($validated['orderDetails'])
                : null;
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
            'status' => 'required|in:approved,pending,processing,delivered,declined',
        ]);

        $update = ['Status' => $validated['status']];

        if ($validated['status'] === 'approved') {
            $update['ApprovedBy'] = $request->user()->id;
        }

        $order->update($update);

        return response()->json($order->load(['customer', 'product']));
    }

    private function generateOrderCode(): string
    {
        $last = Order::orderByDesc('Id')->first();
        $nextNumber = $last ? ((int) Str::after($last->Code, 'ORD-')) + 1 : 1001;

        return 'ORD-' . $nextNumber;
    }
}