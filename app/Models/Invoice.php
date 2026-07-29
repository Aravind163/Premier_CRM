<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Invoice extends Model
{
    protected $table = 'invoices';
    protected $primaryKey = 'Id';

    const CREATED_AT = 'CreatedAt';
    const UPDATED_AT = 'UpdatedAt';

    protected $fillable = [
        'InvoiceNumber', 'OrderId', 'CustomerId', 'SubTotal', 'DiscountAmount',
        'TotalAmount', 'Status', 'IssuedBy', 'IssuedAt',
    ];

    protected $casts = [
        'SubTotal'       => 'decimal:2',
        'DiscountAmount' => 'decimal:2',
        'TotalAmount'    => 'decimal:2',
        'IssuedAt'       => 'datetime',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class, 'OrderId');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'CustomerId');
    }

    public function issuer()
    {
        return $this->belongsTo(User::class, 'IssuedBy');
    }
}
