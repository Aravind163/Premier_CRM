<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $table = 'Products';
    protected $primaryKey = 'Id';

    const CREATED_AT = 'CreatedAt';
    const UPDATED_AT = 'UpdatedAt';

    protected $appends = ['warehouse'];

    // FIX: SortNo/ShadeNo added (see the accompanying migration — these
    // columns didn't exist at all before). Without being listed here,
    // Product::create()/update() would silently discard them even once
    // the columns exist and the controller tries to pass them in, since
    // Eloquent mass-assignment only ever writes $fillable attributes.
    protected $fillable = [
        'Code', 'SortNo', 'ShadeNo', 'Name', 'Category', 'SubType', 'Color', 'Weight', 'Size',
        'Price', 'Quantity', 'Quality', 'Description', 'Status', 'CreatedBy',
    ];

    protected $casts = [
        'Price'    => 'decimal:2',
        'Quantity' => 'integer',
    ];

    protected static function booted(): void
    {
        static::creating(function (Product $product) {
            $product->Lcode = $product->Lcode ?? 'PRE-1';
            $product->Ccode = $product->Ccode ?? 'PRE';
        });
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'CreatedBy');
    }

    public function orders()
    {
        return $this->hasMany(Order::class, 'ProductId');
    }

    public function batches()
    {
        return $this->hasMany(StockBatch::class, 'ProductId');
    }

    /** Blouse -> Rack Stock, every other category -> EB4 Dispatch Warehouse Stock (scope doc's Stock Visibility Logic). */
    public function getWarehouseAttribute(): string
    {
        return StockBatch::warehouseForCategory($this->Category);
    }
}