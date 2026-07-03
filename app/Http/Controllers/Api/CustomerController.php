<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CustomerController extends Controller
{
    /**
     * GET /api/customers
     *
     * Scoping:
     *   - `customer`  → only their own record (Customers.UserId)
     *   - `end_user`  → only customers whose Taluk matches one of the
     *                   end_user's own assigned Taluk(s) (Field Officer,
     *                   area-scoped)
     *   - `admin`     → only customers whose District matches one of the
     *                   admin's own assigned District(s)
     *   - `system_admin` / `super_admin` → full list, unscoped
     */
    public function index(Request $request)
    {
        $query = Customer::with('user');
        $caller = $request->user();

        if ($caller && $caller->role === 'customer') {
            $query->where('UserId', $caller->id);
        }

        if ($caller && $caller->role === 'end_user') {
            $taluks = $this->callerAreas($caller, 'Taluk');
            $query->where(function ($q) use ($taluks) {
                foreach ($taluks as $t) {
                    $q->orWhere('Taluk', $t);
                }
                if (empty($taluks)) {
                    $q->whereRaw('1 = 0'); // no assigned taluk yet → see nothing
                }
            });
        }

        if ($caller && $caller->role === 'admin') {
            $districts = $this->callerAreas($caller, 'District');
            $query->where(function ($q) use ($districts) {
                foreach ($districts as $d) {
                    $q->orWhere('District', $d);
                }
                if (empty($districts)) {
                    $q->whereRaw('1 = 0'); // no assigned district yet → see nothing
                }
            });
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

    /**
     * Normalise a caller's own assigned District/Taluk (from their linked
     * Employee record, falling back to the User row) into a clean array.
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

        if ($caller && $caller->role === 'end_user') {
            $taluks = $this->callerAreas($caller, 'Taluk');
            if (!in_array($customer->Taluk, $taluks, true)) {
                return response()->json(['message' => 'This customer is outside your assigned Taluk(s).'], 403);
            }
        }

        if ($caller && $caller->role === 'admin') {
            $districts = $this->callerAreas($caller, 'District');
            if (!in_array($customer->District, $districts, true)) {
                return response()->json(['message' => 'This customer is outside your assigned District(s).'], 403);
            }
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
