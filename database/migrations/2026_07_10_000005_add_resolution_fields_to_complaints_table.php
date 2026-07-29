<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Claim Process (O2C Step 14): a complaint is reviewed and closed out as
 * one of Settlement / Replacement / Credit Note. ResolutionType records
 * which; CreditNoteAmount is filled only for that path. Resolution /
 * ResolvedBy / ResolvedAt already existed on the Complaints table — this
 * just adds the missing classification + amount.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Complaints', function (Blueprint $table) {
            if (!Schema::hasColumn('Complaints', 'ResolutionType')) {
                $table->string('ResolutionType', 30)->nullable()->after('Status'); // settlement | replacement | credit_note | rejected
            }
            if (!Schema::hasColumn('Complaints', 'CreditNoteAmount')) {
                $table->decimal('CreditNoteAmount', 12, 2)->nullable()->after('ResolutionType');
            }
        });
    }

    public function down(): void
    {
        Schema::table('Complaints', function (Blueprint $table) {
            $table->dropColumn(['ResolutionType', 'CreditNoteAmount']);
        });
    }
};
