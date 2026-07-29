<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockBatch extends Model
{
    protected $table = 'stock_batches';
    protected $primaryKey = 'Id';

    const CREATED_AT = 'CreatedAt';
    const UPDATED_AT = 'UpdatedAt';

    protected $fillable = [
        'BatchNo', 'ProductId', 'Warehouse', 'ReceivedQty', 'RemainingQty',
        'ReceivedAt', 'Notes', 'CreatedBy',
    ];

    protected $casts = [
        'ReceivedQty'  => 'integer',
        'RemainingQty' => 'integer',
        'ReceivedAt'   => 'datetime',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class, 'ProductId');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'CreatedBy');
    }

    /** Blouse category lives on the Rack; every other category lives in the EB4 Dispatch Warehouse. */
    public static function warehouseForCategory(?string $category): string
    {
        return strtolower((string) $category) === 'blouse' ? 'rack' : 'eb4';
    }
}
