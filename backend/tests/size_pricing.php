<?php
declare(strict_types=1);

// Load the existing functions without dispatching HTTP routes or running migrations.
$source = file_get_contents(__DIR__ . '/../public/index.php');
$boundary = strpos($source, '$method = $_SERVER');
if ($boundary === false) throw new RuntimeException('Router boundary not found');
eval(substr($source, 5, $boundary - 5));
restore_exception_handler();
if (env('APP_ENV') !== 'local' || !in_array(env('DB_HOST'), ['127.0.0.1', 'localhost'], true)) {
    throw new RuntimeException('This rollback test requires a local database');
}

function check_size_test(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
    echo "PASS: $message\n";
}

$pdo = db();
$pdo->beginTransaction();
$finished = false;
register_shutdown_function(function () use ($pdo, &$finished): void {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if (!$finished) exit(1);
});
try {
    $category = $pdo->query('SELECT id FROM categories ORDER BY id LIMIT 1')->fetchColumn();
    if (!$category) throw new RuntimeException('An existing category is required');
    $insert = $pdo->prepare('INSERT INTO menu_items (category_id,name,slug,price,stock,is_active) VALUES (?,?,?,?,100,1)');
    $insert->execute([$category, 'Size pricing rollback fixture', 'size-test-' . bin2hex(random_bytes(6)), 149]);
    $id = (int)$pdo->lastInsertId();
    save_product_size_prices($id, validated_size_prices(['size_prices' => ['S' => 149, 'M' => 259, 'L' => 349]]));
    $query = $pdo->prepare('SELECT * FROM menu_item_variants WHERE menu_item_id=? ORDER BY sort_order');
    $query->execute([$id]);
    $variants = $query->fetchAll();
    check_size_test(count($variants) === 3, 'Create all three sizes');
    foreach ($variants as $variant) {
        $calc = calculate_cart([['id' => $id, 'variant_id' => $variant['id'], 'quantity' => 10, 'price' => 0.01]], null, null, null, null, 'takeaway', false);
        check_size_test((float)$calc['subtotal'] === 10 * (float)$variant['price'], $variant['name'] . ' authoritative price ignores client price');
    }
    $pdo->prepare("INSERT INTO offers (name,offer_type,scope,scope_id,buy_qty,get_qty,is_active) VALUES ('Rollback size offer','bogo','item',?,1,1,1)")->execute([$id]);
    $paired = calculate_cart([
        ['id' => $id, 'variant_id' => $variants[1]['id'], 'quantity' => 10, 'client_key' => 'paid'],
        ['id' => $id, 'variant_id' => $variants[0]['id'], 'quantity' => 10, 'client_key' => 'free', 'is_bogo_free' => true, 'bogo_parent_key' => 'paid'],
    ], null, null, null, null, 'takeaway');
    check_size_test((float)$paired['bogo_discount'] === 1490.0 && (float)$paired['total'] === 2590.0, 'BOGO uses selected size prices for paid and free lines');
    save_product_size_prices($id, ['M' => 319, 'L' => 459]);
    $query->execute([$id]);
    $updated = $query->fetchAll();
    check_size_test(array_column($updated, 'id') === array_column($variants, 'id'), 'Editing preserves variant IDs');
    check_size_test((int)$updated[0]['is_active'] === 0 && (float)$updated[1]['price'] === 319.0, 'Medium/Large only and changed prices persist');
    save_product_size_prices($id, ['S' => 149]);
    $query->execute([$id]);
    check_size_test(count(array_filter($query->fetchAll(), fn($row) => (int)$row['is_active'] === 1)) === 1, 'Small-only pizza');
    check_size_test(validated_size_prices([]) === null, 'Omitted size payload preserves legacy products');
    save_product_size_prices($id, []);
    $query->execute([$id]);
    check_size_test(count(array_filter($query->fetchAll(), fn($row) => (int)$row['is_active'] === 1)) === 0, 'Disable size pricing without deleting history');
    $finished = true;
} finally {
    $pdo->rollBack();
    echo "All test product/variant writes rolled back.\n";
}
