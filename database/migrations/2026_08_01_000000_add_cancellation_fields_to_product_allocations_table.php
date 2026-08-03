<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Adds the columns AllocationController@cancel() writes to. This only adds
// columns — it does NOT touch the Status column's type. If Status on
// product_allocations (or Orders) is a real MySQL ENUM rather than a plain
// VARCHAR, you'll additionally need a raw ALTER TABLE ... MODIFY COLUMN
// statement to add 'cancelled' as a valid ENUM value before cancel() will
// save without a DB error — I don't have your schema, so I can't tell
// which case applies here. Check with:
//   SHOW COLUMNS FROM product_allocations LIKE 'Status';
//   SHOW COLUMNS FROM orders LIKE 'Status';
// If either says "enum(...)", let me know the exact table/column and I'll
// write the matching ALTER TABLE migration.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_allocations', function (Blueprint $table) {
            $table->timestamp('CancelledAt')->nullable()->after('ErpTransferredAt');
            $table->unsignedBigInteger('CancelledBy')->nullable()->after('CancelledAt');
            $table->string('CancelReason', 2000)->nullable()->after('CancelledBy');
        });
    }

    public function down(): void
    {
        Schema::table('product_allocations', function (Blueprint $table) {
            $table->dropColumn(['CancelledAt', 'CancelledBy', 'CancelReason']);
        });
    }
};