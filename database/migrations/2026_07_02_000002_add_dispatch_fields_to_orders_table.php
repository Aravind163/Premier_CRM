<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Goods Dispatch (O2C Step 7): tracking details + LR number, captured when
 * an approved/processing order is actually packed and handed to transport.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Orders', function (Blueprint $table) {
            if (!Schema::hasColumn('Orders', 'LRNumber')) {
                $table->string('LRNumber', 100)->nullable()->after('Status');
            }
            if (!Schema::hasColumn('Orders', 'TransportName')) {
                $table->string('TransportName', 150)->nullable()->after('LRNumber');
            }
            if (!Schema::hasColumn('Orders', 'DispatchedAt')) {
                $table->dateTime('DispatchedAt')->nullable()->after('TransportName');
            }
            if (!Schema::hasColumn('Orders', 'DispatchedBy')) {
                $table->unsignedBigInteger('DispatchedBy')->nullable()->after('DispatchedAt');
                $table->foreign('DispatchedBy')->references('id')->on('users')->onDelete('set null');
            }
        });
    }

    public function down(): void
    {
        Schema::table('Orders', function (Blueprint $table) {
            $table->dropForeign(['DispatchedBy']);
            $table->dropColumn(['LRNumber', 'TransportName', 'DispatchedAt', 'DispatchedBy']);
        });
    }
};
