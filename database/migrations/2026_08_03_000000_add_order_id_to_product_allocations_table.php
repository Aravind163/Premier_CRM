<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds OrderId to product_allocations and folds it into the unique key.
 *
 * THE BUG THIS FIXES: ProductAllocation was keyed by [ProductId,
 * CustomerId] only. So if a customer already had one Order for a product
 * allocated (say, AllocatedQty = 2), and then placed a SECOND active Order
 * for that same product, Marketing Review would show that brand-new Order
 * with AllocatedQty = 2 as well — both Orders were reading/writing the
 * exact same allocation row. That's why every line for that customer+
 * product showed the same non-zero qty instead of the new one starting at
 * 0. Once this migration runs (and AllocationController /
 * Batches.jsx are updated to pass OrderId through), each Order gets its
 * own independent allocation row, so a fresh Order always starts at 0 and
 * editing one Order's qty never touches another.
 *
 * NOTE ON NAMES: this assumes the table is `product_allocations` with
 * PascalCase columns (ProductId / CustomerId / AllocatedQty / etc — same
 * as everywhere else in AllocationController). If your real migration
 * uses a different table name, or the auto-generated unique index isn't
 * named `product_allocations_productid_customerid_unique`, run
 * `SHOW INDEX FROM product_allocations;` (or check your original
 * create-table migration) and adjust the two names below before running
 * this — the down() migration name must match too.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_allocations', function (Blueprint $table) {
            $table->unsignedBigInteger('OrderId')->nullable()->after('CustomerId');
        });

        // Backfill: point every existing allocation at that customer's
        // most recent active Order for the same product, so existing
        // allocations don't just disappear once OrderId joins the unique
        // key below. Anything that can't be matched to a currently-active
        // Order (e.g. it was since dispatched/cancelled) is left with a
        // null OrderId — Marketing Review only reads allocations that
        // match a live Order, so those simply stop surfacing there, which
        // is correct (that Order isn't "live demand" any more anyway).
        $allocations = DB::table('product_allocations')->orderBy('Id')->get();
        foreach ($allocations as $allocation) {
            $order = DB::table('orders')
                ->where('ProductId', $allocation->ProductId)
                ->where('CustomerId', $allocation->CustomerId)
                ->whereIn('Status', ['pending', 'approved', 'processing'])
                ->orderByDesc('Id')
                ->first();
            if ($order) {
                DB::table('product_allocations')
                    ->where('Id', $allocation->Id)
                    ->update(['OrderId' => $order->Id]);
            }
        }

        Schema::table('product_allocations', function (Blueprint $table) {
            // Old unique key was [ProductId, CustomerId]. Drop it and key
            // on [ProductId, CustomerId, OrderId] instead, so each Order
            // gets its own allocation row.
            $table->dropUnique('product_allocations_productid_customerid_unique');
            $table->unique(['ProductId', 'CustomerId', 'OrderId'], 'product_allocations_product_customer_order_unique');
            $table->foreign('OrderId')->references('Id')->on('orders')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('product_allocations', function (Blueprint $table) {
            $table->dropForeign(['OrderId']);
            $table->dropUnique('product_allocations_product_customer_order_unique');
            $table->dropColumn('OrderId');
            $table->unique(['ProductId', 'CustomerId'], 'product_allocations_productid_customerid_unique');
        });
    }
};