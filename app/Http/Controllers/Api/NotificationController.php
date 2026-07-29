<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /** GET /api/notifications */
    public function index(Request $request)
    {
        $notifications = AppNotification::where('UserId', $request->user()->id)
            ->orderByDesc('CreatedAt')
            ->limit(50)
            ->get();

        return response()->json([
            'unreadCount'   => $notifications->whereNull('ReadAt')->count(),
            'notifications' => $notifications,
        ]);
    }

    /** PATCH /api/notifications/{id}/read */
    public function markRead(Request $request, $id)
    {
        $notification = AppNotification::where('Id', $id)->where('UserId', $request->user()->id)->first();
        if (!$notification) {
            return response()->json(['message' => 'Notification not found.'], 404);
        }
        $notification->update(['ReadAt' => now()]);
        return response()->json($notification);
    }

    /** PATCH /api/notifications/read-all */
    public function markAllRead(Request $request)
    {
        AppNotification::where('UserId', $request->user()->id)->whereNull('ReadAt')->update(['ReadAt' => now()]);
        return response()->json(['message' => 'All notifications marked read.']);
    }
}
