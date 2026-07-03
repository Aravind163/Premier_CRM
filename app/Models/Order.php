<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $table = 'Orders';
    protected $primaryKey = 'Id';

    const CREATED_AT = 'CreatedAt';
    const UPDATED_AT = 'UpdatedAt';

    protected $fillable = [
    'Code', 'CustomerId', 'ProductId', 'Category', 'SubType', 'Quantity',
    'PricePerUnit', 'DiscountPct', 'TotalAmount', 'Status', 'PaymentStatus',
    'DeliveryDate', 'Notes', 'CreatedBy', 'ApprovedBy',
    'OrderDetails',
    // Goods Dispatch (O2C Step 7)
    'LRNumber', 'TransportName', 'DispatchedAt', 'DispatchedBy',
];

protected $casts = [
    'PricePerUnit' => 'decimal:2',
    'DiscountPct'  => 'decimal:2',
    'TotalAmount'  => 'decimal:2',
    'DeliveryDate' => 'date',
    'OrderDetails' => 'array',
    'DispatchedAt' => 'datetime',
];

    protected static function booted(): void
    {
        static::creating(function (Order $order) {
            $order->Lcode = $order->Lcode ?? 'PRE-1';
            $order->Ccode = $order->Ccode ?? 'PRE';
        });
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'CustomerId');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'ProductId');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'CreatedBy');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'ApprovedBy');
    }

    public function dispatcher()
    {
        return $this->belongsTo(User::class, 'DispatchedBy');
    }
}
