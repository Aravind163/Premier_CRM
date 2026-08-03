<?php
$cols = \DB::select("SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ?", ["Products"]);
file_put_contents(base_path("products_schema.json"), json_encode($cols, JSON_PRETTY_PRINT));
echo "Wrote schema\n";
exit;
