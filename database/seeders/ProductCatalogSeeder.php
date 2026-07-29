<?php

namespace Database\Seeders;

use App\Models\Product;
use Illuminate\Database\Seeder;

/**
 * ProductCatalogSeeder
 *
 * Loads the client's real product catalog (Blouse, Dhoti, Cotton Dhoti,
 * Uniform Shirting, Uniform Suiting, Premier No.1 Shirting) as given —
 * Sort No -> Code, Product Name/Article -> Name, Type -> Description,
 * Colour (where given) -> Color swatch.
 *
 * No price/stock quantity was supplied for any of these, so every row
 * gets the same placeholder Price (100) and Quantity (1000) — update
 * these for real from Master > Products once seeded; the point of this
 * seeder is just to get the real catalog (names, sort numbers, subtypes)
 * into the system so Product Selection has real data to show.
 *
 * Safe to re-run: matches on Name + SubType + Description and updates in
 * place rather than duplicating rows. (Not matched on Code — Code has a
 * table-wide UNIQUE constraint, and the client's raw Sort Nos repeat
 * across different products, so Code is auto-deduplicated with a "-2",
 * "-3"... suffix on collision instead of being used as the match key.)
 *
 * Run with:
 *   php artisan db:seed --class=Database\\Seeders\\ProductCatalogSeeder
 */
class ProductCatalogSeeder extends Seeder
{
    // Colour-group words used in the "Premier No 1 Product Shirting" sheet
    // aren't literal colors — they're tone groupings. Mapped to a
    // representative swatch just so the Colour column isn't blank.
    private const COLOR_MAP = [
        'white' => '#FFFFFF',
        'dark'  => '#37474F',
        'light' => '#ECEFF1',
    ];

    // Color is a NOT NULL column in the real DB — every row needs a real
    // value. Cycled dummy swatches for rows with no real colour given by
    // the client (per "you can put dummy data" for anything cosmetic).
    private const DUMMY_SWATCHES = ['#8FD9A8', '#7FD1E0', '#E893C9', '#9A9AA5', '#F0A15C', '#B7A6E0'];

    private function fallbackColor(int $i): string
    {
        return self::DUMMY_SWATCHES[$i % count(self::DUMMY_SWATCHES)];
    }

    // Code has a table-wide UNIQUE constraint (UQ_Products_Code), but the
    // client's raw Sort Nos repeat across different products (e.g. 6675
    // is reused for 4 different Dhoti variants) — real catalogs often
    // share a "sort/style" number across sub-variants. Keep the first
    // occurrence of a Sort No exactly as given; every later collision
    // gets a "-2", "-3"... suffix so the real number stays visible while
    // satisfying the DB constraint.
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

        $i = 0;
        foreach ($subtypes as $subType => $rows) {
            foreach ($rows as [$code, $name, $type]) {
                Product::updateOrCreate(
                    ['Name' => $name, 'SubType' => $subType, 'Description' => $type],
                    [
                        'Code'        => $this->uniqueCode($code),
                        'Category'    => 'cloth',
                        // No colour given for these sheets — dummy swatch, cycled for variety.
                        'Color'       => $this->fallbackColor($i++),
                        'Price'       => 100,
                        'Quantity'    => 1000,
                        'Quality'     => 'Standard',
                        'Status'      => 'active',
                        'CreatedBy'   => $creatorId,
                    ]
                );
            }
        }

        // "Premier No 1 Product Shirting" — different column layout
        // (Article, Sort No, Type, colour), including a few rows that
        // actually give a colour tone.
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

        foreach ($premierShirting as [$name, $code, $type, $colourWord]) {
            Product::updateOrCreate(
                ['Name' => $name, 'SubType' => 'Premier Shirting', 'Description' => $type],
                [
                    'Code'        => $this->uniqueCode($code),
                    'Category'    => 'cloth',
                    'Color'       => $colourWord
                        ? (self::COLOR_MAP[strtolower($colourWord)] ?? $this->fallbackColor($i))
                        : $this->fallbackColor($i),
                    'Price'       => 100,
                    'Quantity'    => 1000,
                    'Quality'     => 'Standard',
                    'Status'      => 'active',
                    'CreatedBy'   => $creatorId,
                ]
            );
            $i++;
        }

        $total = array_sum(array_map('count', $subtypes)) + count($premierShirting);
        $this->command?->info("ProductCatalogSeeder: seeded/updated {$total} products across " . (count($subtypes) + 1) . " subtypes.");
    }
}