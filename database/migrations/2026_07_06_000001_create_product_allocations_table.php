<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Quantity Allocation
 *
 * When demand for a product (sum of what customers have ordered) exceeds
 * what's actually available (Products.Quantity), an Admin/System Admin
 * decides how much each customer is actually allocated. One row per
 * (Product, Customer) pair — "ordered" quantity is always computed live
 * from the Orders table; only the allocated quantity is stored here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_allocations', function (Blueprint $table) {
            $table->id('Id');
            $table->unsignedBigInteger('ProductId');
            $table->unsignedBigInteger('CustomerId');
            $table->integer('AllocatedQty')->default(0);
            $table->unsignedBigInteger('AllocatedBy')->nullable();
            $table->timestamp('CreatedAt')->nullable();
            $table->timestamp('UpdatedAt')->nullable();

            $table->foreign('ProductId')->references('Id')->on('Products')->onDelete('cascade');
            $table->foreign('CustomerId')->references('Id')->on('Customers')->onDelete('cascade');
            $table->unique(['ProductId', 'CustomerId']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_allocations');
    }
};