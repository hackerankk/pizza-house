<?php
declare(strict_types=1);

// Focused regression test for staff delivery orders and today's sales splits.
// Follows backend/tests/size_pricing.php: loads the existing API functions
// without dispatching HTTP routes, requires a local database, and rolls every
// write back so production history is never touched.

// Load the existing functions without dispatching HTTP routes or running migrations.
$source = file_get_contents(__DIR__ . '/../public/index.php');
$boundary = strpos($source, '$method = $_SERVER');
if ($boundary === false) throw new RuntimeException('Router boundary not found');
eval(substr($source, 5, $boundary - 5));
restore_exception_handler();
if (env('APP_ENV') !== 'local' || !in_array(env('DB_HOST'), ['127.0.0.1', 'localhost'], true)) {
    throw new RuntimeException('This test requires a local database');
}

function check_delivery_test(bool $condition, string $message): void {
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
    // Staff counter payment math is unchanged by delivery work.
    $cash = staff_payment_state('cash', 540.0);
    check_delivery_test($cash['paid'] === 540.0 && $cash['remaining'] === 0.0 && $cash['status'] === 'Paid', 'Cash payment covers delivery-inclusive total');
    $split = staff_payment_state('split', 540.0, 500, 100);
    check_delivery_test($split['total_received'] === 600.0 && $split['change'] === 60.0 && $split['paid'] === 540.0, 'Split payment change math');

    // Item totals stay authoritative for takeaway (no delivery leg).
    $category = $pdo->query('SELECT id FROM categories ORDER BY id LIMIT 1')->fetchColumn();
    if (!$category) throw new RuntimeException('An existing category is required');
    $insert = $pdo->prepare('INSERT INTO menu_items (category_id,name,slug,price,stock,is_active) VALUES (?,?,?,?,100,1)');
    $insert->execute([$category, 'Staff delivery fixture', 'staff-delivery-' . bin2hex(random_bytes(6)), 500]);
    $itemId = (int)$pdo->lastInsertId();
    $takeawayCalc = calculate_cart([['id' => $itemId, 'quantity' => 1]], null, null, null, null, 'takeaway', false);
    check_delivery_test((float)$takeawayCalc['subtotal'] === 500.0 && (float)$takeawayCalc['delivery']['delivery_charge'] === 0.0, 'Takeaway calc has no delivery charge');

    // Staff delivery helper must agree with the shared slab rules instead of trusting client input.
    $probeDistance = 2.0;
    // Rolled-back probe slab so both distance probes below always have base coverage.
    $pdo->prepare("INSERT INTO delivery_slabs (min_order_amount,min_km,max_km,free_delivery_enabled,charge,priority,order_types,is_active) VALUES (0,0,100,0,40,0,'delivery',1)")->execute();
    $expected = delivery_rule_result(500.0, $probeDistance, 'delivery');
    $byDistance = delivery_for_staff_order(500.0, null, null, (string)$probeDistance);
    check_delivery_test((float)$byDistance['delivery']['delivery_charge'] === (float)$expected['delivery_charge'], 'Staff distance delivery uses slab rules');
    check_delivery_test((float)$byDistance['distance_km'] === (float)$expected['distance_km'], 'Staff distance delivery keeps slab distance');
    $settings = settings();
    $byCoords = delivery_for_staff_order(500.0, $settings['restaurant_latitude'], $settings['restaurant_longitude'], null);
    $quoted = delivery_quote((float)$settings['restaurant_latitude'], (float)$settings['restaurant_longitude'], 500.0, 'delivery');
    check_delivery_test((float)$byCoords['delivery']['delivery_charge'] === (float)$quoted['delivery_charge'], 'Staff coordinate delivery uses slab rules');

    // Today's dashboard splits: same paid-amount rule for total/takeaway/delivery, no double counting.
    [$todayStart, $tomorrowStart] = today_range();
    $baseline = function (string $sql, array $params = []) use ($pdo) {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchColumn();
    };
    $paidRule = "payment_status IN ('Paid','Partially Paid','COD')";
    $baseTotal = (float)$baseline("SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE created_at >= ? AND created_at < ? AND $paidRule", [$todayStart, $tomorrowStart]);
    $baseTakeaway = (float)$baseline("SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE created_at >= ? AND created_at < ? AND order_type='takeaway' AND $paidRule", [$todayStart, $tomorrowStart]);
    $baseDelivery = (float)$baseline("SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE created_at >= ? AND created_at < ? AND order_type='delivery' AND $paidRule", [$todayStart, $tomorrowStart]);
    $baseDineIn = (float)$baseline("SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE created_at >= ? AND created_at < ? AND order_type='dine_in' AND $paidRule", [$todayStart, $tomorrowStart]);
    $baseCount = (int)$baseline('SELECT COUNT(*) FROM orders WHERE created_at >= ? AND created_at < ?', [$todayStart, $tomorrowStart]);
    $baseTakeawayCount = (int)$baseline("SELECT COUNT(*) FROM orders WHERE created_at >= ? AND created_at < ? AND order_type='takeaway'", [$todayStart, $tomorrowStart]);
    $baseDeliveryCount = (int)$baseline("SELECT COUNT(*) FROM orders WHERE created_at >= ? AND created_at < ? AND order_type='delivery'", [$todayStart, $tomorrowStart]);

    $seed = $pdo->prepare("INSERT INTO orders (order_number,user_id,source,guest_name,guest_phone,guest_email,order_type,status,subtotal,delivery_charge,total_amount,payment_mode,payment_status,paid_amount,remaining_amount,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    $seed->execute(['TST-TAKE-' . bin2hex(random_bytes(4)), null, 'staff_offline', 'Takeaway Test', '9000000001', null, 'takeaway', 'accepted', 4200, 0, 4200, 'cash', 'Paid', 4200, 0, 'tst-' . bin2hex(random_bytes(8)), $todayStart]);
    $seed->execute(['TST-DELV-' . bin2hex(random_bytes(4)), null, 'staff_offline', 'Delivery Test', '9000000002', '', 'delivery', 'accepted', 8250, 40, 8290, 'cash', 'Paid', 8290, 0, 'tst-' . bin2hex(random_bytes(8)), $todayStart]);
    $seed->execute(['TST-FAIL-' . bin2hex(random_bytes(4)), null, 'customer_online', 'Failed Test', '9000000003', null, 'delivery', 'received', 1000, 0, 1000, 'full', 'Failed', 0, 1000, 'tst-' . bin2hex(random_bytes(8)), $todayStart]);
    $seed->execute(['TST-DINE-' . bin2hex(random_bytes(4)), null, 'staff_offline', 'Dinein Test', '9000000004', null, 'dine_in', 'accepted', 500, 0, 500, 'cash', 'Paid', 500, 0, 'tst-' . bin2hex(random_bytes(8)), $todayStart]);
    $seed->execute(['TST-YEST-' . bin2hex(random_bytes(4)), null, 'staff_offline', 'Yesterday Test', '9000000005', null, 'takeaway', 'delivered', 999, 0, 999, 'cash', 'Paid', 999, 0, 'tst-' . bin2hex(random_bytes(8)), date('Y-m-d H:i:s', strtotime($todayStart . ' -1 day'))]);

    $newTotal = (float)$baseline("SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE created_at >= ? AND created_at < ? AND $paidRule", [$todayStart, $tomorrowStart]);
    $newTakeaway = (float)$baseline("SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE created_at >= ? AND created_at < ? AND order_type='takeaway' AND $paidRule", [$todayStart, $tomorrowStart]);
    $newDelivery = (float)$baseline("SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE created_at >= ? AND created_at < ? AND order_type='delivery' AND $paidRule", [$todayStart, $tomorrowStart]);
    $newDineIn = (float)$baseline("SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE created_at >= ? AND created_at < ? AND order_type='dine_in' AND $paidRule", [$todayStart, $tomorrowStart]);
    check_delivery_test(round($newTotal - $baseTotal, 2) === 12990.0, 'Today total sales sums paid takeaway, delivery and dine-in');
    check_delivery_test(round($newTakeaway - $baseTakeaway, 2) === 4200.0, 'Takeaway sales exclude delivery, failed and yesterday rows');
    check_delivery_test(round($newDelivery - $baseDelivery, 2) === 8290.0, 'Delivery sales exclude failed payments');
    check_delivery_test(round($newDineIn - $baseDineIn, 2) === 500.0, 'Dine-in sales stay separate from takeaway and delivery');
    check_delivery_test(round(($newTakeaway - $baseTakeaway) + ($newDelivery - $baseDelivery) + ($newDineIn - $baseDineIn), 2) === round($newTotal - $baseTotal, 2), 'Sales splits add up to the total without double counting');

    $newCount = (int)$baseline('SELECT COUNT(*) FROM orders WHERE created_at >= ? AND created_at < ?', [$todayStart, $tomorrowStart]);
    $newTakeawayCount = (int)$baseline("SELECT COUNT(*) FROM orders WHERE created_at >= ? AND created_at < ? AND order_type='takeaway'", [$todayStart, $tomorrowStart]);
    $newDeliveryCount = (int)$baseline("SELECT COUNT(*) FROM orders WHERE created_at >= ? AND created_at < ? AND order_type='delivery'", [$todayStart, $tomorrowStart]);
    check_delivery_test($newCount - $baseCount === 4, 'Today order count excludes yesterday');
    check_delivery_test($newTakeawayCount - $baseTakeawayCount === 1 && $newDeliveryCount - $baseDeliveryCount === 2, 'Takeaway and delivery order counts split correctly');
    $finished = true;
} finally {
    $pdo->rollBack();
    echo "All test product/order writes rolled back.\n";
}
