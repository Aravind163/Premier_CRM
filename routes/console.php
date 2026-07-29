<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Credit Limit feature — checks every billed, unpaid order once a day and
// notifies whoever created it with an escalating "N day(s) exceeded"
// message. NOTE: this only fires if the server actually runs Laravel's
// scheduler — add a single cron entry:
//   * * * * * cd /path-to-app && php artisan schedule:run >> /dev/null 2>&1
Schedule::command('orders:notify-overdue')->dailyAt('08:00');