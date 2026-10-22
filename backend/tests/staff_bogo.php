<?php
declare(strict_types=1);

// All fixture changes roll back; never run against the business database.
$source = file_get_contents(__DIR__ . '/../public/index.php');
$boundary = strpos($source, '$method = $_SERVER');
if ($boundary === false) throw new RuntimeException('Router boundary not found');
// Convert the router's terminating response into an exception so invalid-cart
// cases are assertions and the rollback always executes in this CLI harness.
eval(str_replace('function json_response(', 'function original_http_json_response(', substr($source, 5, $boundary - 5)));
restore_exception_handler();
function json_response(array $payload, int $status = 200): never {
    throw new ApiException((string)($payload['error'] ?? 'Unexpected HTTP response'), $status);
}
if (env('APP_ENV') !== 'local' || !in_array(env('DB_HOST'), ['127.0.0.1','localhost'], true)
    || !str_ends_with((string)env('DB_NAME'), '_test') || env('PIZZA_POS_TEST_DATABASE') !== env('DB_NAME')) {
    throw new RuntimeException('Explicit isolated test database confirmation required');
}
$checks = 0;
function assert_staff_bogo(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
    ++$GLOBALS['checks'];
    echo "PASS: $message\n";
}
function rejects_staff_bogo(callable $action, string $message): void {
    try { $action(); } catch (ApiException $error) {
        assert_staff_bogo($error->status === 422, $message);
        return;
    }
    throw new RuntimeException($message . ': invalid input accepted');
}
$pdo = db();
$pdo->beginTransaction();
try {
    $pdo->prepare('DELETE FROM settings WHERE setting_key=?')->execute(['staff_bogo_policy']);
    // Public offer restrictions must never disappear from customer calculations.
    $pdo->exec('UPDATE offers SET is_active=0');
    $suffix = bin2hex(random_bytes(5));
    $pdo->prepare('INSERT INTO categories (name,slug,is_active) VALUES (?,?,1)')->execute(['Staff BOGO rollback', 'staff-bogo-'.$suffix]);
    $category = (int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO menu_items (category_id,name,slug,price,stock,is_active) VALUES (?,?,?,?,100,1)')->execute([$category,'Staff BOGO rollback pizza','staff-bogo-'.$suffix,100]);
    $product = (int)$pdo->lastInsertId();
    save_product_size_prices($product, ['S'=>100,'M'=>200,'L'=>300]);
    $query = $pdo->prepare('SELECT * FROM menu_item_variants WHERE menu_item_id=?');
    $query->execute([$product]);
    $variants = [];
    foreach ($query->fetchAll() as $variant) $variants[$variant['name']] = $variant;
    $actor = ['id'=>1,'role'=>'staff'];
    $paid = ['client_key'=>'paid','item'=>['id'=>$product,'category_id'=>$category,'name'=>'Paid rollback pizza'],'variant'=>['name'=>'M'],'unit_price'=>200,'quantity'=>1];
    $free = ['client_key'=>'free','bogo_parent_key'=>'paid','is_bogo_free'=>true,'item'=>['id'=>$product,'category_id'=>$category,'name'=>'Free rollback pizza'],'variant'=>['name'=>'M'],'unit_price'=>200,'quantity'=>1];
    $policy = staff_everyday_bogo_offer();
    assert_staff_bogo($policy['buy_qty'] === 1 && $policy['get_qty'] === 1 && $policy['allowed_free_sizes'] === ['M'=>['M','S']], 'Permanent policy exposes one free Medium or Small per paid Medium');
    foreach (range(19,25) as $day) {
        foreach (['00:00:00','12:00:00','23:59:59'] as $time) {
            $date = new DateTimeImmutable('2026-10-'.$day.' '.$time, restaurant_timezone());
            foreach (['M','S'] as $size) {
                $bonus = $free; $bonus['variant']['name'] = $size; $bonus['unit_price'] = $size === 'S' ? 100 : 200;
                $match = matching_bogo_offer($paid,$bonus,$date,$actor);
                assert_staff_bogo(($match['staff_always_available'] ?? false) === true, $date->format('l H:i:s').' M to '.$size.' Staff BOGO works without public offers');
                assert_staff_bogo(matching_bogo_offer($paid,$bonus,$date,null) === null, $date->format('l H:i:s').' customer retains public-only eligibility for M to '.$size);
            }
        }
    }
    foreach (['2025-01-01 00:00:00','2030-12-31 23:59:59'] as $time) {
        assert_staff_bogo(matching_bogo_offer($paid,$free,new DateTimeImmutable($time,restaurant_timezone()),$actor) !== null, 'Staff policy has no start/end expiry: '.$time);
    }
    foreach ([null,[],['role'=>'customer'],['role'=>'delivery_boy']] as $unauthorized) {
        assert_staff_bogo(!staff_everyday_bogo_pair_allowed($paid,$free,$unauthorized), 'Only trusted Staff/Admin actors receive the permanent policy');
    }
    assert_staff_bogo(staff_everyday_bogo_pair_allowed($paid,$free,['id'=>1,'role'=>'admin']), 'Authorized Admin order editing can preserve Staff BOGO');
    foreach (['S','L','Normal','Premium',''] as $size) {
        $invalid = $paid; $invalid['variant']['name'] = $size;
        assert_staff_bogo(!staff_everyday_bogo_pair_allowed($invalid,$free,$actor), 'Paid '.$size.' does not qualify as a paid Medium');
    }
    foreach (['L','Normal','Premium',''] as $size) {
        $invalid = $free; $invalid['variant']['name'] = $size;
        assert_staff_bogo(!staff_everyday_bogo_pair_allowed($paid,$invalid,$actor), 'Free '.$size.' is outside permanent M/S choices');
    }
    $invalid = $free; $invalid['item']['category_id']++;
    assert_staff_bogo(!staff_everyday_bogo_pair_allowed($paid,$invalid,$actor), 'Permanent Staff BOGO keeps the existing same-category requirement');
    $invalid = $free; $invalid['unit_price'] = 200.01;
    assert_staff_bogo(!staff_everyday_bogo_pair_allowed($paid,$invalid,$actor), 'Free item cannot exceed qualifying paid unit price');
    foreach (['is_bogo_free','is_manual_free'] as $flag) {
        $invalid = $paid; $invalid[$flag] = true;
        assert_staff_bogo(!staff_everyday_bogo_pair_allowed($invalid,$free,$actor), 'A '.$flag.' line cannot qualify as paid');
    }
    $invalid = $free; $invalid['is_manual_free'] = true;
    assert_staff_bogo(!staff_everyday_bogo_pair_allowed($paid,$invalid,$actor), 'Manual-free line does not also receive permanent BOGO');
    $paidCart = ['id'=>$product,'variant_id'=>(int)$variants['M']['id'],'quantity'=>1,'client_key'=>'paid'];
    $bonusCart = ['id'=>$product,'variant_id'=>(int)$variants['M']['id'],'quantity'=>1,'client_key'=>'free','is_bogo_free'=>true,'bogo_parent_key'=>'paid'];
    foreach (['M','S'] as $size) {
        $bonus = $bonusCart; $bonus['variant_id'] = (int)$variants[$size]['id'];
        $cart = calculate_cart([$paidCart,$bonus],null,null,null,null,'takeaway',true,$actor);
        assert_staff_bogo((float)$cart['total'] === 200.0 && (float)$cart['bogo_discount'] === (float)$variants[$size]['price'], 'Staff cart M to '.$size.' discounts exactly the selected free variant');
        rejects_staff_bogo(fn()=>calculate_cart([$paidCart,$bonus],null,null,null,null,'takeaway'), 'Customer calculation cannot unlock permanent Staff M to '.$size);
    }
    $small = $bonusCart; $small['variant_id'] = (int)$variants['S']['id']; $small['client_key'] = 'small';
    rejects_staff_bogo(fn()=>calculate_cart([$paidCart,$bonusCart,$small],null,null,null,null,'takeaway',true,$actor), 'M and S BOGO children share one free capacity rather than each receiving one');
    $paidTwo = $paidCart; $paidTwo['quantity'] = 2;
    $cart = calculate_cart([$paidTwo,$bonusCart,$small],null,null,null,null,'takeaway',true,$actor);
    assert_staff_bogo((float)$cart['total'] === 400.0 && (float)$cart['bogo_discount'] === 300.0, 'Two paid Medium pizzas allow one Medium and one Small BOGO child');
    rejects_staff_bogo(fn()=>calculate_cart([$bonusCart,$small],null,null,null,null,'takeaway',true,$actor), 'Free items cannot become paid parents');
    assert_staff_bogo(in_array('manage_staff_bogo',staff_permission_keys(),true) && default_staff_permissions()['manage_staff_bogo'] === false, 'Staff BOGO management is an explicit new permission denied by default');
    assert_staff_bogo(staff_bogo_policy_record()['revision'] === 'default-v1', 'Absent saved policy has a stable default revision');
    $defaultConfig = staff_bogo_default_config();
    foreach ([
        ['allowed_free_sizes'=>['M'=>[]]], ['allowed_free_sizes'=>['M'=>['M','M']]], ['allowed_free_sizes'=>['M'=>['L']]],
        ['allowed_free_sizes'=>['S'=>['S']]], ['category_ids'=>['1']], ['product_ids'=>[true]], ['free_product_ids'=>[-1]],
        ['category_ids'=>[$category,$category]], ['buy_qty'=>2], ['name'=>''], ['name'=>str_repeat('x',121)],
    ] as $invalidConfig) rejects_staff_bogo(fn()=>staff_bogo_config(array_replace($defaultConfig,$invalidConfig)), 'Invalid staff BOGO schema is rejected: '.json_encode($invalidConfig));
    rejects_staff_bogo(fn()=>staff_bogo_config(array_diff_key($defaultConfig,['name'=>true])), 'Missing required policy fields are rejected');
    rejects_staff_bogo(fn()=>staff_bogo_config(array_replace($defaultConfig,['product_ids'=>[9007199254740991]]),true), 'Nonexistent pizza IDs are rejected');
    $pdo->prepare('UPDATE menu_item_variants SET price=0 WHERE id=?')->execute([$variants['M']['id']]);
    assert_staff_bogo(staff_bogo_config(array_replace($defaultConfig,['product_ids'=>[$product]]),true)['product_ids'] === [$product], 'Policy accepts legacy zero variant prices using the real base-price fallback');
    $pdo->prepare('UPDATE menu_item_variants SET price=200 WHERE id=?')->execute([$variants['M']['id']]);
    $pdo->prepare('INSERT INTO menu_items (category_id,name,slug,price,stock,is_active) VALUES (?,?,?,?,100,1)')->execute([$category,'Second rollback pizza','staff-bogo-second-'.$suffix,80]);
    $secondProduct = (int)$pdo->lastInsertId();
    save_product_size_prices($secondProduct,['S'=>80,'M'=>180]);
    $restricted = staff_bogo_offer_from_config(array_replace($defaultConfig,['product_ids'=>[$product],'free_product_ids'=>[$secondProduct]]));
    $secondFree = $free; $secondFree['item']['id'] = $secondProduct; $secondFree['unit_price'] = 180;
    assert_staff_bogo(staff_bogo_pair_allowed_by_policy($paid,$secondFree,$restricted), 'Explicit free products may differ from eligible paid products in the same category');
    assert_staff_bogo(!staff_bogo_pair_allowed_by_policy($paid,$free,$restricted), 'Explicit free-product scope overrides the paid scope for free choices');
    $secondPaid = $paid; $secondPaid['item']['id'] = $secondProduct;
    assert_staff_bogo(!staff_bogo_pair_allowed_by_policy($secondPaid,$secondFree,$restricted), 'An eligible free product does not automatically become an eligible paid product');
    $categoryScope = staff_bogo_offer_from_config(array_replace($defaultConfig,['category_ids'=>[$category],'product_ids'=>[9000]]));
    assert_staff_bogo(staff_bogo_pair_allowed_by_policy($paid,$secondFree,$categoryScope), 'Category and individual paid-product selections are combined with OR');
    $individualScope = staff_bogo_offer_from_config(array_replace($defaultConfig,['category_ids'=>[9000],'product_ids'=>[$product,$secondProduct]]));
    assert_staff_bogo(staff_bogo_pair_allowed_by_policy($paid,$secondFree,$individualScope), 'An explicitly selected paid pizza works outside selected categories');
    $implicitFree = staff_bogo_offer_from_config(array_replace($defaultConfig,['product_ids'=>[$product]]));
    assert_staff_bogo(!staff_bogo_pair_allowed_by_policy($paid,$secondFree,$implicitFree), 'Empty free-product list reuses paid eligibility instead of widening it');
    $oldCart = calculate_cart([$paidCart,$bonusCart],null,null,null,null,'takeaway',true,$actor);
    $oldItems = [];
    foreach ($oldCart['lines'] as $index=>$line) $oldItems[] = ['id'=>101+$index,'menu_item_id'=>$line['item']['id'],'variant_id'=>$line['variant']['id'],'name_snapshot'=>$line['item']['name'],'variant_snapshot'=>$line['variant']['name'],'options_snapshot'=>option_snapshot($line),'unit_price'=>$line['unit_price'],'quantity'=>$line['quantity']];
    assert_staff_bogo(decoded_item_options($oldItems[1]['options_snapshot'])['bogo']['staff_policy']['allowed_free_sizes'] === ['M'=>['M','S']], 'Saved Staff free lines snapshot their applicable policy');
    $narrowed = array_replace($defaultConfig,['name'=>'Small only selected pizza','allowed_free_sizes'=>['M'=>['S']],'product_ids'=>[$secondProduct],'free_product_ids'=>[$secondProduct]]);
    $stored = json_encode(['policy'=>$narrowed,'updated_by'=>1,'updated_at'=>'2026-10-21T00:00:00Z']);
    $pdo->prepare('INSERT INTO settings (setting_key,setting_value) VALUES (?,?)')->execute(['staff_bogo_policy',$stored]);
    assert_staff_bogo(staff_bogo_policy_record()['revision'] === hash('sha256',$stored) && staff_everyday_bogo_offer()['name'] === $narrowed['name'], 'Persisted private policy is read with a content revision');
    assert_staff_bogo(!array_key_exists('staff_bogo_policy',sanitized_settings(settings())), 'Private Staff policy never appears in public or generic Admin settings');
    rejects_staff_bogo(fn()=>calculate_cart([$paidCart,$bonusCart],null,null,null,null,'takeaway',true,$actor), 'New orders use current saved eligibility after rules narrow');
    $oldPaidInput = $paidCart + ['order_item_id'=>101]; $oldFreeInput = $bonusCart + ['order_item_id'=>102];
    $historicalItems = prepare_staff_cart_items([$oldPaidInput,$oldFreeInput],$actor,$oldItems);
    $historicalCalc = calculate_cart($historicalItems,null,null,null,null,'takeaway',true,$actor);
    assert_staff_bogo((float)$historicalCalc['total'] === 200.0 && (float)$historicalCalc['bogo_discount'] === 200.0, 'Unchanged saved Staff pairs keep their original BOGO after policy changes');
    $changed = $oldFreeInput; $changed['variant_id'] = (int)$variants['S']['id'];
    rejects_staff_bogo(fn()=>calculate_cart(prepare_staff_cart_items([$oldPaidInput,$changed],$actor,$oldItems),null,null,null,null,'takeaway',true,$actor), 'Changing an old free size must meet current saved rules');
    $increased = $oldPaidInput; $increased['quantity'] = 2;
    rejects_staff_bogo(fn()=>calculate_cart(prepare_staff_cart_items([$increased,$oldFreeInput],$actor,$oldItems),null,null,null,null,'takeaway',true,$actor), 'Increasing a historical paid parent does not unlock archived BOGO rules');
    $changed = $oldFreeInput; $changed['bogo_parent_key'] = 'replacement'; $replacement = $oldPaidInput; $replacement['client_key'] = 'replacement';
    rejects_staff_bogo(fn()=>calculate_cart(prepare_staff_cart_items([$replacement,$changed],$actor,$oldItems),null,null,null,null,'takeaway',true,$actor), 'Reparenting a saved free pizza cannot borrow historical eligibility');
    $forged = $bonusCart; $forged['__historical_staff_bogo_policy'] = staff_bogo_offer_from_config($defaultConfig); $forged['__historical_staff_bogo_parent'] = 'paid';
    rejects_staff_bogo(fn()=>calculate_cart(prepare_staff_cart_items([$paidCart,$forged],$actor,$oldItems),null,null,null,null,'takeaway',true,$actor), 'Client-like internal policy flags are stripped before preparing staff items');
    $legacyOld = $oldItems; $legacySnapshot = json_decode($legacyOld[1]['options_snapshot'],true); unset($legacySnapshot['bogo']['staff_policy']); $legacyOld[1]['options_snapshot'] = json_encode($legacySnapshot);
    $legacyCalc = calculate_cart(prepare_staff_cart_items([$oldPaidInput,$oldFreeInput],$actor,$legacyOld),null,null,null,null,'takeaway',true,$actor);
    assert_staff_bogo((float)$legacyCalc['total'] === 200.0, 'Unchanged legacy Staff M to M/S pairs survive the first configured policy');
    $pdo->prepare('DELETE FROM settings WHERE setting_key=?')->execute(['staff_bogo_policy']);
    // Existing public offers remain a fallback and still retain their schedule.
    $pdo->prepare("INSERT INTO offers (name,offer_type,scope,scope_id,buy_qty,get_qty,weekdays,size_rules,is_active) VALUES (?,'bogo','category',?,1,1,?,?,1)")->execute(['Rollback scheduled offer',$category,'["monday"]','{"monday":{"S":"S"}}']);
    $publicPaid = $paid; $publicPaid['variant']['name'] = 'S'; $publicPaid['unit_price'] = 100;
    $publicFree = $free; $publicFree['variant']['name'] = 'S'; $publicFree['unit_price'] = 100;
    $monday = new DateTimeImmutable('2026-10-19 12:00:00',restaurant_timezone());
    $tuesday = $monday->modify('+1 day');
    assert_staff_bogo(matching_bogo_offer($publicPaid,$publicFree,$monday,$actor) !== null, 'Existing public S to S offer remains available to Staff as fallback');
    assert_staff_bogo(matching_bogo_offer($publicPaid,$publicFree,$monday,null) !== null, 'Customer scheduled public offer continues working');
    assert_staff_bogo(matching_bogo_offer($publicPaid,$publicFree,$tuesday,null) === null, 'Customer public offer schedule remains enforced');
    assert_staff_bogo(matching_bogo_offer($paid,$free,$tuesday,$actor)['id'] === 0, 'A scheduled public offer never disables permanent Staff Medium offer');
    echo 'PASS Staff permanent BOGO: '.$checks." assertions.\n";
} finally {
    $pdo->rollBack();
    echo "All Staff BOGO fixture writes rolled back.\n";
}
