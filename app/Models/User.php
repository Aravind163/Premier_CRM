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
        'district', 'taluk', 'lcode', 'ccode', 'status',
        'phone', 'dob',
        'designation', 'assigned_area', 'approval_note',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'district' => 'array',
            'taluk'    => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (User $user) {
            $user->lcode = $user->lcode ?? 'PRE-1';
            $user->ccode = $user->ccode ?? 'PRE';

            if ($user->isDirty('password')) {
                $user->password = bcrypt($user->password);
            }
        });
    }
}