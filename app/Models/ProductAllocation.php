<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductAllocation extends Model
{
    protected $table = 'product_allocations';
    protected $primaryKey = 'Id';

    const CREATED_AT = 'CreatedAt';
    const UPDATED_AT = 'UpdatedAt';

    protected $fillable = [
        'ProductId', 'CustomerId', 'AllocatedQty', 'AllocatedBy',
        'Status', 'Remarks', 'ErpStatus', 'DecidedBy', 'DecidedAt', 'ErpTransferredAt',
    ];

    protected $casts = [
        'AllocatedQty' => 'integer',
        'DecidedAt' => 'datetime',
        'ErpTransferredAt' => 'datetime',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class, 'ProductId');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'CustomerId');
    }

    public function allocator()
    {
        return $this->belongsTo(User::class, 'AllocatedBy');
    }

    public function decider()
    {
        return $this->belongsTo(User::class, 'DecidedBy');
    }

    public function consumptions()
    {
        return $this->hasMany(AllocationBatchConsumption::class, 'ProductAllocationId');
    }
}