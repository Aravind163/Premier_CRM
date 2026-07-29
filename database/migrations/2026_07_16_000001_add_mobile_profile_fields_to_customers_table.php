<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Brings the web "Add Customer" form up to parity with the mobile app's
 * AddCustomerScreen.tsx: multiple business emails/phones, business type,
 * multiple contact persons, multiple addresses, and GST/PAN/TAN.
 *
 * `Email`/`Phone`/`Address` (single-value) are kept as-is for backward
 * compatibility with existing reports/screens — they're kept in sync
 * with the first entry of `Emails`/`Phones`/`Addresses` by the model.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Customers', function (Blueprint $table) {
            if (!Schema::hasColumn('Customers', 'BusinessType')) {
                $table->string('BusinessType', 30)->nullable()->after('Type');
            }
            if (!Schema::hasColumn('Customers', 'Emails')) {
                $table->json('Emails')->nullable()->after('Email');
            }
            if (!Schema::hasColumn('Customers', 'Phones')) {
                $table->json('Phones')->nullable()->after('Phone');
            }
            if (!Schema::hasColumn('Customers', 'Addresses')) {
                $table->json('Addresses')->nullable()->after('Address');
            }
            if (!Schema::hasColumn('Customers', 'ContactPersons')) {
                $table->json('ContactPersons')->nullable()->after('Addresses');
            }
            if (!Schema::hasColumn('Customers', 'GSTNo')) {
                $table->string('GSTNo', 15)->nullable()->after('ContactPersons');
            }
            if (!Schema::hasColumn('Customers', 'PANNo')) {
                $table->string('PANNo', 10)->nullable()->after('GSTNo');
            }
            if (!Schema::hasColumn('Customers', 'TANNo')) {
                $table->string('TANNo', 10)->nullable()->after('PANNo');
            }
        });
    }

    public function down(): void
    {
        Schema::table('Customers', function (Blueprint $table) {
            $table->dropColumn([
                'BusinessType', 'Emails', 'Phones', 'Addresses',
                'ContactPersons', 'GSTNo', 'PANNo', 'TANNo',
            ]);
        });
    }
};