<?php
declare(strict_types=1);

// Rollback-only regression checks. Explicitly confirm the isolated database name.
$source = file_get_contents(__DIR__ . '/../public/index.php');
$boundary = strpos($source, '$method = $_SERVER');
if ($boundary === false) throw new RuntimeException('Router boundary not found');
eval(substr($source,5,$boundary - 5));
restore_exception_handler();
if (env('APP_ENV') !== 'local' || !in_array(env('DB_HOST'),['127.0.0.1','localhost'],true) || !str_ends_with((string)env('DB_NAME'),'_test') || env('PIZZA_POS_TEST_DATABASE') !== env('DB_NAME')) throw new RuntimeException('Explicit isolated test database confirmation is required');
function assert_pos(bool $condition,string $message): void { if (!$condition) throw new RuntimeException($message); echo "PASS: $message\n"; }
function rejects_pos(callable $action,string $message): void {
    try { $action(); } catch (ApiException $error) { assert_pos($error->status === 422,$message); return; }
    throw new RuntimeException($message . ': invalid input accepted');
}
$pdo = db();
$pdo->beginTransaction();
try {
    $suffix = bin2hex(random_bytes(6));
    $pdo->prepare('INSERT INTO categories (name,slug,is_active) VALUES (?,?,1)')->execute(['POS rollback category','pos-rollback-'.$suffix]);
    $categoryId = (int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO menu_items (category_id,name,slug,price,stock,is_active) VALUES (?,?,?,?,100,1)')->execute([$categoryId,'POS rollback pizza','pos-rollback-'.$suffix,100]);
    $productId = (int)$pdo->lastInsertId();
    save_product_size_prices($productId,['S'=>100,'M'=>200,'L'=>300]);
    $query = $pdo->prepare('SELECT * FROM menu_item_variants WHERE menu_item_id=? ORDER BY sort_order');
    $query->execute([$productId]);
    $variants = [];
    foreach ($query->fetchAll() as $variant) $variants[$variant['name']] = $variant;
    $pdo->prepare('INSERT INTO menu_option_groups (name,slug,is_active) VALUES (?,?,1)')->execute(['Rollback Topping '.$suffix,'pos-topping-'.$suffix]);
    $groupId = (int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO menu_item_options (group_id,name,slug,fixed_price,medium_price,applies_to,product_ids,is_active) VALUES (?,?,?,?,?,?,?,1)')->execute([$groupId,'Rollback topping','pos-option-'.$suffix,10,20,'pizza',json_encode([$productId])]);
    $optionId = (int)$pdo->lastInsertId();
    $actor = ['id'=>1,'role'=>'admin'];
    $paid = ['id'=>$productId,'variant_id'=>(int)$variants['M']['id'],'quantity'=>1,'client_key'=>'paid'];
    foreach (['M','S','L'] as $size) {
        $free = ['id'=>$productId,'variant_id'=>(int)$variants[$size]['id'],'quantity'=>1,'client_key'=>'manual-'.$size,'is_manual_free'=>true,'manual_parent_key'=>'paid'];
        $calc = calculate_cart(prepare_staff_cart_items([$paid,$free],$actor),null,null,null,null,'takeaway',true,$actor);
        assert_pos((float)$calc['total'] === 200.0 && (float)$calc['manual_free_discount'] === (float)$variants[$size]['price'],'Medium paid + '.$size.' manual free keeps independent size prices');
        $meta = decoded_item_options(option_snapshot($calc['lines'][1]));
        assert_pos($meta['manual_free']['applied_by'] === 1 && $meta['manual_free']['parent_key'] === 'paid','Manual free snapshot records original price, actor and paid relationship');
    }
    rejects_pos(fn()=>selected_option_quantities(['option_selections'=>[['id'=>$optionId,'quantity'=>1],['id'=>$optionId,'quantity'=>2]]]),'Duplicate topping IDs are rejected');
    rejects_pos(fn()=>selected_option_quantities(['option_selections'=>[['id'=>$optionId,'quantity'=>21]]]),'Topping quantity is bounded');
    $withOptions = $paid + ['option_selections'=>[['id'=>$optionId,'quantity'=>2]]];
    $calc = calculate_cart([$withOptions],null,null,null,null,'takeaway',false,$actor);
    assert_pos((float)$calc['total'] === 240.0 && $calc['lines'][0]['options'][0]['quantity'] === 2,'Topping quantity uses selected pizza size price');
    $old = ['id'=>9001,'menu_item_id'=>$productId,'name_snapshot'=>'Original order pizza name','variant_id'=>(int)$variants['M']['id'],'quantity'=>1,'unit_price'=>240,'options_snapshot'=>option_snapshot($calc['lines'][0])];
    $pdo->prepare('UPDATE menu_item_options SET medium_price=90,is_active=0 WHERE id=?')->execute([$optionId]);
    $pdo->prepare('UPDATE menu_item_variants SET price=900,is_active=0 WHERE id=?')->execute([$variants['M']['id']]);
    $edit = $withOptions + ['order_item_id'=>9001];
    $historical = prepare_staff_cart_items([$edit],$actor,[$old]);
    assert_pos((float)calculate_cart($historical,null,null,null,null,'takeaway',false,$actor)['total'] === 240.0,'Unchanged historical selections retain recorded prices after deactivation');
    assert_pos(calculate_cart($historical,null,null,null,null,'takeaway',false,$actor)['lines'][0]['item']['name'] === 'Original order pizza name','Unchanged historical product names retain the invoice snapshot');
    $more = $edit; $more['quantity'] = 2;
    rejects_pos(fn()=>prepare_staff_cart_items([$more],$actor,[$old]),'An inactive historical size cannot be increased');
    $pdo->prepare('UPDATE menu_item_variants SET is_active=1 WHERE id=?')->execute([$variants['M']['id']]);
    rejects_pos(fn()=>prepare_staff_cart_items([$more],$actor,[$old]),'An inactive historical topping cannot be increased');
    $pdo->prepare('UPDATE menu_item_options SET is_active=1,product_ids=? WHERE id=?')->execute(['[999999999]',$optionId]);
    rejects_pos(fn()=>prepare_staff_cart_items([$more],$actor,[$old]),'A historical topping whose applicability changed cannot be increased');
    $promotion = $edit; $promotion['is_manual_free'] = true; $promotion['manual_parent_key'] = 'another-paid';
    $preparedPromotion = prepare_staff_cart_items([$promotion],$actor,[$old]);
    assert_pos(!array_key_exists('__historical_unit',$preparedPromotion[0]),'A newly applied free promotion cannot borrow an archived historical availability exemption');
    $foreign = $edit; $foreign['order_item_id'] = 9002;
    rejects_pos(fn()=>prepare_staff_cart_items([$foreign],$actor,[$old]),'An unrelated order item cannot supply a historical price');
    rejects_pos(fn()=>prepare_staff_cart_items([$edit,$edit],$actor,[$old]),'The same existing order item cannot be submitted twice');
    $pdo->prepare('INSERT INTO staff_delivery_slabs (name,min_order_amount,max_order_amount,charge,priority,is_active) VALUES (?,0,250,17,0,1)')->execute(['Rollback explicit charge']);
    $slabId = (int)$pdo->lastInsertId();
    $quote = staff_delivery_quote(240,$slabId);
    assert_pos($quote['charge'] === 17.0,'Staff delivery quote needs only configured slab and order amount');
    $pdo->prepare('UPDATE staff_delivery_slabs SET charge=90,is_active=0 WHERE id=?')->execute([$slabId]);
    $order = ['order_type'=>'delivery','staff_delivery_snapshot'=>json_encode($quote),'delivery_charge'=>17];
    assert_pos((float)staff_delivery_for_edit($order,['staff_delivery_slab_id'=>$slabId],240)['charge'] === 17.0,'Unchanged staff delivery selection retains recorded snapshot after current price changes');
    rejects_pos(fn()=>staff_delivery_quote(240,$slabId),'An inactive staff delivery slab cannot be used on a new order');
    assert_pos(staff_delivery_for_edit(['order_type'=>'delivery','staff_delivery_snapshot'=>null,'delivery_charge'=>27],[],240) === null,'Legacy staff delivery retains recorded charge without invented coordinates');
} finally {
    $pdo->rollBack();
    echo "All POS fixture writes rolled back.\n";
}
