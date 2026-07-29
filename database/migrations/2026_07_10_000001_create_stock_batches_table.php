<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Goods Allocation on FIFO basis (O2C Step 8).
 *
 * Every unit of stock a product has is received as a "batch" (a lot that
 * arrived at a point in time). When Marketing allocates stock to a
 * customer, the system draws from the OLDEST batch first (FIFO) until the
 * allocated quantity is covered, and records exactly which batch(es) and
 * how much of each were consumed — matching the flow diagram's "Goods
 * allocation and movement on FIFO basis" step.
 *
 * Warehouse is either 'rack' (Blouse category — per the scope doc's Stock
 * Visibility Logic) or 'eb4' (every other category, i.e. the EB4 Dispatch
 * Warehouse).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_batches', function (Blueprint $table) {
            $table->id('Id');
            $table->string('BatchNo', 60)->unique();
            $table->unsignedBigInteger('ProductId');
            $table->string('Warehouse', 20); // rack | eb4
            $table->integer('ReceivedQty');
            $table->integer('RemainingQty');
            $table->dateTime('ReceivedAt'); // FIFO ordering key — oldest ReceivedAt consumed first
            $table->string('Notes', 255)->nullable();
            $table->unsignedBigInteger('CreatedBy')->nullable();
            $table->timestamp('CreatedAt')->nullable();
            $table->timestamp('UpdatedAt')->nullable();

            $table->foreign('ProductId')->references('Id')->on('Products')->onDelete('no action');
            $table->index(['ProductId', 'Warehouse', 'ReceivedAt']);
        });

        // Every allocation draws down one or more batches. One row per
        // (allocation, batch) pair so we can show "allocated 300 from
        // BATCH-0004 (12-May) + 200 from BATCH-0007 (18-May)".
        Schema::create('allocation_batch_consumptions', function (Blueprint $table) {
            $table->id('Id');
            $table->unsignedBigInteger('ProductAllocationId');
            $table->unsignedBigInteger('BatchId');
            $table->integer('ConsumedQty');
            $table->timestamp('CreatedAt')->nullable();

            $table->foreign('ProductAllocationId')->references('Id')->on('product_allocations')->onDelete('no action');
            $table->foreign('BatchId')->references('Id')->on('stock_batches')->onDelete('no action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('allocation_batch_consumptions');
        Schema::dropIfExists('stock_batches');
    }
};
