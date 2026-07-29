<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Order;
use Illuminate\Http\Request;

class CreditLimitController extends Controller
{
    /**
     * GET /api/credit-limit
     *
     * One row per customer who currently has a billed (dispatched+),
     * not-yet-fully-paid order — their credit limit, running outstanding
     * balance, and every unpaid order with its own days-overdue count.
     * Scoped the same way Orders/Invoices are (End User: own Taluk,
     * Admin: own District, System/Super Admin: everything).
     *
     * Query params:
     *   overdueMin = 30 | 60 | 90  → only customers whose worst overdue
     *                                 order is at least that many days late
     */
    public function index(Request $request)
    {
        $caller = $request->user();
        if (!$caller || !in_array($caller->role, ['admin', 'system_admin', 'super_admin', 'end_user'], true)) {
            return response()->json(['message' => 'Not permitted.'], 403);
        }

        $customerQuery = Customer::query();
        if ($caller->role === 'end_user') {
            $taluks = $this->callerAreas($caller, 'Taluk');
            $customerQuery->whereIn('Taluk', $taluks->isEmpty() ? [''] : $taluks);
        }
        if ($caller->role === 'admin') {
            $districts = $this->callerAreas($caller, 'District');
            $customerQuery->whereIn('District', $districts->isEmpty() ? [''] : $districts);
        }

        $customerIds = $customerQuery->pluck('Id');

        $unpaidOrders = Order::with('customer')
            ->whereIn('CustomerId', $customerIds->isEmpty() ? [0] : $customerIds)
            ->whereIn('Status', ['dispatched', 'delivered'])
            ->where('PaymentStatus', '!=', 'paid')
            ->orderBy('PaymentDueDate')
            ->get();

        $byCustomer = [];
        foreach ($unpaidOrders as $o) {
            $cid = $o->CustomerId;
            if (!isset($byCustomer[$cid])) {
                $byCustomer[$cid] = [
                    'customerId'     => $cid,
                    'customerCode'   => $o->customer->Code ?? null,
                    'customerName'   => $o->customer->Name ?? '—',
                    'phone'          => $o->customer->Phone ?? null,
                    'district'       => $o->customer->District ?? null,
                    'taluk'          => $o->customer->Taluk ?? null,
                    'creditLimit'    => $o->customer->CreditLimit !== null ? (float) $o->customer->CreditLimit : null,
                    'outstanding'    => $o->customer->Outstanding !== null ? (float) $o->customer->Outstanding : 0,
                    'maxDaysOverdue' => 0,
                    'orders'         => [],
                ];
            }
            $byCustomer[$cid]['orders'][] = [
                'orderId'        => $o->Id,
                'code'           => $o->Code,
                'totalAmount'    => (float) $o->TotalAmount,
                'amountPaid'     => (float) ($o->AmountPaid ?? 0),
                'balanceDue'     => $o->balance_due,
                'paymentStatus'  => $o->PaymentStatus,
                'paymentDueDate' => $o->PaymentDueDate,
                'dispatchedAt'   => $o->DispatchedAt,
                'daysOverdue'    => $o->days_overdue,
                'isOverdue'      => $o->is_overdue,
            ];
            if ($o->days_overdue > $byCustomer[$cid]['maxDaysOverdue']) {
                $byCustomer[$cid]['maxDaysOverdue'] = $o->days_overdue;
            }
        }

        $rows = array_values($byCustomer);

        if ($overdueMin = $request->query('overdueMin')) {
            $min = (int) $overdueMin;
            $rows = array_values(array_filter($rows, fn ($r) => $r['maxDaysOverdue'] >= $min));
        }

        usort($rows, fn ($a, $b) => $b['maxDaysOverdue'] <=> $a['maxDaysOverdue']);

        return response()->json($rows);
    }

    private function callerAreas($caller, string $field)
    {
        $employee = Employee::where('UserId', $caller->id)->first();
        $value = $employee->{$field} ?? $caller->{$field} ?? null;

        if (is_array($value)) {
            return collect($value)->filter(fn ($v) => $v !== null && $v !== '')->values();
        }
        if (is_string($value) && $value !== '') {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return collect($decoded)->filter(fn ($v) => $v !== null && $v !== '')->values();
            }
            return collect([$value]);
        }
        return collect();
    }
}