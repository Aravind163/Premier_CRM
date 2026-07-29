<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Credit Limit feature — tracks how much of a billed order has actually
 * been paid so far (a customer can part-pay: e.g. ₹1,00,000 order,
 * ₹50,000 paid). PaymentStatus stays the quick-glance flag
 * (unpaid/partial/paid/refund); AmountPaid is the running total that
 * drives it. Recorded via OrderController::recordPayment().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Orders', function (Blueprint $table) {
            if (!Schema::hasColumn('Orders', 'AmountPaid')) {
                $table->decimal('AmountPaid', 12, 2)->default(0)->after('PaymentStatus');
            }
        });
    }

    public function down(): void
    {
        Schema::table('Orders', function (Blueprint $table) {
            $table->dropColumn(['AmountPaid']);
        });
    }
};