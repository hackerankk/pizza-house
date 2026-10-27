<?php
declare(strict_types=1);
require_once __DIR__ . '/../src/order_state.php';
require_once __DIR__ . '/../src/product_type.php';
function verify_state(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); echo "PASS: $message\n"; }
foreach (['takeaway','dine_in'] as $type) {
 $order = ['status'=>'picked_up','order_type'=>$type];
 verify_state(order_is_completed($order) && order_is_terminal($order) && !order_can_edit($order), "$type pickup is complete and immutable");
}
verify_state(!order_is_completed(['status'=>'picked_up','order_type'=>'delivery']), 'Delivery pickup is not a completed delivery');
foreach (['cancelled','delivered','out_for_delivery'] as $status) verify_state(!order_can_edit(['status'=>$status,'order_type'=>'delivery']), "$status cannot be edited");
verify_state(order_can_edit(['status'=>'accepted','order_type'=>'takeaway']), 'Active takeaway can still be edited');
verify_state(!product_is_pizza(['name'=>'Spicy Burger','category_slug'=>'burgers','is_pizza'=>true]), 'Backend ignores a forged pizza flag for burgers');
verify_state(!product_is_pizza(['name'=>'Vanilla Cone','category_slug'=>'ice-cream']), 'Ice cream is not pizza');
verify_state(product_is_pizza(['name'=>'Fresh Veggie','category_slug'=>'classic-veg']), 'Pizza category identifies names without pizza');
