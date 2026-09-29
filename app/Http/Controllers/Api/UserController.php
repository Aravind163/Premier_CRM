<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Admin Master — account provisioning for staff logins.
 *
 * This is deliberately independent of EmployeeController/employee_mst
 * (which drives the District/Taluk approval workflow). Admin Master
 * creates a login directly — role + password + active/inactive — with
 * no approval step, for the three staff roles Super Admin is allowed
 * to provision: end_user, admin, system_admin.
 *
 * Only super_admin may call these endpoints.
 */
class UserController extends Controller
{
    /** Roles Admin Master is allowed to manage. */
    private const MANAGEABLE_ROLES = ['end_user', 'admin', 'system_admin'];

    private function ensureSuperAdmin(Request $request)
    {
        $caller = $request->user();
        if (!$caller || $caller->role !== 'super_admin') {
            return response()->json(['message' => 'Only Super Admin can manage accounts here.'], 403);
        }
        return null;
    }

    /** GET /api/accounts — list end_user / admin / system_admin logins */
    public function index(Request $request)
    {
        if ($deny = $this->ensureSuperAdmin($request)) return $deny;

        $query = User::query()->whereIn('role', self::MANAGEABLE_ROLES);

        if ($roles = $request->query('roles')) {
            $rolesArray = array_values(array_intersect(
                array_filter(array_map('trim', explode(',', $roles))),
                self::MANAGEABLE_ROLES
            ));
            if (!empty($rolesArray)) {
                $query->whereIn('role', $rolesArray);
            }
        }

        if ($request->query('active_only')) {
            $query->where('Status', 'active');
        }

        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('Designation', 'like', "%{$search}%");
            });
        }

        return response()->json($query->orderByDesc('id')->get());
    }

    /** GET /api/accounts/{id} */
    public function show(Request $request, $id)
    {
        if ($deny = $this->ensureSuperAdmin($request)) return $deny;

        $user = User::whereIn('role', self::MANAGEABLE_ROLES)->find($id);
        if (!$user) {
            return response()->json(['message' => 'Account not found'], 404);
        }
        return response()->json($user);
    }

    /** POST /api/accounts */
    public function store(Request $request)
    {
        if ($deny = $this->ensureSuperAdmin($request)) return $deny;

        $validator = Validator::make($request->all(), [
            'name'        => 'required|string|max:255',
            'userId'      => 'required|string|max:255|unique:users,email',
            'designation' => 'required|string|max:255',
            'district'    => 'nullable|string|max:100',
            'role'        => ['required', Rule::in(self::MANAGEABLE_ROLES)],
            'password'    => 'required|string|min:4|confirmed',
            'active'      => 'required|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => $validator->errors()->first(), 'errors' => $validator->errors()], 422);
        }
        $data = $validator->validated();

        $user = new User();
        $user->name        = $data['name'];
        $user->email       = $data['userId'];
        $user->role        = $data['role'];
        $user->password    = $data['password']; // hashed by the model's saving hook
        $user->Designation = $data['designation'];
        $user->District    = $data['district'] ?? null;
        $user->Status      = $data['active'] ? 'active' : 'inactive';
        $user->save();

        return response()->json($user, 201);
    }

    /** PUT/PATCH /api/accounts/{id} */
    public function update(Request $request, $id)
    {
        if ($deny = $this->ensureSuperAdmin($request)) return $deny;

        $user = User::whereIn('role', self::MANAGEABLE_ROLES)->find($id);
        if (!$user) {
            return response()->json(['message' => 'Account not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'name'        => 'sometimes|required|string|max:255',
            'userId'      => ['sometimes', 'required', 'string', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'designation' => 'sometimes|required|string|max:255',
            'district'    => 'nullable|string|max:100',
            'role'        => ['sometimes', 'required', Rule::in(self::MANAGEABLE_ROLES)],
            // Password is optional on edit — leave blank to keep the current one.
            'password'    => 'nullable|string|min:4|confirmed',
            'active'      => 'sometimes|required|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => $validator->errors()->first(), 'errors' => $validator->errors()], 422);
        }
        $data = $validator->validated();

        if (array_key_exists('name', $data))        $user->name        = $data['name'];
        if (array_key_exists('userId', $data))       $user->email       = $data['userId'];
        if (array_key_exists('designation', $data))  $user->Designation = $data['designation'];
        if (array_key_exists('district', $data))     $user->District    = $data['district'];
        if (array_key_exists('role', $data))         $user->role        = $data['role'];
        if (array_key_exists('active', $data))       $user->Status      = $data['active'] ? 'active' : 'inactive';
        if (!empty($data['password']))               $user->password    = $data['password'];

        $user->save();

        return response()->json($user);
    }

    /** DELETE /api/accounts/{id} */
    public function destroy(Request $request, $id)
    {
        if ($deny = $this->ensureSuperAdmin($request)) return $deny;

        $user = User::whereIn('role', self::MANAGEABLE_ROLES)->find($id);
        if (!$user) {
            return response()->json(['message' => 'Account not found'], 404);
        }

        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'You cannot delete your own account.'], 422);
        }

        $user->delete();

        return response()->json(['message' => 'Account deleted']);
    }
}
