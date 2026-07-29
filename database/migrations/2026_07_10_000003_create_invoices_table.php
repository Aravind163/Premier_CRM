<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Invoice creation against allocation (O2C Step 11) — one invoice per
 * dispatched order, generated once goods actually leave, referencing the
 * batches consumed for that order's allocation.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id('Id');
            $table->string('InvoiceNumber', 60)->unique();
            $table->unsignedBigInteger('OrderId');
            $table->unsignedBigInteger('CustomerId');
            $table->decimal('SubTotal', 14, 2);
            $table->decimal('DiscountAmount', 14, 2)->default(0);
            $table->decimal('TotalAmount', 14, 2);
            $table->string('Status', 20)->default('issued'); // issued | paid | cancelled
            $table->unsignedBigInteger('IssuedBy')->nullable();
            $table->dateTime('IssuedAt');
            $table->timestamp('CreatedAt')->nullable();
            $table->timestamp('UpdatedAt')->nullable();

            $table->foreign('OrderId')->references('Id')->on('Orders')->onDelete('no action');
            $table->foreign('CustomerId')->references('Id')->on('Customers')->onDelete('no action');
            $table->unique('OrderId'); // one invoice per order
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
