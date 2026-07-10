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

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me',      [AuthController::class, 'me']);

    Route::get('/dashboard',     [DashboardController::class, 'index']);
    Route::get('/dashboard/o2c', [DashboardController::class, 'o2c']);

    Route::post('/orders/bulk', [OrderController::class, 'storeBulk']);
    Route::apiResource('customers', CustomerController::class);
    Route::apiResource('products',  ProductController::class);
    Route::apiResource('orders',    OrderController::class);

    // Complaints — customer submits and views their own complaint history
    Route::get('/complaints',  [ComplaintController::class, 'index']);
    Route::post('/complaints', [ComplaintController::class, 'store']);

    // Quantity Allocation — Admin/System Admin decide how much of a
    // product each customer actually gets when total orders exceed stock.
    Route::get('/allocations/products',    [AllocationController::class, 'products']);
    Route::get('/allocations/customers',   [AllocationController::class, 'customers']);
    Route::get('/allocations/by-customer', [AllocationController::class, 'byCustomer']);
    Route::post('/allocations/by-customer',[AllocationController::class, 'storeByCustomer']);
    Route::get('/allocations',          [AllocationController::class, 'index']);
    Route::post('/allocations',         [AllocationController::class, 'store']);

    Route::patch('/customers/{id}/status', [CustomerController::class, 'updateStatus']);
    Route::patch('/orders/{id}/status',    [OrderController::class, 'updateStatus']);
    Route::patch('/orders/{id}/assign',    [OrderController::class, 'assign']);
    Route::patch('/orders/{id}/dispatch',  [OrderController::class, 'dispatch']);
    Route::patch('/orders/{id}/payment-due', [OrderController::class, 'updatePaymentDue']);
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
});