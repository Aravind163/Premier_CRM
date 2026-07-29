<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // This migration is misnamed but was, as uploaded, missing the
        // actual `users` table — it only created `employee_mst`, whose
        // UserId foreign key then pointed at a `users` table that never
        // existed. On any fresh database that fails migration #1 outright
        // (SQL Server: "Foreign key ... references invalid table 'users'"),
        // which blocks every migration after it too. Restoring the base
        // table here, before employee_mst, is the fix — everything else
        // (Status/phone/dob/District/Taluk/Designation/etc.) is still
        // added incrementally by the later migrations exactly as before.
        if (!Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('email')->unique();
                $table->timestamp('email_verified_at')->nullable();
                $table->string('password');
                $table->string('role')->default('customer'); // customer | end_user | admin | system_admin | super_admin
                $table->rememberToken();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('employee_mst')) {
            Schema::create('employee_mst', function (Blueprint $table) {
                $table->id('Id');
                $table->unsignedBigInteger('UserId')->nullable();
                $table->string('Name');
                $table->string('Designation')->nullable();
                $table->string('District')->nullable();
                $table->string('Taluk')->nullable();
                $table->string('Lcode')->default('PRE-1');
                $table->string('Ccode')->default('PRE');
                $table->string('Role')->default('admin');   // admin or end_user
                $table->string('Status')->default('pending');
                $table->date('JoinedAt')->nullable();
                $table->timestamp('CreatedAt')->nullable();
                $table->timestamp('UpdatedAt')->nullable();

                $table->foreign('UserId')->references('id')->on('users')->onDelete('set null');
            });
        } else {
            // Add Role column if table exists but column missing
            if (!Schema::hasColumn('employee_mst', 'Role')) {
                Schema::table('employee_mst', function (Blueprint $table) {
                    $table->string('Role')->default('admin');
                });
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_mst');
        Schema::dropIfExists('users');
    }
};