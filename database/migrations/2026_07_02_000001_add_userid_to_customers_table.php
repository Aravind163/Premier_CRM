<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links a Customer to a `users` row so customers can log in themselves.
 *
 * Login pattern (mirrors admin/end_user, where username = phone and
 * password = dob):
 *   - username = Shop Name (Customers.Name)
 *   - password = Phone number (Customers.Phone)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Customers', function (Blueprint $table) {
            if (!Schema::hasColumn('Customers', 'UserId')) {
                $table->unsignedBigInteger('UserId')->nullable()->after('Id');
                $table->foreign('UserId')->references('id')->on('users')->onDelete('set null');
            }
        });
    }

    public function down(): void
    {
        Schema::table('Customers', function (Blueprint $table) {
            $table->dropForeign(['UserId']);
            $table->dropColumn('UserId');
        });
    }
};
