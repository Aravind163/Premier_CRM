<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    protected $table = 'employee_mst';
    protected $primaryKey = 'Id';

    const CREATED_AT = 'CreatedAt';
    const UPDATED_AT = 'UpdatedAt';

    protected $fillable = [
        'UserId', 'Name', 'Designation', 'District', 'Taluk',
        'Lcode', 'Ccode', 'Role', 'Status', 'JoinedAt',
        // Added for area-assignment support
        'AssignedArea',
    ];

    protected $casts = [
        'JoinedAt' => 'date',
        // District/Taluk now support multiple areas per admin/end_user —
        // stored as a JSON array in the DB, always handled as a PHP array.
        'District' => 'array',
        'Taluk'    => 'array',
    ];

    protected static function booted(): void
    {
        static::creating(function (Employee $employee) {
            $employee->Lcode = $employee->Lcode ?? 'PRE-1';
            $employee->Ccode = $employee->Ccode ?? 'PRE';
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'UserId');
    }
}
