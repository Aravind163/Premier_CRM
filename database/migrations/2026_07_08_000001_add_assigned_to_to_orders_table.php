<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Order Enquiry workflow: before an enquiry becomes a formal order, staff
 * assign it to themselves (or another staff member) so it's clear who's
 * working it. AssignedTo tracks that; Status gains an 'assigned' value in
 * between 'pending' and 'approved' (enforced in app code, not the DB,
 * since Status is a plain string column here).
 *
 * AssignedTo is a plain nullable column with NO database-level foreign
 * key, for the same reason as PaymentDueDateSetBy (see that migration) —
 * SQL Server rejects a second cascading path to users from this table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Orders', function (Blueprint $table) {
            if (!Schema::hasColumn('Orders', 'AssignedTo')) {
                $table->unsignedBigInteger('AssignedTo')->nullable()->after('CreatedBy');
            }
            if (!Schema::hasColumn('Orders', 'AssignedAt')) {
                $table->timestamp('AssignedAt')->nullable()->after('AssignedTo');
            }
        });
    }

    public function down(): void
    {
        Schema::table('Orders', function (Blueprint $table) {
            $table->dropColumn(['AssignedTo', 'AssignedAt']);
        });
    }
};