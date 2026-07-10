<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Payment due date / credit term for a customer's bill.
 *
 * Every order gets a default credit term (15 days) once dispatched — the
 * due date is DispatchedAt + PaymentTermDays. Admin / End User can
 * manually reassign the due date later (e.g. a customer asks for more
 * time), which is recorded via PaymentDueDateSetBy / PaymentDueDateNote.
 *
 * PaymentDueDateSetBy is intentionally a plain nullable column with NO
 * database-level foreign key. SQL Server rejects a second cascading path
 * from Orders to users (it already has one via CreatedBy/AssignedTo), and
 * fighting that with NO ACTION / index tweaks isn't worth it for what is
 * just an audit/display field — the app never relies on the DB to enforce
 * or cascade this relationship.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Orders', function (Blueprint $table) {
            if (!Schema::hasColumn('Orders', 'PaymentTermDays')) {
                $table->unsignedInteger('PaymentTermDays')->default(15)->after('PaymentStatus');
            }
            if (!Schema::hasColumn('Orders', 'PaymentDueDate')) {
                $table->date('PaymentDueDate')->nullable()->after('PaymentTermDays');
            }
            if (!Schema::hasColumn('Orders', 'PaymentDueDateSetBy')) {
                $table->unsignedBigInteger('PaymentDueDateSetBy')->nullable()->after('PaymentDueDate');
            }
            if (!Schema::hasColumn('Orders', 'PaymentDueDateNote')) {
                $table->string('PaymentDueDateNote', 255)->nullable()->after('PaymentDueDateSetBy');
            }
        });
    }

    public function down(): void
    {
        Schema::table('Orders', function (Blueprint $table) {
            $table->dropColumn(['PaymentTermDays', 'PaymentDueDate', 'PaymentDueDateSetBy', 'PaymentDueDateNote']);
        });
    }
};