<?php
$rows = \App\Models\Product::orderBy("Id")->get(["Id","Code","SortNo","ShadeNo","Name","SubType","Description","CreatedAt"])->toArray();
file_put_contents(base_path("products_dump.json"), json_encode($rows, JSON_PRETTY_PRINT));
echo "Wrote " . count($rows) . " rows\n";
exit;
