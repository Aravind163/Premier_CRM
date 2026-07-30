<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marketing Review -> Final Approval workflow.
 *
 * An Admin's "Save & Submit Allocation" hands a row to a System Admin as
 * Status='pending'. The System Admin ticks/crosses it to 'approved' /
 * 'rejected' (Remarks optional, freeform), and once 'approved' can push it
 * to ERP (ErpStatus 'not_transferred' -> 'erp_so_created').
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_allocations', function (Blueprint $table) {
            $table->string('Status', 20)->default('pending')->after('AllocatedBy');
            $table->text('Remarks')->nullable()->after('Status');
            $table->string('ErpStatus', 20)->default('not_transferred')->after('Remarks');
            $table->unsignedBigInteger('DecidedBy')->nullable()->after('ErpStatus');
            $table->timestamp('DecidedAt')->nullable()->after('DecidedBy');
            $table->timestamp('ErpTransferredAt')->nullable()->after('DecidedAt');

            $table->foreign('DecidedBy')->references('id')->on('users')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('product_allocations', function (Blueprint $table) {
            $table->dropForeign(['DecidedBy']);
            $table->dropColumn(['Status', 'Remarks', 'ErpStatus', 'DecidedBy', 'DecidedAt', 'ErpTransferredAt']);
        });
    }
};
