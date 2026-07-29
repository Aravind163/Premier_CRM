<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customer-wise Credit and Discount Validation (O2C Step 9). MaxDiscountPct
 * is the ceiling Marketing is allowed to grant this customer on an order —
 * used alongside CreditLimit/Outstanding to decide whether an order can
 * proceed to dispatch or must go on hold for review.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Customers', function (Blueprint $table) {
            if (!Schema::hasColumn('Customers', 'MaxDiscountPct')) {
                $table->decimal('MaxDiscountPct', 5, 2)->nullable()->after('CreditLimit');
            }
        });
    }

    public function down(): void
    {
        Schema::table('Customers', function (Blueprint $table) {
            $table->dropColumn(['MaxDiscountPct']);
        });
    }
};
