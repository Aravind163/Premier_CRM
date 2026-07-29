<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AllocationBatchConsumption extends Model
{
    protected $table = 'allocation_batch_consumptions';
    protected $primaryKey = 'Id';

    const CREATED_AT = 'CreatedAt';
    const UPDATED_AT = null;

    protected $fillable = ['ProductAllocationId', 'BatchId', 'ConsumedQty'];

    protected $casts = ['ConsumedQty' => 'integer'];

    public function batch()
    {
        return $this->belongsTo(StockBatch::class, 'BatchId');
    }

    public function allocation()
    {
        return $this->belongsTo(ProductAllocation::class, 'ProductAllocationId');
    }
}
