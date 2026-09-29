<?php
define('LARAVEL_START', microtime(true));
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "======================================" . PHP_EOL;
echo "  Oracle ERP Transfer Verification" . PHP_EOL;
echo "======================================" . PHP_EOL . PHP_EOL;

// ── 1. Connection check ──────────────────────────────────────────────────────
echo "1. Oracle Connection" . PHP_EOL;
echo "   Host: " . env('DB_ORACLE_HOST') . ":" . env('DB_ORACLE_PORT') . PHP_EOL;
echo "   DB  : " . env('DB_ORACLE_DATABASE') . PHP_EOL;
try {
    DB::connection('oracle')->getPdo();
    echo "   Status: ✓ Connected" . PHP_EOL;
} catch (Exception $e) {
    echo "   Status: ✗ FAILED - " . $e->getMessage() . PHP_EOL;
    exit(1);
}

// ── 2. Row counts ────────────────────────────────────────────────────────────
echo PHP_EOL . "2. Oracle Table Row Counts" . PHP_EOL;
foreach (['SALESORDERIBEAN', 'SALESORDERLINEIBEAN'] as $tbl) {
    $cnt = DB::connection('oracle')->table($tbl)->count();
    echo "   {$tbl}: {$cnt} rows" . PHP_EOL;
}

// ── 3. Local transferred rows ────────────────────────────────────────────────
echo PHP_EOL . "3. Local CRM — Transfer Status" . PHP_EOL;

$hTotal      = DB::table('sale_order_header')->count();
$hTransferred= DB::table('sale_order_header')->whereNotNull('CrmOracleTransferredAt')->count();
$hPending    = $hTotal - $hTransferred;
echo "   sale_order_header : {$hTotal} total | {$hTransferred} transferred | {$hPending} pending" . PHP_EOL;

$lTotal      = DB::table('sale_order_line')->where('CrmAllocationStatus', 'approved')->count();
$lTransferred= DB::table('sale_order_line')->where('CrmErpStatus', 'erp_so_created')->count();
$lPending    = $lTotal - $lTransferred;
echo "   sale_order_line   : {$lTotal} approved | {$lTransferred} transferred | {$lPending} pending" . PHP_EOL;

// ── 4. Last 5 transferred headers ────────────────────────────────────────────
echo PHP_EOL . "4. Last 5 Headers Transferred to Oracle" . PHP_EOL;
$headers = DB::table('sale_order_header')
    ->whereNotNull('CrmOracleTransferredAt')
    ->orderByDesc('CrmOracleTransferredAt')
    ->limit(5)
    ->get(['CODE', 'RELATEDDEPENDENTID', 'CrmOracleImportCounter', 'CrmOracleRelatedDependentId', 'CrmOracleTransferredAt']);

if ($headers->isEmpty()) {
    echo "   (none yet)" . PHP_EOL;
} else {
    printf("   %-14s %-18s %-24s %-26s %s\n", 'CODE', 'LocalDepId', 'OracleImportCounter', 'OracleRelatedDepId', 'TransferredAt');
    echo "   " . str_repeat('-', 100) . PHP_EOL;
    foreach ($headers as $h) {
        printf("   %-14s %-18s %-24s %-26s %s\n",
            $h->CODE, $h->RELATEDDEPENDENTID,
            $h->CrmOracleImportCounter, $h->CrmOracleRelatedDependentId,
            $h->CrmOracleTransferredAt);
    }
}

// ── 5. Cross-check in Oracle ─────────────────────────────────────────────────
echo PHP_EOL . "5. Verifying Those Headers Exist in Oracle SALESORDERIBEAN" . PHP_EOL;
$transferred = DB::table('sale_order_header')
    ->whereNotNull('CrmOracleImportCounter')
    ->orderByDesc('CrmOracleTransferredAt')
    ->limit(5)
    ->pluck('CrmOracleImportCounter')
    ->toArray();

if (empty($transferred)) {
    echo "   (no transferred counters to check)" . PHP_EOL;
} else {
    foreach ($transferred as $counter) {
        $found = DB::connection('oracle')
            ->table('SALESORDERIBEAN')
            ->where('IMPORTAUTOCOUNTER', $counter)
            ->first(['IMPORTAUTOCOUNTER', 'CODE', 'RELATEDDEPENDENTID', 'IMPORTSTATUS']);

        if ($found) {
            $row = (array) $found;
            $row = array_change_key_case($row, CASE_UPPER);
            echo "   ✓ Counter {$counter} → CODE={$row['CODE']}  RelDepId={$row['RELATEDDEPENDENTID']}  ImportStatus={$row['IMPORTSTATUS']}" . PHP_EOL;
        } else {
            echo "   ✗ Counter {$counter} → NOT FOUND in Oracle SALESORDERIBEAN!" . PHP_EOL;
        }
    }
}

// ── 6. Last 5 transferred lines ───────────────────────────────────────────────
echo PHP_EOL . "6. Last 5 Lines Transferred to Oracle" . PHP_EOL;
$lines = DB::table('sale_order_line')
    ->where('CrmErpStatus', 'erp_so_created')
    ->orderByDesc('CrmErpTransferredAt')
    ->limit(5)
    ->get(['Id', 'FATHERID', 'CrmOracleImportCounter', 'CrmOracleRelatedDependentId', 'CrmErpTransferredAt']);

if ($lines->isEmpty()) {
    echo "   (none yet)" . PHP_EOL;
} else {
    printf("   %-6s %-14s %-24s %-26s %s\n", 'LineId', 'FATHERID', 'OracleImportCounter', 'OracleRelatedDepId', 'TransferredAt');
    echo "   " . str_repeat('-', 100) . PHP_EOL;
    foreach ($lines as $l) {
        printf("   %-6s %-14s %-24s %-26s %s\n",
            $l->Id, $l->FATHERID,
            $l->CrmOracleImportCounter, $l->CrmOracleRelatedDependentId,
            $l->CrmErpTransferredAt);
    }
}

// ── 7. Cross-check lines in Oracle ──────────────────────────────────────────
echo PHP_EOL . "7. Verifying Those Lines Exist in Oracle SALESORDERLINEIBEAN" . PHP_EOL;
$lineCounters = DB::table('sale_order_line')
    ->where('CrmErpStatus', 'erp_so_created')
    ->whereNotNull('CrmOracleImportCounter')
    ->orderByDesc('CrmErpTransferredAt')
    ->limit(5)
    ->pluck('CrmOracleImportCounter')
    ->toArray();

if (empty($lineCounters)) {
    echo "   (no transferred line counters to check)" . PHP_EOL;
} else {
    foreach ($lineCounters as $counter) {
        $found = DB::connection('oracle')
            ->table('SALESORDERLINEIBEAN')
            ->where('IMPORTAUTOCOUNTER', $counter)
            ->first(['IMPORTAUTOCOUNTER', 'FATHERID', 'RELATEDDEPENDENTID', 'IMPORTSTATUS']);

        if ($found) {
            $row = (array) $found;
            $row = array_change_key_case($row, CASE_UPPER);
            echo "   ✓ Counter {$counter} → FATHERID={$row['FATHERID']}  RelDepId={$row['RELATEDDEPENDENTID']}  ImportStatus={$row['IMPORTSTATUS']}" . PHP_EOL;
        } else {
            echo "   ✗ Counter {$counter} → NOT FOUND in Oracle SALESORDERLINEIBEAN!" . PHP_EOL;
        }
    }
}

echo PHP_EOL . "======================================" . PHP_EOL;
echo "  Done." . PHP_EOL;
echo "======================================" . PHP_EOL;
