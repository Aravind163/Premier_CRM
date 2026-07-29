<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * In-app notifications — covers the flow diagram's "If PO Approve/Rejected
 * an information triggered to customer" step, plus dispatch/hold/claim
 * updates. Simple bell-icon style feed per user; no email/SMS gateway in
 * this build, but the trigger points are wired so one can be plugged in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications_app', function (Blueprint $table) {
            $table->id('Id');
            $table->unsignedBigInteger('UserId'); // recipient (the customer's own user row)
            $table->string('Type', 40); // order_approved | order_declined | order_dispatched | order_on_hold | complaint_resolved
            $table->string('Title', 150);
            $table->text('Message');
            $table->unsignedBigInteger('OrderId')->nullable();
            $table->dateTime('ReadAt')->nullable();
            $table->timestamp('CreatedAt')->nullable();

            $table->foreign('UserId')->references('id')->on('users')->onDelete('no action');
            $table->index(['UserId', 'ReadAt']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications_app');
    }
};
