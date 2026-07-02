<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CustomerController extends Controller
{
    /**
     * GET /api/customers
     *
     * Scoping: a `customer`-role user only ever sees their own record
     * (matched via Customers.UserId). Staff roles (super/system_admin,
     * admin, end_user) see the full list — unchanged from before.
     */
    public function index(Request $request)
    {
        $query = Customer::with('user');
        $caller = $request->user();

        if ($caller && $caller->role === 'customer') {
            $query->where('UserId', $caller->id);
        }

        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('Name', 'like', "%{$search}%")
                  ->orWhere('Code', 'like', "%{$search}%")
                  ->orWhere('Phone', 'like', "%{$search}%");
            });
        }

        if ($type = $request->query('type')) {
            $query->where('Type', $type);
        }

        if ($status = $request->query('status')) {
            $query->where('Status', $status);
        }

        return response()->json(
            $query->orderByDesc('Id')->get()
        );
    }

    /** GET /api/customers/{id} */
    public function show(Request $request, $id)
    {
        $customer = Customer::with('user')->find($id);

        if (!$customer) {
            return response()->json(['message' => 'Customer not found'], 404);
        }

        $caller = $request->user();
        if ($caller && $caller->role === 'customer' && $customer->UserId !== $caller->id) {
            return response()->json(['message' => 'You can only view your own account.'], 403);
        }

        return response()->json($customer);
    }

    /**
     * POST /api/customers
     *
     * Creates the Customer record AND a linked `users` row so the
     * customer can log in themselves — matching the admin/end_user
     * pattern (username = phone, password = dob), but for customers:
     *   - username = Shop Name (Customers.Name)
     *   - password = Phone number (Customers.Phone)
     * The linked account starts inactive (blocked from login) until
     * Marketing approves the customer via updateStatus().
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name'        => 'required|string|max:191',
            'phone'       => 'required|string|max:20',
            'email'       => 'nullable|email|max:191',
            'type'        => 'required|in:retail,wholesale',
            'district'    => 'required|string|max:100',
            'taluk'       => 'required|string|max:100',
            'address'     => 'nullable|string',
            'creditLimit' => 'nullable|numeric',
            'notes'       => 'nullable|string',
        ]);

        $user = User::create([
            'name'     => $validated['name'],
            'email'    => $validated['email'] ?? (Str::slug($validated['name']) . '-' . uniqid() . '@premiercrm.com'),
            'phone'    => $validated['phone'],
            'password' => $validated['phone'],
            'role'     => 'customer',
            'Status'   => 'inactive', // pending approval — login blocked until active
        ]);

        $customer = Customer::create([
            'Code'        => $this->generateCustomerCode(),
            'UserId'      => $user->id,
            'Name'        => $validated['name'],
            'Phone'       => $validated['phone'],
            'Email'       => $validated['email'] ?? null,
            'Type'        => $validated['type'],
            'District'    => $validated['district'],
            'Taluk'       => $validated['taluk'],
            'Address'     => $validated['address'] ?? null,
            'CreditLimit' => $validated['creditLimit'] ?? null,
            'Outstanding' => 0,
            'Status'      => 'pending',
            'Notes'       => $validated['notes'] ?? null,
            'CreatedBy'   => $request->user()->id,
        ]);

        return response()->json($customer->load('user'), 201);
    }

    /** PUT /api/customers/{id} */
    public function update(Request $request, $id)
    {
        $customer = Customer::find($id);

        if (!$customer) {
            return response()->json(['message' => 'Customer not found'], 404);
        }

        $validated = $request->validate([
            'name'        => 'sometimes|required|string|max:191',
            'phone'       => 'sometimes|required|string|max:20',
            'email'       => 'nullable|email|max:191',
            'type'        => 'sometimes|required|in:retail,wholesale',
            'district'    => 'sometimes|required|string|max:100',
            'taluk'       => 'sometimes|required|string|max:100',
            'address'     => 'nullable|string',
            'creditLimit' => 'nullable|numeric',
            'outstanding' => 'nullable|numeric',
            'status'      => 'sometimes|required|in:approved,pending,declined',
            'notes'       => 'nullable|string',
        ]);

        $map = [
            'name' => 'Name', 'phone' => 'Phone', 'email' => 'Email', 'type' => 'Type',
            'district' => 'District', 'taluk' => 'Taluk', 'address' => 'Address',
            'creditLimit' => 'CreditLimit', 'outstanding' => 'Outstanding',
            'status' => 'Status', 'notes' => 'Notes',
        ];

        $update = [];
        foreach ($map as $reqKey => $column) {
            if (array_key_exists($reqKey, $validated)) {
                $update[$column] = $validated[$reqKey];
            }
        }

        if (isset($update['Status']) && $update['Status'] === 'approved') {
            $update['ApprovedBy'] = $request->user()->id;
        }

        $customer->update($update);

        // Keep the linked login account (username = Name, password = Phone)
        // in sync whenever these change here.
        if ($customer->user) {
            $userUpdate = [];
            if (isset($update['Name']))  $userUpdate['name'] = $update['Name'];
            if (isset($update['Phone'])) {
                $userUpdate['phone']    = $update['Phone'];
                $userUpdate['password'] = $update['Phone'];
            }
            if (isset($update['Status'])) {
                $userUpdate['Status'] = $update['Status'] === 'approved' ? 'active' : 'inactive';
            }
            if (!empty($userUpdate)) {
                $customer->user->update($userUpdate);
            }
        }

        return response()->json($customer->load('user'));
    }

    /** DELETE /api/customers/{id} */
    public function destroy($id)
    {
        $customer = Customer::find($id);

        if (!$customer) {
            return response()->json(['message' => 'Customer not found'], 404);
        }

        // Deleting the Customer should also remove their login — otherwise
        // an orphaned account (belonging to no one) stays able to log in.
        $customer->user?->delete();
        $customer->delete();

        return response()->json(['message' => 'Customer deleted']);
    }

    /** PATCH /api/customers/{id}/status */
    public function updateStatus(Request $request, $id)
    {
        $customer = Customer::find($id);

        if (!$customer) {
            return response()->json(['message' => 'Customer not found'], 404);
        }

        $validated = $request->validate([
            'status' => 'required|in:approved,pending,declined',
        ]);

        $update = ['Status' => $validated['status']];

        if ($validated['status'] === 'approved') {
            $update['ApprovedBy'] = $request->user()->id;
        }

        $customer->update($update);

        // Approving a customer unlocks their login; anything else blocks it.
        if ($customer->user) {
            $customer->user->update([
                'Status' => $validated['status'] === 'approved' ? 'active' : 'inactive',
            ]);
        }

        return response()->json($customer->load('user'));
    }

    private function generateCustomerCode(): string
    {
        $last = Customer::orderByDesc('Id')->first();
        $nextNumber = $last ? ((int) Str::after($last->Code, 'CUST-')) + 1 : 1;

        return 'CUST-' . str_pad($nextNumber, 3, '0', STR_PAD_LEFT);
    }
}
