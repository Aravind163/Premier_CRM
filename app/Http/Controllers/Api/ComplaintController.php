<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ComplaintController extends Controller
{
    // GET /api/complaints
    // Scoped by who's asking:
    //   - customer    : only their own complaints
    //   - end_user    : complaints from customers in their assigned Taluk(s)
    //   - admin       : complaints from customers in their assigned District(s)
    //   - system/super admin : unscoped (all complaints)
    public function index(Request $request)
    {
        $caller = $request->user();
        $query = Complaint::with(['order', 'customer']);

        if ($caller && $caller->role === 'customer') {
            $customer = Customer::where('UserId', $caller->id)->first();
            $query->where('CustomerId', $customer->Id ?? 0);
        } elseif ($caller && $caller->role === 'end_user') {
            $taluks = $this->callerAreas($caller, 'Taluk');
            $customerIds = Customer::whereIn('Taluk', $taluks)->pluck('Id');
            $query->whereIn('CustomerId', $customerIds->isEmpty() ? [0] : $customerIds);
        } elseif ($caller && $caller->role === 'admin') {
            $districts = $this->callerAreas($caller, 'District');
            $customerIds = Customer::whereIn('District', $districts)->pluck('Id');
            $query->whereIn('CustomerId', $customerIds->isEmpty() ? [0] : $customerIds);
        }
        // system_admin / super_admin: no extra scoping — see everything.

        $complaints = $query->orderByDesc('CreatedAt')->get();

        return response()->json($complaints);
    }

    /**
     * PATCH /api/complaints/{id}/resolve
     * Body: { resolutionType: settlement|replacement|credit_note|rejected, resolution, creditNoteAmount? }
     *
     * Claim Process (O2C Step 14): Marketing/System Admin reviews a
     * complaint and closes it out. Notifies the customer either way.
     */
    public function resolve(Request $request, $id)
    {
        $caller = $request->user();
        if (!$caller || !in_array($caller->role, ['admin', 'system_admin', 'super_admin'], true)) {
            return response()->json(['message' => 'Not permitted to resolve claims.'], 403);
        }
        if ($caller->role === 'super_admin') {
            return response()->json(['message' => 'Super Admin is read-only.'], 403);
        }

        $complaint = Complaint::with('customer.user')->find($id);
        if (!$complaint) {
            return response()->json(['message' => 'Complaint not found.'], 404);
        }

        $validated = $request->validate([
            'resolutionType'   => ['required', Rule::in(['settlement', 'replacement', 'credit_note', 'rejected'])],
            'resolution'       => 'required|string|max:1000',
            'creditNoteAmount' => 'nullable|numeric|min:0',
        ]);

        $complaint->update([
            'Status'           => $validated['resolutionType'] === 'rejected' ? 'Rejected' : 'Resolved',
            'ResolutionType'   => $validated['resolutionType'],
            'Resolution'       => $validated['resolution'],
            'CreditNoteAmount' => $validated['resolutionType'] === 'credit_note' ? ($validated['creditNoteAmount'] ?? 0) : null,
            'ResolvedBy'       => $caller->id,
            'ResolvedAt'       => now(),
        ]);

        // If a credit note was issued, reduce the customer's Outstanding
        // balance by that amount — ties the claim back into the credit
        // picture used by the compliance dashboard / dispatch hold check.
        if ($validated['resolutionType'] === 'credit_note' && !empty($validated['creditNoteAmount'])) {
            $customer = $complaint->customer;
            if ($customer) {
                $customer->decrement('Outstanding', (float) $validated['creditNoteAmount']);
            }
        }

        $customerUserId = $complaint->customer->UserId ?? null;
        if ($customerUserId) {
            $labels = [
                'settlement'  => 'settled',
                'replacement' => 'approved for replacement',
                'credit_note' => 'resolved with a credit note',
                'rejected'    => 'reviewed and closed (not upheld)',
            ];
            AppNotification::send(
                $customerUserId,
                'complaint_resolved',
                'Your complaint has been ' . $labels[$validated['resolutionType']],
                $validated['resolution'],
                $complaint->OrderId
            );
        }

        return response()->json($complaint->fresh(['order', 'customer']));
    }

    /**
     * Normalise a caller's own assigned District/Taluk (from their linked
     * Employee record, falling back to the User row) into a clean array.
     * Mirrors OrderController::callerAreas() / CustomerController::callerAreas().
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

    // POST /api/complaints
    // Body: { orderId, type, description }
    public function store(Request $request)
    {
        $data = $request->validate([
            'orderId'     => 'required|integer',
            'type'        => 'required|string|max:100',
            'description' => 'required|string|max:2000',
        ]);

        $customer = Customer::where('UserId', $request->user()->id)->first();
        $customerId = $customer->Id ?? 0;

        // Make sure the order being complained about actually belongs to
        // this customer — otherwise someone could raise a complaint
        // against another customer's order by guessing an id.
        $order = Order::where('Id', $data['orderId'])
            ->where('CustomerId', $customerId)
            ->first();

        if (!$order) {
            return response()->json(['message' => 'Order not found.'], 404);
        }

        $complaint = Complaint::create([
            'OrderId'     => $order->Id,
            'CustomerId'  => $customerId,
            'Type'        => $data['type'],
            'Description' => $data['description'],
            'Status'      => 'Open',
        ]);

        $complaint->load('order');

        return response()->json([
            'message'   => 'Complaint submitted. Our team will get back to you shortly.',
            'complaint' => $complaint,
        ], 201);
    }
}