<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the fields needed for:
 *  - Step 4 (PO approve/reject -> customer notified): RejectionReason.
 *  - Step 6 (credit/discount validation -> hold for review): OnHold,
 *    HoldReason, HoldPlacedAt.
 *  - Step 8 (FIFO/EB4 hand-off): WarehouseSource, so we know whether this
 *    order was fulfilled from Rack Stock or the EB4 Dispatch Warehouse.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Orders', function (Blueprint $table) {
            if (!Schema::hasColumn('Orders', 'RejectionReason')) {
                $table->string('RejectionReason', 255)->nullable()->after('Status');
            }
            if (!Schema::hasColumn('Orders', 'OnHold')) {
                $table->boolean('OnHold')->default(false)->after('RejectionReason');
            }
            if (!Schema::hasColumn('Orders', 'HoldReason')) {
                $table->string('HoldReason', 255)->nullable()->after('OnHold');
            }
            if (!Schema::hasColumn('Orders', 'HoldPlacedAt')) {
                $table->dateTime('HoldPlacedAt')->nullable()->after('HoldReason');
            }
            if (!Schema::hasColumn('Orders', 'WarehouseSource')) {
                $table->string('WarehouseSource', 20)->nullable()->after('HoldPlacedAt'); // rack | eb4
            }
        });
    }

    public function down(): void
    {
        Schema::table('Orders', function (Blueprint $table) {
            $table->dropColumn(['RejectionReason', 'OnHold', 'HoldReason', 'HoldPlacedAt', 'WarehouseSource']);
        });
    }
};
