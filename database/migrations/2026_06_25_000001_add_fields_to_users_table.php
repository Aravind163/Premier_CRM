<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'Status')) {
                $table->string('Status')->default('active')->after('role');
            }
            if (!Schema::hasColumn('users', 'phone')) {
                $table->string('phone')->nullable()->after('name');
            }
            if (!Schema::hasColumn('users', 'dob')) {
                $table->string('dob')->nullable()->after('phone'); // stored as ddmmyy
            }
            if (!Schema::hasColumn('users', 'District')) {
                $table->string('District')->nullable()->after('Status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['Status', 'phone', 'dob']);
        });
    }
};
