<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\StockBatch;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BatchController extends Controller
{
    /**
     * GET /api/batches?product_id=X
     *
     * Lists batches for a product, oldest first (FIFO order) — this is
     * what the Marketing Review & Allocation screen shows as "Stock
     * detail" so the reviewer can see exactly which lots will be drawn
     * from before they allocate.
     */
    public function index(Request $request)
    {
        $this->authorizeStaff($request);

        $validated = $request->validate([
            'product_id' => 'required|integer|exists:Products,Id',
        ]);

        $product = Product::find($validated['product_id']);

        $batches = StockBatch::where('ProductId', $product->Id)
            ->orderBy('ReceivedAt')
            ->get();

        return response()->json([
            'product' => [
                'id' => $product->Id, 'code' => $product->Code, 'name' => $product->Name,
                'category' => $product->Category, 'warehouse' => $product->warehouse,
                'totalOnHand' => (int) $product->Quantity,
            ],
            'batches' => $batches->map(fn ($b) => [
                'id'           => $b->Id,
                'batchNo'      => $b->BatchNo,
                'warehouse'    => $b->Warehouse,
                'receivedQty'  => $b->ReceivedQty,
                'remainingQty' => $b->RemainingQty,
                'receivedAt'   => optional($b->ReceivedAt)->toDateString(),
                'notes'        => $b->Notes,
            ]),
        ]);
    }

    /**
     * POST /api/batches
     * Body: { productId, qty, receivedAt?, notes? }
     *
     * Records a new stock receipt (a batch/lot). Warehouse is derived
     * automatically from the product's category (Blouse -> rack, else ->
     * eb4), per the scope doc's Stock Visibility Logic — it isn't a
     * free-text field, so it can't drift from the rule.
     */
    public function store(Request $request)
    {
        $this->authorizeStaff($request);

        $validated = $request->validate([
            'productId'  => 'required|integer|exists:Products,Id',
            'qty'        => 'required|integer|min:1',
            'receivedAt' => 'nullable|date',
            'notes'      => 'nullable|string|max:255',
        ]);

        $product = Product::find($validated['productId']);
        $receivedAt = $validated['receivedAt'] ?? now();

        $batch = StockBatch::create([
            'BatchNo'      => $this->generateBatchNo(),
            'ProductId'    => $product->Id,
            'Warehouse'    => StockBatch::warehouseForCategory($product->Category),
            'ReceivedQty'  => $validated['qty'],
            'RemainingQty' => $validated['qty'],
            'ReceivedAt'   => $receivedAt,
            'Notes'        => $validated['notes'] ?? null,
            'CreatedBy'    => $request->user()->id,
        ]);

        // Keep Products.Quantity (the "available stock" figure used
        // everywhere else in the app — Allocation, Dashboards, etc.) in
        // sync with the sum of what's actually on hand across batches.
        $product->increment('Quantity', $validated['qty']);

        return response()->json($batch, 201);
    }

    private function generateBatchNo(): string
    {
        $last = StockBatch::orderByDesc('Id')->first();
        $next = $last ? ((int) Str::afterLast($last->BatchNo, '-')) + 1 : 1;
        return 'BATCH-' . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }

    private function authorizeStaff(Request $request): void
    {
        $role = $request->user()->role ?? null;
        abort_unless(in_array($role, ['admin', 'system_admin', 'super_admin'], true), 403, 'Not permitted.');
        if ($request->isMethod('post')) {
            abort_if($role === 'super_admin', 403, 'Super Admin is read-only.');
        }
    }
}
