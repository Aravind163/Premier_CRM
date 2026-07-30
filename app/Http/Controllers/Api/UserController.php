<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $query = User::query();

        // Filter by roles (admin, system_admin, end_user, etc.)
        if ($roles = $request->query('roles')) {
            $rolesArray = array_filter(array_map('trim', explode(',', $roles)));

            if (!empty($rolesArray)) {
                $query->whereIn('role', $rolesArray);
            }
        }

        // Optional: only active users
        if ($request->query('active_only')) {
            $query->where('Status', 'active');
        }

        return response()->json(
            $query->orderBy('name')->get()
        );
    }
}
