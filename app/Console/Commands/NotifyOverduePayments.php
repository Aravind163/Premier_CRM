<?php

namespace App\Console\Commands;

use App\Models\AppNotification;
use App\Models\Order;
use Illuminate\Console\Command;

/**
 * Credit Limit feature — run once a day (see routes/console.php) to tell
 * whoever created/owns a billed order that the customer's payment is now
 * overdue, escalating "1 day exceeded", "2 days exceeded", etc. Sends at
 * most one notification per order per day, so a payment that's 10 days
 * late doesn't spam 10 notifications in one run — just one that says
 * "10 days exceeded".
 */
class NotifyOverduePayments extends Command
{
    protected $signature = 'orders:notify-overdue';
    protected $description = 'Send an in-app notification for every order whose payment is overdue, once per day.';

    public function handle(): int
    {
        $overdue = Order::with(['customer', 'creator'])
            ->whereIn('Status', ['dispatched', 'delivered'])
            ->where('PaymentStatus', '!=', 'paid')
            ->whereNotNull('PaymentDueDate')
            ->where('PaymentDueDate', '<', now()->toDateString())
            ->get();

        $sent = 0;

        foreach ($overdue as $order) {
            $days = $order->days_overdue;
            if ($days < 1) {
                continue;
            }

            $recipientId = $order->CreatedBy;
            if (!$recipientId) {
                continue;
            }

            // Skip if we already sent today's notice for this order.
            $already = AppNotification::where('OrderId', $order->Id)
                ->where('Type', 'payment_overdue')
                ->whereDate('CreatedAt', now()->toDateString())
                ->exists();
            if ($already) {
                continue;
            }

            $customerName = $order->customer->Name ?? 'Customer';
            $plural = $days === 1 ? 'day' : 'days';

            AppNotification::send(
                $recipientId,
                'payment_overdue',
                "Payment overdue — {$days} {$plural} exceeded",
                "Order {$order->Code} for {$customerName}: payment is {$days} {$plural} past the due date (balance ₹" . number_format($order->balance_due, 2) . ").",
                $order->Id
            );
            $sent++;
        }

        $this->info("Sent {$sent} overdue-payment notification(s).");
        return self::SUCCESS;
    }
}