<?php
namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, Notifiable;

    protected $fillable = [
        'name', 'email', 'password', 'role',
        'District', 'Taluk', 'Lcode', 'Ccode', 'Status',
        'phone', 'dob',
        // Added for end-user / area-assignment support
        'Designation', 'Taluk', 'AssignedArea', 'ApprovalNote',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected static function booted(): void
    {
        static::creating(function (User $user) {
            $user->Lcode = $user->Lcode ?? 'PRE-1';
            $user->Ccode = $user->Ccode ?? 'PRE';
        });
    }

    // No hashed cast — passwords stored plain for admin/end_user, bcrypt for super/system admin
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            // District/Taluk now support multiple areas — stored as JSON,
            // always handled as a PHP array on the model.
            'District' => 'array',
            'Taluk'    => 'array',
        ];
    }
}