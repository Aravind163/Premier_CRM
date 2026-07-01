<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;

class EmployeeController extends Controller
{
    /**
     * GET /api/employees
     *
     * Scoping rules:
     *   - super_admin / system_admin → see everyone (no scoping)
     *   - admin → sees only End Users whose District matches their own
     *     District (i.e. the Madurai admin only ever sees Madurai end users)
     *   - end_user → not expected to call this, but scoped to self if they do
     */
    public function index(Request $request)
    {
        $query = Employee::with('user');
        $caller = $request->user();

        if ($status = $request->query('status')) {
            $query->where('Status', $status);
        }
        if ($role = $request->query('role')) {
            $query->where('Role', $role);
        }
        if ($district = $request->query('district')) {
            $query->whereJsonContains('District', $district);
        }
        if ($taluk = $request->query('taluk')) {
            $query->whereJsonContains('Taluk', $taluk);
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('Name', 'like', "%{$search}%")
                  ->orWhere('Designation', 'like', "%{$search}%")
                  ->orWhere('District', 'like', "%{$search}%")
                  ->orWhere('Taluk', 'like', "%{$search}%");
            });
        }

        // District-level scoping for Admin role: only see end_users whose
        // District overlaps with one (or more) of the Admin's own assigned
        // Districts. Admins now can be assigned multiple Districts, so this
        // is a "do these two area lists share anything" check, not a
        // simple equality check.
        if ($caller && $caller->role === 'admin') {
            $callerEmployee = Employee::where('UserId', $caller->id)->first();
            $callerDistricts = $this->asArray($callerEmployee->District ?? $caller->District ?? null);

            $query->where('Role', 'end_user');
            if (!empty($callerDistricts)) {
                $query->where(function ($q) use ($callerDistricts) {
                    foreach ($callerDistricts as $d) {
                        // District is stored as a JSON array on employee_mst —
                        // match rows where that array contains this district.
                        $q->orWhereJsonContains('District', $d);
                    }
                });
            }
        }

        return response()->json($query->orderByDesc('Id')->get());
    }

    /**
     * Normalize a value (legacy single string, JSON-decoded array, or
     * already-an-array) into a clean PHP array of non-empty strings.
     */
    private function asArray($value): array
    {
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

    /** GET /api/employees/{id} */
    public function show($id)
    {
        $employee = Employee::with('user')->find($id);
        if (!$employee) {
            return response()->json(['message' => 'Employee not found'], 404);
        }
        return response()->json($employee);
    }

    /**
     * POST /api/employees
     *
     * Designation rules:
     *   - System Admin can create BOTH Admins and End Users directly.
     *       · Admin       → District only (never Taluk — Taluk is always
     *                        forced empty for admin-role records).
     *       · End User     → both District and Taluk may be supplied.
     *   - Admin can only create End Users, and the new end_user's District
     *     is force-set to the Admin's own District (an admin cannot place
     *     an end user outside their own district). Taluk is assigned later
     *     via the approval flow (or supplied here, still validated against
     *     the admin's own districts).
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'Name'         => 'required|string|max:255',
            'Designation'  => 'required|in:admin,end_user',
            // District/Taluk now accept multiple areas. Accept either a
            // JSON array body (['Madurai','Theni']) or a single string for
            // backward compatibility with older clients.
            'District'     => 'nullable',
            'District.*'   => 'string|max:255',
            'Taluk'        => 'nullable',
            'Taluk.*'      => 'string|max:255',
            'AssignedArea' => 'nullable|string|max:255', // legacy/free-text fallback
            'JoinedAt'     => 'nullable|date',
            'phone'        => 'required|string|unique:users,phone',
            'dob'          => 'required|string',  // ddmmyy — used as password
        ]);

        $caller     = $request->user();
        $callerRole = $caller->role ?? 'system_admin';
        $newRole    = $validated['Designation'];

        // Admin can only add end_users, and only within their own district(s)
        if ($callerRole === 'admin' && $newRole !== 'end_user') {
            return response()->json(['message' => 'Admins can only add End User accounts.'], 403);
        }

        $district = $this->asArray($validated['District'] ?? null);
        $taluk    = $this->asArray($validated['Taluk'] ?? null);

        // Admins never carry a Taluk of their own — only System Admin
        // assigns them a District (or several). Taluk only ever applies
        // to end_users.
        if ($newRole === 'admin') {
            $taluk = [];
        }

        if ($callerRole === 'admin') {
            $callerEmployee  = Employee::where('UserId', $caller->id)->first();
            $callerDistricts = $this->asArray($callerEmployee->District ?? $caller->District ?? null);

            // If the admin specified a district for the new end_user, it
            // must be one of the admin's own districts. Otherwise default
            // to all of the admin's districts.
            if (!empty($district)) {
                $district = array_values(array_intersect($district, $callerDistricts));
                if (empty($district)) {
                    return response()->json(['message' => 'You can only assign End Users within your own District(s).'], 403);
                }
            } else {
                $district = $callerDistricts;
            }
        }

        $designationLabel = $newRole === 'admin' ? 'Admin' : 'End User';
        $assignedAreaLabel = $validated['AssignedArea']
            ?? (!empty($taluk) ? implode(', ', $taluk) : (!empty($district) ? implode(', ', $district) : null));

        // Every new account starts pending until the right approver acts:
        //   - new Admins        → approved by System Admin (assigns District(s))
        //   - new End Users     → approved by Admin (assigns Taluk(s)), scoped
        //     to the admin who owns that district
        $user = User::create([
            'name'         => $validated['Name'],
            'email'        => $validated['Name'] . '@premiercrm.com',
            'phone'        => $validated['phone'],
            'dob'          => $validated['dob'],
            'password'     => $validated['dob'],
            'role'         => $newRole,
            'Designation'  => $designationLabel,
            'District'     => $district,
            'Taluk'        => $taluk,
            'AssignedArea' => $assignedAreaLabel,
            'Status'       => 'inactive', // pending approval
        ]);

        $employee = Employee::create([
            'UserId'       => $user->id,
            'Name'         => $validated['Name'],
            'Designation'  => $designationLabel,
            'District'     => $district,
            'Taluk'        => $taluk,
            'AssignedArea' => $assignedAreaLabel,
            'Role'         => $newRole,
            'Status'       => 'pending',
            'JoinedAt'     => $validated['JoinedAt'] ?? null,
        ]);

        return response()->json($employee->load('user'), 201);
    }

    /** PUT/PATCH /api/employees/{id} — edit employee details + assignment */
    public function update(Request $request, $id)
    {
        $employee = Employee::with('user')->find($id);
        if (!$employee) {
            return response()->json(['message' => 'Employee not found'], 404);
        }

        $caller     = $request->user();
        $callerRole = $caller->role ?? null;

        // An admin may only edit end_users whose District(s) overlap with
        // the admin's own assigned District(s)
        if ($callerRole === 'admin') {
            $callerEmployee  = Employee::where('UserId', $caller->id)->first();
            $callerDistricts = $this->asArray($callerEmployee->District ?? $caller->District ?? null);
            $empDistricts    = $this->asArray($employee->District);

            $overlaps = !empty(array_intersect($callerDistricts, $empDistricts));
            if ($employee->Role !== 'end_user' || !$overlaps) {
                return response()->json(['message' => 'You can only manage End Users within your own District(s).'], 403);
            }
        }

        $validated = $request->validate([
            'Name'         => 'sometimes|string|max:255',
            'Designation'  => 'sometimes|string|max:255',
            'District'     => 'sometimes|nullable',
            'District.*'   => 'string|max:255',
            'Taluk'        => 'sometimes|nullable',
            'Taluk.*'      => 'string|max:255',
            'AssignedArea' => 'sometimes|nullable|string|max:255',
            'JoinedAt'     => 'sometimes|nullable|date',
            'Status'       => 'sometimes|in:approved,pending,inactive',
            'ApprovalNote' => 'sometimes|nullable|string|max:500',
        ]);

        if (array_key_exists('District', $validated)) {
            $validated['District'] = $this->asArray($validated['District']);
        }
        if (array_key_exists('Taluk', $validated)) {
            $newTaluks = $this->asArray($validated['Taluk']);

            // Admin can reassign Taluk(s) for an end_user freely (the
            // end_user's District already overlaps the admin's own — that
            // was verified above) — but cannot use a Taluk reassignment to
            // smuggle in a District change.
            if ($callerRole === 'admin') {
                unset($validated['District']);
            }
            $validated['Taluk'] = $newTaluks;
        }

        // Admin cannot reassign District (only System Admin can) — strip it
        // out if an admin somehow sends it, to avoid accidental district hops
        if ($callerRole === 'admin') {
            unset($validated['District']);
        }

        // Admin-role employees never carry a Taluk — that field only ever
        // applies to end_users. Strip it regardless of who's calling, so a
        // Taluk can never accidentally end up attached to an Admin record.
        if ($employee->Role === 'admin') {
            unset($validated['Taluk']);
        }

        $employee->update($validated);

        if ($employee->user) {
            $userUpdate = [];
            if (isset($validated['Name']))         $userUpdate['name']         = $validated['Name'];
            if (isset($validated['District']))     $userUpdate['District']     = $validated['District'];
            if (isset($validated['Taluk']))        $userUpdate['Taluk']        = $validated['Taluk'];
            if (isset($validated['AssignedArea'])) $userUpdate['AssignedArea'] = $validated['AssignedArea'];
            if (isset($validated['ApprovalNote'])) $userUpdate['ApprovalNote'] = $validated['ApprovalNote'];
            if (isset($validated['Status'])) {
                $userUpdate['Status'] = $validated['Status'] === 'approved' ? 'active' : 'inactive';
            }
            if (!empty($userUpdate)) {
                $employee->user->update($userUpdate);
            }
        }

        return response()->json($employee->load('user'));
    }

    /**
     * PATCH /api/employees/{id}/status
     *
     * Approval authority:
     *   - System Admin approves Admins (District only, Taluk is always
     *     forced empty for admin-role records) AND End Users (both
     *     District and Taluk).
     *   - Admin approves End Users within their own district(s) only,
     *     and may only assign Taluk (District is stripped/ignored — only
     *     System Admin ever changes an end_user's District).
     */
    public function updateStatus(Request $request, $id)
    {
        $employee = Employee::with('user')->find($id);
        if (!$employee) {
            return response()->json(['message' => 'Employee not found'], 404);
        }

        $caller     = $request->user();
        $callerRole = $caller->role ?? null;

        if ($callerRole === 'admin') {
            $callerEmployee  = Employee::where('UserId', $caller->id)->first();
            $callerDistricts = $this->asArray($callerEmployee->District ?? $caller->District ?? null);
            $empDistricts    = $this->asArray($employee->District);
            $overlaps        = !empty(array_intersect($callerDistricts, $empDistricts));

            if ($employee->Role !== 'end_user' || !$overlaps) {
                return response()->json(['message' => 'You can only approve End Users within your own District(s).'], 403);
            }
        } elseif (!in_array($callerRole, ['system_admin'])) {
            return response()->json(['message' => 'You are not authorized to change approval status.'], 403);
        }

        $validated = $request->validate([
            'status'       => 'required|in:approved,pending,inactive',
            'District'     => 'nullable', // system_admin assigning to an admin (array or string)
            'District.*'   => 'string|max:255',
            'Taluk'        => 'nullable', // admin assigning to an end_user (array or string)
            'Taluk.*'      => 'string|max:255',
            'AssignedArea' => 'nullable|string|max:255',
            'ApprovalNote' => 'nullable|string|max:500',
        ]);

        $newDistrict = array_key_exists('District', $validated) ? $this->asArray($validated['District']) : null;
        $newTaluk    = array_key_exists('Taluk', $validated) ? $this->asArray($validated['Taluk']) : null;

        // Admin-role employees never carry a Taluk — System Admin only ever
        // assigns them District(s). Taluk assignment only applies when the
        // employee being approved/updated is an end_user. Only override when
        // a Taluk was actually submitted, so a plain status change doesn't
        // trigger an unnecessary write.
        if ($employee->Role === 'admin' && $newTaluk !== null) {
            $newTaluk = [];
        }

        // Require area assignment before approval, per role being approved
        if ($validated['status'] === 'approved') {
            if ($employee->Role === 'admin' && empty($newDistrict) && empty($this->asArray($employee->District))) {
                return response()->json(['message' => 'Please assign at least one District before approving this Admin.'], 422);
            }
            if ($employee->Role === 'end_user' && empty($newTaluk) && empty($this->asArray($employee->Taluk))) {
                return response()->json(['message' => 'Please assign at least one Taluk before approving this End User.'], 422);
            }
        }

        $empUpdate = ['Status' => $validated['status']];
        if ($newDistrict !== null)             $empUpdate['District']     = $newDistrict;
        if ($newTaluk !== null)                $empUpdate['Taluk']        = $newTaluk;
        if (isset($validated['AssignedArea'])) $empUpdate['AssignedArea'] = $validated['AssignedArea'];
        $employee->update($empUpdate);

        if ($employee->user) {
            $userUpdate = ['Status' => $validated['status'] === 'approved' ? 'active' : 'inactive'];
            if ($newDistrict !== null)             $userUpdate['District']     = $newDistrict;
            if ($newTaluk !== null)                $userUpdate['Taluk']        = $newTaluk;
            if (isset($validated['AssignedArea'])) $userUpdate['AssignedArea'] = $validated['AssignedArea'];
            if (isset($validated['ApprovalNote'])) $userUpdate['ApprovalNote'] = $validated['ApprovalNote'];
            $employee->user->update($userUpdate);
        }

        return response()->json($employee->load('user'));
    }
}
