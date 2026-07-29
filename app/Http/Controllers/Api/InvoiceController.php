<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Invoice;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class InvoiceController extends Controller
{
    /** GET /api/invoices — scoped like Orders (End User: own Taluk, Admin: own District). */
    public function index(Request $request)
    {
        $caller = $request->user();
        if (!$caller || $caller->role === 'customer') {
            return $this->customerIndex($request);
        }

        $query = Invoice::with(['order', 'customer']);

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

        return response()->json($query->orderByDesc('Id')->get());
    }

    /** Customers see only their own invoices. */
    private function customerIndex(Request $request)
    {
        $customer = Customer::where('UserId', $request->user()->id)->first();
        $invoices = Invoice::with('order')
            ->where('CustomerId', $customer->Id ?? 0)
            ->orderByDesc('Id')
            ->get();
        return response()->json($invoices);
    }

    /**
     * GET /api/invoices/eligible-orders
     *
     * Dispatched orders that don't have an invoice yet — the worklist for
     * "Invoice creation against allocation".
     */
    public function eligibleOrders(Request $request)
    {
        $this->authorizeStaff($request);

        $orders = Order::with(['customer', 'product'])
            ->where('Status', 'dispatched')
            ->whereDoesntHave('invoice')
            ->orderByDesc('DispatchedAt')
            ->get();

        return response()->json($orders);
    }

    /**
     * POST /api/invoices
     * Body: { orderId }
     *
     * Generates an invoice against a dispatched order — amount comes
     * straight from the order (which itself was built from the allocated
     * quantity/price), matching "Invoice creation against allocation".
     */
    public function store(Request $request)
    {
        $this->authorizeStaff($request);

        $validated = $request->validate([
            'orderId' => 'required|integer|exists:Orders,Id',
        ]);

        $order = Order::find($validated['orderId']);

        if ($order->Status !== 'dispatched') {
            return response()->json(['message' => 'Only a dispatched order can be invoiced.'], 422);
        }
        if ($order->invoice) {
            return response()->json(['message' => 'This order already has an invoice.', 'invoice' => $order->invoice], 422);
        }

        $subTotal = round((float) $order->Quantity * (float) $order->PricePerUnit, 2);
        $discountAmount = round($subTotal * ((float) $order->DiscountPct / 100), 2);
        $total = round($subTotal - $discountAmount, 2);

        $invoice = Invoice::create([
            'InvoiceNumber'   => $this->generateInvoiceNumber(),
            'OrderId'         => $order->Id,
            'CustomerId'      => $order->CustomerId,
            'SubTotal'        => $subTotal,
            'DiscountAmount'  => $discountAmount,
            'TotalAmount'     => $total,
            'Status'          => 'issued',
            'IssuedBy'        => $request->user()->id,
            'IssuedAt'        => now(),
        ]);

        return response()->json($invoice->load(['order', 'customer']), 201);
    }

    /** PATCH /api/invoices/{id}/status — mark paid / cancelled. */
    public function updateStatus(Request $request, $id)
    {
        $this->authorizeStaff($request);

        $invoice = Invoice::find($id);
        if (!$invoice) {
            return response()->json(['message' => 'Invoice not found.'], 404);
        }

        $validated = $request->validate([
            'status' => 'required|in:issued,paid,cancelled',
        ]);

        $invoice->update(['Status' => $validated['status']]);

        return response()->json($invoice->load(['order', 'customer']));
    }

    private function generateInvoiceNumber(): string
    {
        $last = Invoice::orderByDesc('Id')->first();
        $next = $last ? ((int) Str::afterLast($last->InvoiceNumber, '-')) + 1 : 5001;
        return 'INV-' . now()->format('Y') . '-' . $next;
    }

    private function authorizeStaff(Request $request): void
    {
        $role = $request->user()->role ?? null;
        abort_unless(in_array($role, ['admin', 'system_admin', 'super_admin'], true), 403, 'Not permitted.');
        if (!$request->isMethod('get')) {
            abort_if($role === 'super_admin', 403, 'Super Admin is read-only.');
        }
    }

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
