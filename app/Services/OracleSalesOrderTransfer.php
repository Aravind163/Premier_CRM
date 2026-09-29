<?php

namespace App\Services;

use App\Models\SaleOrderHeader;
use App\Models\SaleOrderLine;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * The actual "Transfer to ERP" write: inserts one sale_order_line (and its
 * header, the first time it's needed) into Oracle's live
 * SALESORDERIBEAN / SALESORDERLINEIBEAN tables.
 *
 * WHY NOT REUSE our own IMPORTAUTOCOUNTER / RELATEDDEPENDENTID:
 * sale_order_header/sale_order_line number themselves from our own local
 * counter (config/sale_order.php), which runs completely independently of
 * Oracle's live tables — other systems keep inserting into Oracle on
 * their own, so our numbers will eventually collide with a real Oracle
 * row. Both real tables have IMPORTAUTOCOUNTER as their ONLY primary key,
 * with no trigger/sequence to fill it for us (confirmed against Oracle
 * directly), so every insert needs a value Oracle has genuinely never
 * used. This class asks Oracle for its own live MAX(...)+1 at the moment
 * of transfer and records what was actually used — see the
 * 2026_09_26_000001 migration for where those go.
 *
 * ATOMICITY: Oracle and our SQL Server database are two separate
 * connections — there is no single transaction spanning both. So:
 *   - The header is only ever marked transferred (CrmOracleTransferredAt)
 *     AFTER its Oracle insert actually succeeds.
 *   - A line is only ever marked CrmErpStatus = 'erp_so_created' AFTER
 *     its own Oracle insert actually succeeds.
 *   - If the header insert fails, the line insert is never attempted.
 *   - If the line insert fails after the header succeeded, that's fine:
 *     the header now legitimately exists in Oracle, and re-clicking
 *     Transfer later will find it already marked transferred and just
 *     retry the line.
 * Nothing here is retried automatically on connectivity failures (e.g.
 * the ORA-12170 timeout seen in production) — those are surfaced as a
 * clear, distinct error so the button can be safely clicked again.
 */
class OracleSalesOrderTransfer
{
    private const HEADER_TABLE = 'SALESORDERIBEAN';
    private const LINE_TABLE   = 'SALESORDERLINEIBEAN';
    private const MAX_ATTEMPTS = 5;

    /**
     * Every DATE column on each real Oracle table (confirmed against the
     * client's SOBean.xlsx layout — same columns our own sale_order_header/
     * sale_order_line classified as datetime). Oracle's DATE type has NO
     * fractional-second component, so a value like the ones SQL Server
     * hands us — "2026-09-25 12:54:00.776" (DATETIME2(3)) — fails with
     * ORA-01830 ("date format picture ends before converting entire input
     * string") the instant it's bound as a plain string: the trailing
     * ".776" has nowhere to go. Every value in these columns is explicitly
     * wrapped in TO_DATE(..., 'YYYY-MM-DD HH24:MI:SS') below instead of
     * relying on Oracle's implicit (and session-dependent) string-to-date
     * conversion.
     */
    private const HEADER_DATE_COLUMNS = [
        'ORDERDATE', 'INITIALDATE', 'FINALDATE', 'EXTERNALREFERENCEDATE', 'INTERNALREFERENCEDATE',
        'REQUIREDDUEDATE', 'CONFIRMEDDUEDATE', 'CONDITIONRETRIEVINGDATE', 'ALAPPLICATIONDATE',
        'ADVANCELICENSEDATE', 'IMPCREATIONDATETIME', 'IMPLASTUPDATEDATETIME', 'IMPORTDATETIME',
    ];
    private const LINE_DATE_COLUMNS = [
        'EXTERNALREFERENCEDATE', 'INTERNALREFERENCEDATE', 'CONFIRMEDDELIVERYDATE', 'REQUIREDDUEDATE',
        'CONDITIONRETRIEVINGDATE', 'IPPOLICYDATE', 'POLICYEXPIRYDATE',
        'IMPCREATIONDATETIME', 'IMPLASTUPDATEDATETIME', 'IMPORTDATETIME',
    ];

    /**
     * Transfers one allocated line to Oracle, inserting its header first
     * if this is the first line of that header ever transferred.
     *
     * @return array{success:bool, message:string, alreadyTransferred?:bool}
     */
    public function transferLine(SaleOrderLine $line): array
    {
        if ($line->CrmErpStatus === 'erp_so_created') {
            return ['success' => true, 'message' => 'Already transferred.', 'alreadyTransferred' => true];
        }

        $header = SaleOrderHeader::where('RELATEDDEPENDENTID', $line->FATHERID)->first();
        if (!$header) {
            return ['success' => false, 'message' => 'This line has no header row to transfer with it.'];
        }

        if (!$header->CrmOracleTransferredAt) {
            $result = $this->transferHeader($header);
            if (!$result['success']) {
                return $result; // never attempt the line without its header
            }
            $header->refresh();
        }

        return $this->transferLineRow($header, $line);
    }

    private function transferHeader(SaleOrderHeader $header): array
    {
        $columns = app(SaleOrderService::class)->exportColumns(SaleOrderHeader::class);
        $row = $this->castDates($header->only($columns), self::HEADER_DATE_COLUMNS);

        try {
            [$counter, $dependentId] = $this->insertWithRetry(self::HEADER_TABLE, function (int $counter, int $dependentId) use ($row) {
                return array_merge($row, [
                    'IMPORTAUTOCOUNTER'   => $counter,
                    'RELATEDDEPENDENTID'  => $dependentId,
                ]);
            });
        } catch (Throwable $e) {
            return $this->failure($e, 'header');
        }

        $header->forceFill([
            'CrmOracleTransferredAt'      => now(),
            'CrmOracleImportCounter'      => $counter,
            'CrmOracleRelatedDependentId' => $dependentId,
        ])->save();

        return ['success' => true, 'message' => 'Header sent to ERP.'];
    }

    private function transferLineRow(SaleOrderHeader $header, SaleOrderLine $line): array
    {
        $columns = app(SaleOrderService::class)->exportColumns(SaleOrderLine::class);
        $row = $this->castDates($line->only($columns), self::LINE_DATE_COLUMNS);

        try {
            [$counter, $dependentId] = $this->insertWithRetry(self::LINE_TABLE, function (int $counter, int $dependentId) use ($row, $header) {
                return array_merge($row, [
                    'FATHERID'           => $header->CrmOracleRelatedDependentId, // links to the header AS INSERTED in Oracle
                    'IMPORTAUTOCOUNTER'  => $counter,
                    'RELATEDDEPENDENTID' => $dependentId,
                ]);
            });
        } catch (Throwable $e) {
            return $this->failure($e, 'line');
        }

        $line->forceFill([
            'CrmErpStatus'                => 'erp_so_created',
            'CrmErpTransferredAt'         => now(),
            'CrmOracleImportCounter'      => $counter,
            'CrmOracleRelatedDependentId' => $dependentId,
        ])->save();

        return ['success' => true, 'message' => 'Transferred to ERP.'];
    }

    /**
     * Replaces every date/datetime column's value with an explicit
     * TO_DATE(...) expression, stripped of any fractional-second suffix
     * SQL Server's DATETIME2(3) columns produce (e.g. "12:54:00.776" ->
     * "12:54:00"). NULL/empty values are left as NULL — Oracle needs no
     * help with those. See the class doc-comment above for why this is
     * necessary rather than passing the string straight through.
     */
    private function castDates(array $row, array $dateColumns): array
    {
        foreach ($dateColumns as $col) {
            if (!array_key_exists($col, $row) || $row[$col] === null || $row[$col] === '') {
                continue;
            }

            $value = $row[$col];
            $string = $value instanceof \DateTimeInterface
                ? $value->format('Y-m-d H:i:s')
                : (string) $value;

            // Keep only "YYYY-MM-DD HH:MM:SS" — drop any ".fff" fractional
            // part and anything else unexpected trailing it.
            if (!preg_match('/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/', $string, $m)) {
                Log::warning("OracleSalesOrderTransfer: unrecognised date value in {$col}, sending NULL instead.", ['value' => $string]);
                $row[$col] = null;
                continue;
            }

            $row[$col] = DB::raw("TO_DATE('{$m[1]}', 'YYYY-MM-DD HH24:MI:SS')");
        }

        return $row;
    }

    /**
     * Inserts into $table using a fresh IMPORTAUTOCOUNTER / shared
     * RELATEDDEPENDENTID computed straight off Oracle's own current data.
     * Retries with new numbers only on an actual duplicate-key collision
     * (a genuine race with another transfer/import happening at the same
     * instant) — never on a connectivity failure, which is surfaced
     * immediately instead.
     *
     * @return array{0:int,1:int} [counter used, dependentId used]
     */
    private function insertWithRetry(string $table, callable $buildRow): array
    {
        for ($attempt = 1; $attempt <= self::MAX_ATTEMPTS; $attempt++) {
            $counter    = $this->nextCounter($table);
            $dependentId = $this->nextRelatedDependentId();

            try {
                DB::connection('oracle')->table($table)->insert($buildRow($counter, $dependentId));
                return [$counter, $dependentId];
            } catch (Throwable $e) {
                if ($this->isDuplicateKey($e) && $attempt < self::MAX_ATTEMPTS) {
                    Log::warning("OracleSalesOrderTransfer: duplicate key on {$table}, retrying with a new number.", [
                        'attempt' => $attempt, 'counter' => $counter,
                    ]);
                    continue;
                }
                throw $e;
            }
        }

        throw new \RuntimeException("Could not find a free IMPORTAUTOCOUNTER for {$table} after " . self::MAX_ATTEMPTS . ' attempts.');
    }

    private function nextCounter(string $table): int
    {
        $max = (int) DB::connection('oracle')->table($table)->max('IMPORTAUTOCOUNTER');
        return $max + 1;
    }

    /**
     * RELATEDDEPENDENTID is one shared number series across BOTH real
     * Oracle tables (same pattern as our own local staging tables) — so
     * it must never collide with either table's current live values.
     */
    private function nextRelatedDependentId(): int
    {
        $maxHeader = (int) DB::connection('oracle')->table(self::HEADER_TABLE)->max('RELATEDDEPENDENTID');
        $maxLine   = (int) DB::connection('oracle')->table(self::LINE_TABLE)->max('RELATEDDEPENDENTID');
        return max($maxHeader, $maxLine) + 1;
    }

    private function isDuplicateKey(Throwable $e): bool
    {
        return str_contains($e->getMessage(), 'ORA-00001'); // unique constraint violated
    }

    private function failure(Throwable $e, string $what): array
    {
        $msg = $e->getMessage();
        Log::error("OracleSalesOrderTransfer: {$what} insert failed. " . $msg);

        if (str_contains($msg, 'ORA-12170') || str_contains($msg, 'oci_connect')) {
            return ['success' => false, 'message' => "Couldn't reach the Oracle ERP system — please try again in a moment."];
        }
        if (str_contains($msg, 'ORA-01031')) {
            return ['success' => false, 'message' => 'Oracle rejected the write — the ERP account needs INSERT permission.'];
        }

        return ['success' => false, 'message' => "Oracle rejected the {$what}: " . $msg];
    }
}
