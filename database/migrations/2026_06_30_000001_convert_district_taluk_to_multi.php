<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * District and Taluk now support MULTIPLE areas per admin / end_user
 * (e.g. one admin covering Madurai + Theni, or an end_user covering
 * multiple taluks). The columns already exist as strings; this migration:
 *
 *   1. Widens District/Taluk to TEXT (a JSON array of names can exceed
 *      the old varchar(255) once several districts/taluks are assigned).
 *   2. Wraps any existing plain-string value (e.g. "Madurai") into a
 *      JSON array (["Madurai"]) so old data keeps working with the new
 *      array cast on the Eloquent models.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('District')->nullable()->change();
            $table->text('Taluk')->nullable()->change();
        });
        Schema::table('employee_mst', function (Blueprint $table) {
            $table->text('District')->nullable()->change();
            $table->text('Taluk')->nullable()->change();
        });

        $this->wrapColumn('users', 'District');
        $this->wrapColumn('users', 'Taluk');
        $this->wrapColumn('employee_mst', 'District');
        $this->wrapColumn('employee_mst', 'Taluk');
    }

    public function down(): void
    {
        // Intentionally not reversible (would lose multi-area data).
    }

    private function wrapColumn(string $table, string $column): void
    {
        $pk = $table === 'users' ? 'id' : 'Id';
        $rows = DB::table($table)->whereNotNull($column)->where($column, '!=', '')->get([$pk, $column]);

        foreach ($rows as $row) {
            $value = $row->{$column};
            $decoded = json_decode($value, true);

            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                continue; // already a JSON array, leave as-is
            }

            DB::table($table)->where($pk, $row->{$pk})->update([
                $column => json_encode([$value]),
            ]);
        }
    }
};
