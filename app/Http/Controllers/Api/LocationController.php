<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class LocationController extends Controller
{
    /**
     * Tamil Nadu district → taluk reference data.
     * Loaded from a static file so no DB seeding is required.
     */
    private function data(): array
    {
        return require base_path('database/data/tn_districts_taluks.php');
    }

    /**
     * GET /api/locations/districts
     * Returns the full list of TN districts (used by System Admin when
     * assigning a District to an Admin).
     */
    public function districts()
    {
        $districts = array_keys($this->data());
        sort($districts);
        return response()->json($districts);
    }

    /**
     * GET /api/locations/taluks?district=Madurai
     * GET /api/locations/taluks?district[]=Madurai&district[]=Theni
     * Returns taluks for one or more districts (used by an Admin when
     * assigning Taluk(s) to an End User — an admin assigned to multiple
     * districts gets the combined taluk list).
     */
    public function taluks(Request $request)
    {
        $request->validate(['district' => 'required']);

        $data = $this->data();
        $districts = (array) $request->district;

        $taluks = [];
        foreach ($districts as $district) {
            // Case-insensitive match in case the stored District value differs in casing
            $key = collect(array_keys($data))->first(
                fn ($d) => strcasecmp($d, $district) === 0
            );
            if ($key) {
                $taluks = array_merge($taluks, $data[$key]);
            }
        }

        return response()->json(array_values(array_unique($taluks)));
    }
}
