<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration: add end_user support + district/taluk hierarchy
 *
 * users table additions:
 *   - Designation  (admin | end_user)
 *   - Taluk        (assigned by an Admin to an end_user, within the
 *                   admin's own District — District column already existed)
 *   - AssignedArea (legacy/display field — mirrors Taluk for end_user,
 *                   District for admin; kept for backward compatibility
 *                   with earlier UI that read this single field)
 *   - ApprovalNote (internal note left by the approver)
 *
 * employee_mst table additions:
 *   - Taluk        (District column already existed on employee_mst)
 *   - AssignedArea
 *   - Designation
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── users table ──────────────────────────────────────────────
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'Designation')) {
                $table->string('Designation')->default('admin')->after('role');
            }
            if (!Schema::hasColumn('users', 'Taluk')) {
                $table->string('Taluk')->nullable()->after('District');
            }
            if (!Schema::hasColumn('users', 'AssignedArea')) {
                $table->string('AssignedArea')->nullable()->after('Taluk');
            }
            if (!Schema::hasColumn('users', 'ApprovalNote')) {
                $table->string('ApprovalNote')->nullable()->after('AssignedArea');
            }
        });

        // ── employee_mst table ───────────────────────────────────────
        Schema::table('employee_mst', function (Blueprint $table) {
            if (!Schema::hasColumn('employee_mst', 'AssignedArea')) {
                $table->string('AssignedArea')->nullable()->after('Taluk');
            }
            if (!Schema::hasColumn('employee_mst', 'Designation')) {
                $table->string('Designation')->default('admin')->after('Role');
            }
            // Taluk should already exist on employee_mst from the original
            // schema, but add defensively in case this environment differs.
            if (!Schema::hasColumn('employee_mst', 'Taluk')) {
                $table->string('Taluk')->nullable()->after('District');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['Designation', 'Taluk', 'AssignedArea', 'ApprovalNote']);
        });
        Schema::table('employee_mst', function (Blueprint $table) {
            $table->dropColumn(['AssignedArea', 'Designation']);
        });
    }
};
