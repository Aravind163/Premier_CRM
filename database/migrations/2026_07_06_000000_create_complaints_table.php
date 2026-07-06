<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Complaints', function (Blueprint $table) {
            $table->id('Id');
            $table->unsignedBigInteger('OrderId');
            $table->unsignedBigInteger('CustomerId');
            $table->string('Type');
            $table->text('Description');
            // Open -> In Progress -> Resolved
            $table->string('Status')->default('Open');
            $table->text('Resolution')->nullable();
            $table->unsignedBigInteger('ResolvedBy')->nullable();
            $table->timestamp('ResolvedAt')->nullable();
            $table->timestamp('CreatedAt')->nullable();
            $table->timestamp('UpdatedAt')->nullable();

            $table->foreign('OrderId')->references('Id')->on('Orders')->onDelete('cascade');
            $table->foreign('CustomerId')->references('Id')->on('Customers')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Complaints');
    }
};