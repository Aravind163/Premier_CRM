<?php
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\LocationController;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me',      [AuthController::class, 'me']);

    Route::post('/orders/bulk', [OrderController::class, 'storeBulk']);
    Route::apiResource('customers', CustomerController::class);
    Route::apiResource('products',  ProductController::class);
    Route::apiResource('orders',    OrderController::class);

    Route::patch('/customers/{id}/status', [CustomerController::class, 'updateStatus']);
    Route::patch('/orders/{id}/status',    [OrderController::class, 'updateStatus']);
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
