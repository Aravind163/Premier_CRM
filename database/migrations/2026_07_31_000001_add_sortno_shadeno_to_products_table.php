<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Products table has never had real SortNo / ShadeNo columns — grep
 * across the whole backend (models, controllers, every migration) turns
 * up zero hits for either name. Every "Sort No" the frontend has shown
 * correctly so far was actually just `Code` (ProductCatalogSeeder writes
 * the client's real Excel Sort No straight into Code for the originally
 * seeded catalog — see database/seeders/ProductCatalogSeeder.php), which
 * only ever worked for that one seeded batch and breaks for every
 * product created afterwards (Add Product / Excel bulk import), since
 * those get an auto-generated CLT-XXX/YRN-XXX Code instead.
 *
 * This adds real, nullable SortNo/ShadeNo columns so new products (via
 * Add Product or bulk Excel import) can actually persist their own Sort
 * No / Shade No, instead of being permanently stuck falling back to the
 * auto-generated Code.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Products', function (Blueprint $table) {
            $table->string('SortNo', 50)->nullable()->after('Code');
            $table->string('ShadeNo', 50)->nullable()->after('SortNo');
        });
    }

    public function down(): void
    {
        Schema::table('Products', function (Blueprint $table) {
            $table->dropColumn(['SortNo', 'ShadeNo']);
        });
    }
};