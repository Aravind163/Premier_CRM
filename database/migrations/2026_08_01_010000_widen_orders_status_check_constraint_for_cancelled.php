<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Fixes: SQLSTATE[23000] ... The UPDATE statement conflicted with the
// CHECK constraint "CK_Orders_Status" ... table "dbo.Orders", column
// 'Status' ... set [Status] = cancelled ...
//
// This reads CK_Orders_Status's CURRENT definition straight from SQL
// Server (sys.check_constraints), drops it, and re-adds it with an extra
// `OR ([Status]='cancelled')` appended — so every status your app
// already allows (pending/approved/processing/declined/dispatched/
// delivered/etc.) keeps working exactly as before; 'cancelled' is simply
// added on top. It only touches this one named constraint on Orders —
// nothing else on the table.
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            DECLARE @definition NVARCHAR(MAX);
            SELECT @definition = definition
            FROM sys.check_constraints
            WHERE name = 'CK_Orders_Status';

            IF @definition IS NULL
            BEGIN
                RAISERROR('CK_Orders_Status constraint not found — check the constraint name and table.', 16, 1);
            END
            ELSE IF CHARINDEX('cancelled', @definition) = 0
            BEGIN
                ALTER TABLE dbo.Orders DROP CONSTRAINT CK_Orders_Status;

                DECLARE @sql NVARCHAR(MAX) = N'ALTER TABLE dbo.Orders ADD CONSTRAINT CK_Orders_Status CHECK (' + @definition + N' OR ([Status]=''cancelled''))';
                EXEC sp_executesql @sql;
            END
        ");
    }

    public function down(): void
    {
        // Not auto-reversible: we didn't capture the exact pre-change
        // constraint definition anywhere durable, so rolling back can't
        // safely reconstruct the original CHECK text on its own. If you
        // need to undo this, restore CK_Orders_Status from a DB backup,
        // or manually re-run the ALTER TABLE with the original list of
        // allowed statuses (minus 'cancelled').
    }
};