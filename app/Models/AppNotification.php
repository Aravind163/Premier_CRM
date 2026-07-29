<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppNotification extends Model
{
    protected $table = 'notifications_app';
    protected $primaryKey = 'Id';

    const CREATED_AT = 'CreatedAt';
    const UPDATED_AT = null;

    protected $fillable = ['UserId', 'Type', 'Title', 'Message', 'OrderId', 'ReadAt'];

    protected $casts = ['ReadAt' => 'datetime'];

    public function user()
    {
        return $this->belongsTo(User::class, 'UserId');
    }

    public function order()
    {
        return $this->belongsTo(Order::class, 'OrderId');
    }

    /** Fire-and-forget helper used from OrderController / ComplaintController. */
    public static function send(int $userId, string $type, string $title, string $message, ?int $orderId = null): void
    {
        static::create([
            'UserId'  => $userId,
            'Type'    => $type,
            'Title'   => $title,
            'Message' => $message,
            'OrderId' => $orderId,
        ]);
    }
}
