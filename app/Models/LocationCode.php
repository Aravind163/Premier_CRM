<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LocationCode extends Model
{
    // Dead/unused duplicate of app/Models/Employee.php, left over from
    // earlier development — it pointed at a legacy 'Employees' table that
    // nothing in the app actually reads or writes (LocationController
    // serves district/taluk data from a static file, not this model).
    // Renamed the class to match its filename (was literally `class
    // Employee`, a second declaration of the real Employee model) so
    // `composer dump-autoload` stops skipping it as a PSR-4 violation.
    // Left in place rather than deleted in case something elsewhere in
    // the original codebase reflects on the class name; nothing calls it.
    protected $table = 'Employees';

    protected $fillable = [
        'UserId', 'Name', 'Designation', 'District',
        'Taluk', 'Status', 'JoinedAt', 'Lcode', 'Ccode',
    ];

    const CREATED_AT = 'CreatedAt';
    const UPDATED_AT = 'UpdatedAt';

    protected $casts = [
        'JoinedAt' => 'date',
    ];

    protected static function booted(): void
    {
        static::creating(function ($model) {
            $model->Lcode = $model->Lcode ?? 'PRE-1';
            $model->Ccode = $model->Ccode ?? 'PRE';
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'UserId');
    }
}