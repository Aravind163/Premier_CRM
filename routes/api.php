<?php
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\LocationController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\ComplaintController;
use App\Http\Controllers\Api\AllocationController;
use App\Http\Controllers\Api\BatchController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\NotificationController;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me',      [AuthController::class, 'me']);

    Route::get('/dashboard',            [DashboardController::class, 'index']);
    Route::get('/dashboard/o2c',        [DashboardController::class, 'o2c']);
    Route::get('/dashboard/compliance', [DashboardController::class, 'compliance']);

    Route::post('/orders/bulk', [OrderController::class, 'storeBulk']);
    Route::apiResource('customers', CustomerController::class);
    Route::apiResource('products',  ProductController::class);
    Route::apiResource('orders',    OrderController::class);

    // Complaints — customer submits and views their own complaint history;
    // Marketing/System Admin resolves via the Claim Process workflow.
    Route::get('/complaints',              [ComplaintController::class, 'index']);
    Route::post('/complaints',             [ComplaintController::class, 'store']);
    Route::patch('/complaints/{id}/resolve', [ComplaintController::class, 'resolve']);

    // Quantity Allocation — Admin/System Admin decide how much of a
    // product each customer actually gets when total orders exceed stock.
    // Every save draws stock via FIFO from stock_batches (oldest first).
    Route::get('/allocations/products',    [AllocationController::class, 'products']);
    Route::get('/allocations/customers',   [AllocationController::class, 'customers']);
    Route::get('/allocations/by-customer', [AllocationController::class, 'byCustomer']);
    Route::post('/allocations/by-customer',[AllocationController::class, 'storeByCustomer']);
    Route::get('/allocations',          [AllocationController::class, 'index']);
    Route::post('/allocations',         [AllocationController::class, 'store']);
    Route::get('/allocations/{id}/batches', [AllocationController::class, 'batchBreakdown']);
    Route::get('/allocations/board', [AllocationController::class, 'board']);

    // Marketing Review -> Final Approval workflow (System Admin only) and
    // the flat list feeding the Sales Order page's four drill-down views.
    Route::get('/allocations/list',              [AllocationController::class, 'list']);
    Route::patch('/allocations/{id}/decision',    [AllocationController::class, 'decision']);
    Route::post('/allocations/bulk-decision',     [AllocationController::class, 'bulkDecision']);
    Route::post('/allocations/{id}/erp-transfer', [AllocationController::class, 'erpTransfer']);
    Route::post('/allocations/bulk-erp-transfer', [AllocationController::class, 'bulkErpTransfer']);

    // Stock batches (FIFO lots) — Rack (Blouse) vs EB4 Dispatch Warehouse.
    Route::get('/batches',  [BatchController::class, 'index']);
    Route::post('/batches', [BatchController::class, 'store']);

    // Invoices — generated against a dispatched/allocated order.
    Route::get('/invoices',                 [InvoiceController::class, 'index']);
    Route::get('/invoices/eligible-orders', [InvoiceController::class, 'eligibleOrders']);
    Route::post('/invoices',                [InvoiceController::class, 'store']);
    Route::patch('/invoices/{id}/status',   [InvoiceController::class, 'updateStatus']);

    // In-app notifications (order approved/declined/dispatched, claim resolved).
    Route::get('/notifications',            [NotificationController::class, 'index']);
    Route::patch('/notifications/{id}/read',[NotificationController::class, 'markRead']);
    Route::patch('/notifications/read-all', [NotificationController::class, 'markAllRead']);

    Route::patch('/customers/{id}/status', [CustomerController::class, 'updateStatus']);
    Route::patch('/orders/{id}/status',    [OrderController::class, 'updateStatus']);
    Route::patch('/orders/{id}/reject',    [OrderController::class, 'reject']);
    Route::patch('/orders/{id}/assign',    [OrderController::class, 'assign']);
    Route::patch('/orders/{id}/dispatch',  [OrderController::class, 'dispatch']);
    Route::patch('/orders/{id}/release-hold', [OrderController::class, 'releaseHold']);
    Route::patch('/orders/{id}/payment-due', [OrderController::class, 'updatePaymentDue']);
    Route::patch('/orders/{id}/record-payment', [OrderController::class, 'recordPayment']);
    Route::get('/credit-limit', [\App\Http\Controllers\Api\CreditLimitController::class, 'index']);
    Route::patch('/employees/{id}/status', [EmployeeController::class, 'updateStatus']);

    Route::get('/employees',          [EmployeeController::class, 'index']);
    Route::get('/employees/{id}',     [EmployeeController::class, 'show']);
    Route::post('/employees',         [EmployeeController::class, 'store']);
    Route::put('/employees/{id}',     [EmployeeController::class, 'update']);
    Route::patch('/employees/{id}',   [EmployeeController::class, 'update']);

    // Tamil Nadu district / taluk reference data — used for District
    // assignment (System Admin → Admin) and Taluk assignment (Admin → End User)
    Route::get('/locations/districts', [LocationController::class, 'districts']);
    Route::get('/locations/taluks',    [LocationController::class, 'taluks']);
    Route::get('/locations/taluks/all', [LocationController::class, 'allTaluks']);
    

});