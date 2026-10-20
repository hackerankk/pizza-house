<?php
declare(strict_types=1);

// Run: php backend/tests/product_variant_pricing.php
// Optional persistence checks use an explicitly supplied isolated MySQL database:
// PIZZA_PRICING_TEST_DSN=mysql:host=127.0.0.1;port=33316;dbname=pizza_feature_test
// PIZZA_PRICING_TEST_USER=root PIZZA_PRICING_TEST_PASSWORD=...
// No application bootstrap/.env is loaded. All writes use a temporary table.
final class PricingValidationFailure extends RuntimeException {}
function json_response(array $data, int $status = 200): never {
    throw new PricingValidationFailure((string)($data['error'] ?? $status), $status);
}
function db(): PDO { return $GLOBALS['pricingTestPdo']; }
function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
function rejects(callable $callback): void {
    try { $callback(); } catch (PricingValidationFailure $error) {
        check($error->getCode() === 422, 'Expected validation status 422');
        return;
    }
    throw new RuntimeException('Invalid pricing was accepted');
}

// Load the real pricing functions, without executing routes or accessing app data.
$source = file_get_contents(__DIR__ . '/../public/index.php');
$start = strpos($source, 'function validated_size_prices(');
$end = strpos($source, 'function validate_admin_resource(', $start);
check($start !== false && $end !== false, 'Missing pricing functions');
eval(substr($source, $start, $end - $start));

check(validated_size_prices([]) === null, 'Omitted sizes must be preserved');
check(validated_variant_prices([]) === null, 'Omitted variants must be preserved');
check(validated_size_prices(['size_prices' => []]) === [], 'Explicit empty sizes disable sizes');
check(validated_variant_prices(['variant_prices' => []]) === [], 'Explicit empty variants disable variants');
check(validated_size_prices(['size_prices' => ['S' => '100', 'M' => 150, 'L' => 200]]) === ['S' => 100.0, 'M' => 150.0, 'L' => 200.0], 'S/M/L prices changed');
check(validated_variant_prices(['variant_prices' => ['Normal' => 120, 'Premium' => '180', ' Chef Special ' => 220]]) === ['Normal' => 120.0, 'Premium' => 180.0, 'Chef Special' => 220.0], 'Custom variants changed');
foreach ([['s' => 100], [' M ' => 100], ['L' => 100], ['' => 100], [str_repeat('a', 81) => 100], ['Normal' => 100, ' normal ' => 120], ['Normal' => 0], ['Premium' => INF], ['Extra' => 100000000], ['Extra' => 0.001]] as $prices) {
    rejects(fn() => validated_variant_prices(['variant_prices' => $prices]));
}
foreach ([['Normal' => 100], ['S' => 0], ['M' => ''], ['L' => INF]] as $prices) {
    rejects(fn() => validated_size_prices(['size_prices' => $prices]));
}
echo "PASS pricing validation (both maps, custom names, reserved names, price bounds, omitted/empty maps)\n";

$dsn = getenv('PIZZA_PRICING_TEST_DSN');
if (!$dsn) {
    echo "SKIP persistence: set PIZZA_PRICING_TEST_DSN to an isolated loopback MySQL test database\n";
    exit(0);
}
check((bool)preg_match('/^mysql:host=(127\.0\.0\.1|localhost);(?:port=\d+;)?dbname=[a-zA-Z0-9_]+_test$/', $dsn), 'Only an explicitly named loopback test database is allowed');
$pdo = new PDO($dsn, getenv('PIZZA_PRICING_TEST_USER') ?: 'root', getenv('PIZZA_PRICING_TEST_PASSWORD') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$GLOBALS['pricingTestPdo'] = $pdo;
$pdo->exec('CREATE TEMPORARY TABLE menu_item_variants (id INT AUTO_INCREMENT PRIMARY KEY, menu_item_id INT NOT NULL, name VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL, price DECIMAL(10,2) NOT NULL, sort_order INT NOT NULL, is_default TINYINT NOT NULL, is_active TINYINT NOT NULL, UNIQUE KEY item_name (menu_item_id,name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
function rows(): array {
    $rows = [];
    foreach (db()->query('SELECT * FROM menu_item_variants ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) as $row) $rows[$row['name']] = $row;
    return $rows;
}
try {
    save_product_size_prices(1, ['S' => 100, 'M' => 150, 'L' => 200]);
    save_product_variant_prices(1, ['Normal' => 120, 'Premium' => 180, 'Chef Special' => 220]);
    $original = rows();
    check(count($original) === 6, 'Missing size/custom rows');
    foreach ($original as $row) check((int)$row['is_active'] === 1, 'Initial group overwrite');
    save_product_size_prices(1, ['S' => 110, 'L' => 210]);
    $current = rows();
    check((int)$current['M']['is_active'] === 0 && (float)$current['S']['price'] === 110.0, 'Size edit failed');
    check($current['S']['id'] === $original['S']['id'], 'Size ID replaced');
    foreach (['Normal', 'Premium', 'Chef Special'] as $name) check($current[$name] === $original[$name], 'Size edit overwrote custom variant');
    save_product_variant_prices(1, ['Normal' => 130, 'Chef Special' => 230]);
    $customEdit = rows();
    foreach (['S', 'M', 'L'] as $name) check($customEdit[$name] === $current[$name], 'Custom edit overwrote size');
    check((int)$customEdit['Premium']['is_active'] === 0 && (float)$customEdit['Chef Special']['price'] === 230.0, 'Custom edit failed');
    check($customEdit['Normal']['id'] === $original['Normal']['id'], 'Custom ID replaced');
    save_product_variant_prices(1, []);
    $disabled = rows();
    check((int)$disabled['S']['is_active'] === 1 && (int)$disabled['L']['is_active'] === 1, 'Disabling custom variants disabled sizes');
    save_product_variant_prices(1, ['Premium' => 190]);
    check(rows()['Premium']['id'] === $original['Premium']['id'], 'Reenabled variant lost historical ID');
    save_product_size_prices(1, []);
    check((int)rows()['Premium']['is_active'] === 1, 'Disabling sizes disabled custom variant');
    foreach (['S', 'M', 'L'] as $name) check((int)rows()[$name]['is_active'] === 0, 'Size not disabled');
    echo "PASS MySQL persistence (independent updates, independent disabling, stable historical IDs)\n";
} finally {
    $pdo->exec('DROP TEMPORARY TABLE menu_item_variants');
}
