<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Complaint extends Model
{
    protected $table = 'Complaints';
    protected $primaryKey = 'Id';

    const CREATED_AT = 'CreatedAt';
    const UPDATED_AT = 'UpdatedAt';

    protected $fillable = [
        'OrderId', 'CustomerId', 'Type', 'Description', 'Status',
        'Resolution', 'ResolvedBy', 'ResolvedAt',
    ];

    protected $casts = [
        'ResolvedAt' => 'datetime',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class, 'OrderId');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'CustomerId');
    }

    public function resolver()
    {
        return $this->belongsTo(User::class, 'ResolvedBy');
    }
}