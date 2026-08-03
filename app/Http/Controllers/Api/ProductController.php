<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ProductController extends Controller
{
    /** GET /api/products */
    public function index(Request $request)
    {
        $query = Product::query();

        if ($category = $request->query('category')) {
            $query->where('Category', $category);
        }
        if ($subType = $request->query('sub_type')) {
            $query->where('SubType', $subType);
        }
        if ($status = $request->query('status')) {
            $query->where('Status', $status);
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('Name', 'like', "%{$search}%")
                  ->orWhere('Code', 'like', "%{$search}%");
            });
        }

        return response()->json($query->orderByDesc('Id')->get());
    }

    /** GET /api/products/{id} */
    public function show($id)
    {
        $product = Product::find($id);
        if (!$product) {
            return response()->json(['message' => 'Product not found'], 404);
        }
        return response()->json($product);
    }

    /** POST /api/products */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'tab'         => 'required|in:yarn,cloth',
            'subType'     => 'required|string|max:20',
            'name'        => 'required|string|max:191',
            // FIX: was 'required' — but ProductList.jsx's bulk Excel
            // import (handleImportRows) never collects/sends a price at
            // all, so every single bulk-imported row was failing this
            // validation (422) and getting silently swallowed by the
            // frontend's catch{failed++}. That's the actual reason
            // uploaded rows never showed up afterwards. Price genuinely
            // isn't known at quick-add/bulk-import time — default it to
            // 0 and let it be filled in later from the product's own
            // Edit screen, same as CreditLimit/MaxDiscountPct already
            // work as "fill in later" fields elsewhere in this app.
            'price'       => 'nullable|numeric|min:0',
            'qty'         => 'required|integer|min:0',
            'weight'      => 'nullable|string|max:500',
            'size'        => 'nullable|string|max:500',
            'color'       => 'nullable|string|max:10',
            // Accept any casing for quality — normalised to ucfirst below
            'quality'     => 'nullable|string|in:Premium,Standard,Economy,premium,standard,economy',
            'description' => 'nullable|string',
            'status'      => 'nullable|in:active,inactive',
            // FIX: sortNo/shadeNo were never validated/accepted at all,
            // so even though ProductList.jsx's Excel import already sent
            // them in the POST body, Laravel's validate() dropped them
            // before they ever reached Product::create(). Genuinely new
            // products could never get a real Sort No/Shade No — only
            // the originally-seeded catalog had anything resembling one,
            // and only because the seeder happened to store it in Code.
            'sortNo'      => 'nullable|string|max:50',
            'shadeNo'     => 'nullable|string|max:50',
        ]);

        $product = Product::create([
            'Code'        => $this->generateProductCode($validated['tab']),
            'SortNo'      => $validated['sortNo'] ?? null,
            'ShadeNo'     => $validated['shadeNo'] ?? null,
            'Name'        => $validated['name'],
            'Category'    => $validated['tab'],
            'SubType'     => Str::lower($validated['subType']),
            'Color'       => $validated['color'] ?? '#FFFFFF',
            'Weight'      => $validated['weight'] ?? null,
            'Size'        => $validated['size'] ?? null,
            'Price'       => $validated['price'] ?? 0,
            'Quantity'    => $validated['qty'],
            // Store as ucfirst so DB is consistent: Premium / Standard / Economy
            'Quality'     => ucfirst(Str::lower($validated['quality'] ?? 'standard')),
            'Description' => $validated['description'] ?? null,
            'Status'      => $validated['status'] ?? 'active',
            'CreatedBy'   => $request->user()->id,
        ]);

        return response()->json($product, 201);
    }

    /** PUT /api/products/{id} */
    public function update(Request $request, $id)
    {
        $product = Product::find($id);
        if (!$product) {
            return response()->json(['message' => 'Product not found'], 404);
        }

        $validated = $request->validate([
            'tab'         => 'sometimes|required|in:yarn,cloth',
            'subType'     => 'sometimes|required|string|max:20',
            'name'        => 'sometimes|required|string|max:191',
            'price'       => 'sometimes|required|numeric|min:0',
            'qty'         => 'sometimes|required|integer|min:0',
            'weight'      => 'nullable|string|max:500',
            'size'        => 'nullable|string|max:500',
            'color'       => 'nullable|string|max:10',
            // Accept any casing — normalised to ucfirst below
            'quality'     => 'nullable|string|in:Premium,Standard,Economy,premium,standard,economy',
            'description' => 'nullable|string',
            'status'      => 'nullable|in:active,inactive',
        ]);

        $map = [
            'tab' => 'Category', 'subType' => 'SubType', 'name' => 'Name',
            'price' => 'Price', 'qty' => 'Quantity', 'weight' => 'Weight',
            'size' => 'Size', 'color' => 'Color', 'quality' => 'Quality',
            'description' => 'Description', 'status' => 'Status',
        ];

        $update = [];
        foreach ($map as $reqKey => $column) {
            if (array_key_exists($reqKey, $validated)) {
                $value = $validated[$reqKey];
                if ($column === 'SubType') {
                    $value = Str::lower($value);
                }
                if ($column === 'Quality' && $value !== null) {
                    // Always store as ucfirst: Premium / Standard / Economy
                    $value = ucfirst(Str::lower($value));
                }
                $update[$column] = $value;
            }
        }

        $product->update($update);
        return response()->json($product);
    }

    /** DELETE /api/products/{id} */
    public function destroy($id)
    {
        $product = Product::find($id);
        if (!$product) {
            return response()->json(['message' => 'Product not found'], 404);
        }

        if ($product->orders()->exists()) {
            return response()->json([
                'message' => 'This product cannot be deleted because it has existing orders. Mark it as inactive instead.'
            ], 409);
        }

        $product->delete();
        return response()->json(['message' => 'Product deleted']);
    }

    private function generateProductCode(string $category): string
    {
        $prefix = $category === 'yarn' ? 'YRN' : 'CLT';
        $last = Product::where('Code', 'like', "{$prefix}-%")->orderByDesc('Id')->first();
        $nextNumber = $last ? ((int) \Illuminate\Support\Str::after($last->Code, "{$prefix}-")) + 1 : 1;
        return "{$prefix}-" . str_pad($nextNumber, 3, '0', STR_PAD_LEFT);
    }
}