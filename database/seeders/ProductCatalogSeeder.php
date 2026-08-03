<?php

namespace Database\Seeders;

use App\Models\Product;
use Illuminate\Database\Seeder;

/**
 * ProductCatalogSeeder
 *
 * FIX — this catalog has been seeded 4-5 separate times by different
 * versions of this file over the course of development, each using a
 * slightly different SubType casing ("Dhoti" vs "dhoti") or Description
 * format ("BLD & DYED" vs the much older "Sort No: 1520" placeholder
 * text), and a couple of runs even used a completely different SubType
 * string for the two Cotton Dhoti sheets ("BO Grey - Dhothies" instead
 * of "Cotton Dhoti Grey"). Because `updateOrCreate()`'s match key never
 * lined up between those runs, every re-run silently INSERTED a fresh
 * duplicate instead of updating the existing row — the Products table
 * ended up with 3-5 copies of "Pratista", "Chakravarthy", etc, each with
 * different (and often wrong/empty) Code/SortNo/Description values, and
 * the app would show whichever duplicate the query happened to return.
 *
 * This version is self-cleaning and runs in two clean phases:
 *   1. PURGE — delete every existing row for every (Name, SubType) pair
 *      in this catalog, searched across every SubType spelling/casing
 *      this file (or an earlier version of it) has ever used. Done once
 *      per distinct pair, up front, before any inserts — NOT inside the
 *      per-row insert loop, since several products repeat the same Name
 *      with different variants in the same SubType (e.g. "Wimbledon
 *      Supreme" appears twice, "Senator" appears twice); purging inside
 *      that loop would wipe out the first variant right before
 *      inserting the second.
 *   2. INSERT — create exactly one fresh row per catalog line.
 *
 * Run this seeder a hundred times and you always end up with exactly
 * the same single row per catalog line — never a duplicate.
 *
 * Sort No -> Code AND SortNo (both — nothing depends on Code alone
 * anymore), Product Name/Article -> Name, Type -> Description, Colour
 * (where given) -> Color swatch. SubType is always written in the exact
 * capitalization the frontend's TYPE_GROUPS expects (Blouse, Dhoti,
 * Cotton Dhoti Grey, Cotton Dhoti Fabric, Uniform Shirting, Uniform
 * Suiting, Premier Shirting) so tab grouping is consistent everywhere.
 *
 * Run with:
 *   php artisan db:seed --class="Database\Seeders\ProductCatalogSeeder"
 */
class ProductCatalogSeeder extends Seeder
{
    private const COLOR_MAP = [
        'white' => '#FFFFFF',
        'dark'  => '#37474F',
        'light' => '#ECEFF1',
    ];

    private const DUMMY_SWATCHES = ['#8FD9A8', '#7FD1E0', '#E893C9', '#9A9AA5', '#F0A15C', '#B7A6E0'];

    private function fallbackColor(int $i): string
    {
        return self::DUMMY_SWATCHES[$i % count(self::DUMMY_SWATCHES)];
    }

    // Code still gets a "-2"/"-3" suffix on collision (table-wide UNIQUE
    // constraint on Code) — SortNo does NOT get this suffix, since it
    // has no such constraint and should show the real repeated number
    // exactly like the source sheet (e.g. "6675" appearing 4 times).
    private array $usedCodes = [];

    private function uniqueCode(string $rawCode): string
    {
        if (!isset($this->usedCodes[$rawCode])) {
            $this->usedCodes[$rawCode] = 1;
            return $rawCode;
        }
        $this->usedCodes[$rawCode]++;
        return $rawCode . '-' . $this->usedCodes[$rawCode];
    }

    // Every SubType spelling/casing this catalog has ever been seeded
    // under, keyed by the ONE correct/current SubType — used purely to
    // find and delete old duplicates before inserting the clean row.
    private const SUBTYPE_ALIASES = [
        'Blouse'              => ['Blouse', 'blouse'],
        'Dhoti'                => ['Dhoti', 'dhoti'],
        'Cotton Dhoti Grey'    => ['Cotton Dhoti Grey', 'cotton dhoti grey', 'BO Grey - Dhothies'],
        'Cotton Dhoti Fabric'  => ['Cotton Dhoti Fabric', 'cotton dhoti fabric', 'BO Fabric - Dhothies'],
        'Uniform Shirting'     => ['Uniform Shirting', 'uniform shirting'],
        'Uniform Suiting'      => ['Uniform Suiting', 'uniform suiting'],
        'Premier Shirting'     => ['Premier Shirting', 'premier shirting', 'others'],
    ];

    /**
     * Delete every existing row for this exact product Name that sits
     * under any past spelling/casing of $canonicalSubType — regardless
     * of what garbage Code/Description/SortNo that old duplicate has.
     */
    private function purgeOldDuplicates(string $name, string $canonicalSubType): void
    {
        $aliases = self::SUBTYPE_ALIASES[$canonicalSubType] ?? [$canonicalSubType];
        Product::where('Name', $name)->whereIn('SubType', $aliases)->delete();
    }

    public function run(): void
    {
        $creatorId = \DB::table('users')->where('role', 'super_admin')->value('id')
            ?? \DB::table('users')->orderBy('id')->value('id');

        $subtypes = [
            'Blouse' => [
                ['1520', 'Ruby', 'BLD & DYED'],
                ['1978', 'Pratista', 'BLD & DYED'],
                ['1980', 'Top Star', 'BLD & DYED'],
            ],

            'Dhoti' => [
                ['6675', 'Chakravarthy', '3.7 & 7.4'],
                ['6642', 'Chakravarthy BB', '3.7'],
                ['6675', 'Chakravarthy Premium', '3.7 Box'],
                ['6605', 'Chakravarthy supreme', '8*132 (Grey Bag & Box)'],
                ['6705', 'Chakravarthy Super Dlx', '8*137 (Grey Bag)'],
                ['6805', 'Chakravarthy Super Dlx', '9*137 (Grey Bag)'],
                ['6606', 'Chalukya', '3.7 & 7.4'],
                ['6674', 'Chalukya BB', '3.7'],
                ['6900', 'Cool touch', '3.7 (Box)'],
                ['6701', 'Chatrapathi Maharaja Super Dlx', '8*137 (Box)'],
                ['6801', 'Chatrapathi Maharaja Super Dlx', '9*137 (Box)'],
                ['6675', 'Ever fresh - Anti Microbial', '3.7'],
                ['6171', 'Kerala Express', '3.7 Grey Bag'],
                ['6675', 'Mahasamrat 3.7 Box', '3.7 & 7.4 (Box)'],
                ['6605', 'Mahasamrat Supreme', '8*132 (Box)'],
                ['6705', 'Mahasamrat Super Dlx', '8*137 (Box)'],
                ['6805', 'Mahasamrat Super Dlx', '9*137 (Box)'],
                ['6636', 'Mourya Supreme', '8*132 (Grey Bag)'],
                ['6600', 'Prime king', '3.7 & 7.4'],
                ['6723', 'Shahuji Maharaj Super Dlx', '8*137'],
                ['6725', 'Shahuji Maharaj Super Dlx', '9*137'],
                ['6718', 'Shivaji supreme', '8*132 (Box)'],
                ['6719', 'Shivaji super Dlx', '8*137 (Box)'],
                ['6720', 'Shivaji super Dlx', '9*137 (Box)'],
                ['6906', 'Sugantham', '3.7'],
                ['6905', 'Vasanth Utsav', '8*132 (Box)'],
                ['6705', 'Vasanth Utsav Deluxe', '8*137 (Box)'],
                ['6805', 'Vasanth Utsav Deluxe', '9*137 (Box)'],
                ['6999', 'Vasantham', '3.7 & 7.4 (Box)'],
            ],

            'Cotton Dhoti Grey' => [
                ['8531', 'Governor Spl', '3.7 & 7.4'],
                ['8532', 'Prime Minister Spl', '3.7 & 7.4'],
                ['8547', 'Bharat Ratna Spl', '3.7 & 7.4'],
                ['8610', 'Rastrapathy Super Dlx', '8*137'],
                ['8611', 'Governor Super Dlx', '8*137 (Box)'],
                ['8613', 'Governor Supreme x 8*132', '8*132 (Grey Bag)'],
            ],

            'Cotton Dhoti Fabric' => [
                ['2308', 'Ashoka', '3.7'],
                ['2377', 'Real Diamond', '3.65'],
                ['2503', 'Chiranjeevi 2 in 1', '2 in 1'],
                ['2094', 'Chiranjeevi 3 in 1', '3 in 1'],
                ['2009', 'Rajaraja', '3.65'],
            ],

            'Uniform Shirting' => [
                ['1481', 'Senator', 'Bld/Dyed'],
                ['1481', 'Senator', '503 R.Blue'],
                ['1481', 'Grandslam', 'Bld/Dyed'],
                ['1257', 'Silver Touch/ Super Touch', 'Bld'],
                ['1257', 'Silver Touch/ Super Touch', 'Dyed'],
                ['2138', 'Swiss Cotton', 'Bld'],
                ['2138', 'Swiss Cotton Spl', 'Dyed'],
                ['2738', 'ACC', 'Bld'],
            ],

            'Uniform Suiting' => [
                ['5263', 'Wimbledon Supreme', 'Bld/Dyed'],
                ['5263', 'Wimbledon Supreme', '541 S.Green'],
                ['5263', 'Windsor Supreme', 'Spl Maroon'],
                ['5263', 'Windsor Supreme', 'R.Blue/G.Blue'],
                ['2788', 'Major', 'Fiber Dyed'],
                ['2788', 'Champion (Matty)', 'Fiber Dyed'],
                ['5263/5264', 'Victoria', 'Bld/Dyed'],
                ['2005', 'Winchester Spl', 'Bld/Dyed'],
                ['2005', 'Winchester Spl', 'R.Blue/G.Blue/S.Green'],
            ],
        ];

        $premierShirting = [
            ['BIANCO Collection', 'Diff dobbies', 'BLD', 'White'],
            ['BIANCO Collection', 'Diff dobbies', 'Black', 'Dark'],
            ['BIANCO Collection', 'Diff dobbies', 'Grey', 'Dark'],
            ['BIANCO Collection', 'Diff dobbies', 'Ivory', 'Light'],
            ['BIANCO Collection', 'Diff dobbies', 'Pink', 'Light'],
            ['BIANCO Collection', 'Diff dobbies', 'Sky', 'Light'],
            ['Breeze', '32625', 'BLD', null],
            ['Breeze', '32625', 'Dyed', null],
            ['Pearl', '32626', 'BLD', null],
            ['Copper (Pearl dyed)', '32626', 'Dyed', null],
            ['Opal', '32627', 'BLD', null],
            ['Oscar (Opal dyed)', '32627', 'Dyed', null],
            ['Marbido', '32604', 'BLD', null],
            ['Marbido', '32604', 'Dyed', null],
            ['Elite', 'DR22F147 to 155', 'YD Slub', null],
            ['Magnus', 'DR22F156 to 163', 'YD Slub', null],
            ['Lumino', 'DR23E01 to 14', 'YD Dyed', null],
            ['Denver', '7728', 'BLD', null],
            ['Montano', '9721', 'BLD', null],
            ['Montecarlo', '32163', 'BLD', null],
            ['Light of peace', '32316', 'BLD', null],
            ['32194', '32194', 'BLD', null],
            ['32160', '32160', 'BLD', null],
            ['Admiral', '9720', 'BLD', null],
            ['32963', '32963', 'BLD', null],
            ['Classmate', '2068', 'YD Dyed', null],
            ['Classmate Fancy Checks', '2068', 'YD Dyed', null],
            ['School Star Fancy', '2073', 'YD Dyed', null],
            ['Chinmaya Spl', 'CSPL003', 'YD Dyed', null],
        ];

        // ── PHASE 1: PURGE ──────────────────────────────────────────
        // One purge per distinct (Name, SubType) pair, done up front —
        // never inside the insert loop below, since names like
        // "Wimbledon Supreme" or "Senator" repeat across two variant
        // rows in the same SubType.
        foreach ($subtypes as $subType => $rows) {
            $seenNames = [];
            foreach ($rows as [, $name, ]) {
                if (isset($seenNames[$name])) continue;
                $seenNames[$name] = true;
                $this->purgeOldDuplicates($name, $subType);
            }
        }
        $seenPremierNames = [];
        foreach ($premierShirting as [$name, , ,]) {
            if (isset($seenPremierNames[$name])) continue;
            $seenPremierNames[$name] = true;
            $this->purgeOldDuplicates($name, 'Premier Shirting');
        }

        // ── PHASE 2: INSERT ─────────────────────────────────────────
        $i = 0;
        foreach ($subtypes as $subType => $rows) {
            foreach ($rows as [$code, $name, $type]) {
                Product::create([
                    'Name'        => $name,
                    'SubType'     => $subType,
                    'Code'        => $this->uniqueCode($code),
                    'SortNo'      => $code,
                    'Category'    => 'cloth',
                    'Color'       => $this->fallbackColor($i++),
                    'Price'       => 100,
                    'Quantity'    => 1000,
                    'Quality'     => 'Standard',
                    'Description' => $type,
                    'Status'      => 'active',
                    'CreatedBy'   => $creatorId,
                ]);
            }
        }

        foreach ($premierShirting as [$name, $code, $type, $colourWord]) {
            Product::create([
                'Name'        => $name,
                'SubType'     => 'Premier Shirting',
                'Code'        => $this->uniqueCode($code),
                'SortNo'      => $code,
                'Category'    => 'cloth',
                'Color'       => $colourWord
                    ? (self::COLOR_MAP[strtolower($colourWord)] ?? $this->fallbackColor($i))
                    : $this->fallbackColor($i),
                'Price'       => 100,
                'Quantity'    => 1000,
                'Quality'     => 'Standard',
                'Description' => $type,
                'Status'      => 'active',
                'CreatedBy'   => $creatorId,
            ]);
            $i++;
        }

        $total = array_sum(array_map('count', $subtypes)) + count($premierShirting);
        $this->command?->info("ProductCatalogSeeder: cleaned duplicates and seeded {$total} products across " . (count($subtypes) + 1) . " subtypes.");
    }
}