<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ComplaintController extends Controller
{
    // GET /api/complaints
    // Returns the logged-in customer's complaints, most recent first,
    // with the related order eager-loaded so the frontend can show the
    // order code without a second round trip.
    public function index(Request $request)
    {
        $customer = Customer::where('UserId', $request->user()->id)->first();

        $complaints = Complaint::with('order')
            ->where('CustomerId', $customer->Id ?? 0)
            ->orderByDesc('CreatedAt')
            ->get();

        return response()->json($complaints);
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