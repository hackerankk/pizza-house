<?php
declare(strict_types=1);
require_once __DIR__ . '/product_type.php';

// Staff-only promotions and delivery prices do not change customer checkout rules.
function discount_description_text(string $text): ?string {
    if ($text === '') return null;
    preg_match('/^.{0,255}/us',$text,$matches);
    return $matches[0] ?? null;
}

function staff_delivery_quote(float $orderAmount, ?int $slabId = null): array {
    // Address-only staff deliveries have no fee; explicit legacy slab requests remain supported.
    if ($slabId === null) return ['id'=>null,'name'=>'Staff delivery','min_order_amount'=>0,'max_order_amount'=>null,'charge'=>0.0,'priority'=>0];
    $sql = 'SELECT * FROM staff_delivery_slabs WHERE is_active=1 AND min_order_amount<=? AND (max_order_amount IS NULL OR max_order_amount>=?)';
    $params = [$orderAmount, $orderAmount];
    if ($slabId !== null) { $sql .= ' AND id=?'; $params[] = $slabId; }
    $query = db()->prepare($sql . ' ORDER BY priority ASC,min_order_amount DESC,id ASC LIMIT 1');
    $query->execute($params);
    $slab = $query->fetch();
    if (!$slab) throw new ApiException($slabId ? 'Selected staff delivery charge is unavailable for this order amount' : 'Admin must configure an applicable staff delivery charge before creating this delivery', 422);
    return ['id'=>(int)$slab['id'],'name'=>(string)$slab['name'],'min_order_amount'=>money((float)$slab['min_order_amount']),'max_order_amount'=>$slab['max_order_amount'] === null ? null : money((float)$slab['max_order_amount']),'charge'=>money((float)$slab['charge']),'priority'=>(int)$slab['priority']];
}

function selected_option_quantities(array $item): array {
    $selected = [];
    if (array_key_exists('option_selections', $item)) {
        foreach ($item['option_selections'] as $selection) {
            $id = (int)($selection['id'] ?? 0);
            $quantity = $selection['quantity'] ?? 0;
            if ($id < 1 || filter_var($quantity, FILTER_VALIDATE_INT) === false || (int)$quantity < 1 || (int)$quantity > 20 || isset($selected[$id])) throw new ApiException('Invalid or duplicate topping selection', 422);
            $selected[$id] = (int)$quantity;
        }
        if (!empty($item['option_ids'])) {
            $legacy = array_values(array_unique(array_map('intval', $item['option_ids'])));
            $ids = array_keys($selected); sort($ids); sort($legacy);
            if ($ids !== $legacy) throw new ApiException('Conflicting topping selections', 422);
        }
    } else {
        foreach ($item['option_ids'] ?? [] as $id) {
            $id = (int)$id;
            if ($id < 1 || isset($selected[$id])) throw new ApiException('Invalid or duplicate topping selection', 422);
            $selected[$id] = 1;
        }
    }
    ksort($selected);
    return $selected;
}

function option_applies_to_product(array $option, array $product, ?array $variant): bool {
    if (($option['applies_to'] ?? 'pizza') === 'pizza' && (!product_is_pizza($product) || !in_array((string)($variant['name'] ?? ''), ['S','M','L'], true))) return false;
    $categories = json_int_list($option['category_ids'] ?? '');
    $products = json_int_list($option['product_ids'] ?? '');
    return (!$categories && !$products) || in_array((int)$product['id'], $products, true) || in_array((int)$product['category_id'], $categories, true);
}

function prepare_staff_cart_items(array $items, array $actor, array $oldItems = []): array {
    $oldById = [];
    foreach ($oldItems as $old) $oldById[(int)$old['id']] = $old;
    $seen = [];
    foreach ($items as &$item) {
        // Only this server-side preparation may attach trusted historical data.
        foreach (array_keys($item) as $key) if (str_starts_with((string)$key,'__')) unset($item[$key]);
        $selected = selected_option_quantities($item);
        $oldId = (int)($item['order_item_id'] ?? 0);
        if ($oldId) {
            if (!isset($oldById[$oldId]) || isset($seen[$oldId])) throw new ApiException('Invalid or duplicate existing order item', 422);
            $seen[$oldId] = true;
            $old = $oldById[$oldId];
            $meta = decoded_item_options($old['options_snapshot'] ?? null);
            $previous = [];
            foreach ($meta['options'] as $option) $previous[(int)$option['id']] = (int)($option['quantity'] ?? 1);
            ksort($previous);
            $samePromotion = !empty($meta['manual_free']['is_free']) === !empty($item['is_manual_free']) && !empty($meta['bogo']['is_free']) === !empty($item['is_bogo_free']);
            if (!empty($item['is_manual_free'])) $samePromotion = $samePromotion && (string)($meta['manual_free']['parent_key'] ?? '') === (string)($item['manual_parent_key'] ?? '');
            if (!empty($item['is_bogo_free'])) $samePromotion = $samePromotion && (string)($meta['bogo']['parent_key'] ?? '') === (string)($item['bogo_parent_key'] ?? '');
            if ((int)$old['menu_item_id'] === (int)$item['id'] && (int)($old['variant_id'] ?? 0) === (int)($item['variant_id'] ?? 0) && $previous === $selected && $samePromotion) {
                $item['__historical_unit'] = (float)$old['unit_price'];
                $item['__historical_name'] = (string)$old['name_snapshot'];
                $item['__historical_options'] = $meta['options'];
                $item['__historical_variant'] = $meta['variant'] ?? (empty($old['variant_id']) ? null : ['id'=>(int)$old['variant_id'],'name'=>$old['variant_snapshot']]);
                $item['__historical_quantity'] = (int)$old['quantity'];
                if ((int)$item['quantity'] > (int)$old['quantity']) {
                    $availability = db()->prepare('SELECT * FROM menu_items WHERE id=?');
                    $availability->execute([$item['id']]);
                    $currentProduct = $availability->fetch();
                    if (!$currentProduct || !(int)$currentProduct['is_active']) throw new ApiException('An unavailable product cannot be increased',422);
                    $currentVariant = null;
                    if (!empty($old['variant_id'])) {
                        $variantQuery = db()->prepare('SELECT * FROM menu_item_variants WHERE id=? AND menu_item_id=? AND is_active=1');
                        $variantQuery->execute([$old['variant_id'],$item['id']]);
                        $currentVariant = $variantQuery->fetch();
                        if (!$currentVariant) throw new ApiException('An unavailable product size cannot be increased',422);
                    }
                    if ($selected) {
                        $available = db()->prepare('SELECT o.* FROM menu_item_options o JOIN menu_option_groups g ON g.id=o.group_id WHERE o.is_active=1 AND g.is_active=1 AND o.id IN (' . implode(',',array_fill(0,count($selected),'?')) . ')');
                        $available->execute(array_keys($selected));
                        $currentOptions = $available->fetchAll();
                        if (count($currentOptions) !== count($selected)) throw new ApiException('An unavailable topping cannot be increased',422);
                        foreach ($currentOptions as $option) if (!option_applies_to_product($option,$currentProduct,$currentVariant)) throw new ApiException('A topping that no longer applies cannot be increased',422);
                    }
                }
                if (!empty($meta['manual_free']['is_free']) && !empty($item['is_manual_free']) && (string)($meta['manual_free']['parent_key'] ?? '') === (string)($item['manual_parent_key'] ?? '')) $item['__manual_actor'] = (int)$meta['manual_free']['applied_by'];
            }
        }
        if (!empty($item['is_manual_free'])) require_staff_permission($actor, 'apply_free_pizza');
    }
    unset($item);
    return prepare_staff_bogo_history($items,$oldItems);
}

function staff_delivery_for_edit(array $order, array $meta, float $amount): ?array {
    $selectedId = !empty($meta['staff_delivery_slab_id']) ? (int)$meta['staff_delivery_slab_id'] : null;
    $snapshot = json_decode((string)($order['staff_delivery_snapshot'] ?? ''),true);
    // An address-only edit must preserve the charge recorded on the existing order.
    if (($order['order_type'] ?? '') === 'delivery' && $selectedId === null) return is_array($snapshot) ? array_merge($snapshot,['charge'=>(float)($order['delivery_charge'] ?? 0)]) : null;
    if (($order['order_type'] ?? '') === 'delivery') {
        if (is_array($snapshot) && (!$selectedId || $selectedId === (int)($snapshot['id'] ?? 0)) && $amount >= (float)($snapshot['min_order_amount'] ?? 0) && (($snapshot['max_order_amount'] ?? null) === null || $amount <= (float)$snapshot['max_order_amount'])) return $snapshot;
        // Old staff orders keep their recorded charge until an explicit new rule is selected.
        if (!$snapshot && !$selectedId) return null;
    }
    return staff_delivery_quote($amount,$selectedId);
}

function manual_free_discount(array $lines, array $actor): array {
    $paid = [];
    foreach ($lines as $line) if (empty($line['is_bogo_free']) && empty($line['is_manual_free'])) $paid[(string)$line['client_key']] = $line;
    $used = [];
    $discount = 0.0;
    $details = [];
    foreach ($lines as $line) {
        if (empty($line['is_manual_free'])) continue;
        require_staff_permission($actor, 'apply_free_pizza');
        $parentKey = (string)$line['manual_parent_key'];
        $parent = $paid[$parentKey] ?? null;
        if (!$parent || !product_is_pizza($parent['item']) || !product_is_pizza($line['item']) || !in_array((string)($parent['variant']['name'] ?? ''), ['S','M','L'], true) || !in_array((string)($line['variant']['name'] ?? ''), ['S','M','L'], true)) throw new ApiException('A manual free pizza must be linked to a paid pizza with valid sizes', 422);
        if ((int)$line['item']['category_id'] !== (int)$parent['item']['category_id']) require_staff_permission($actor, 'free_pizza_cross_category');
        $used[$parentKey] = ($used[$parentKey] ?? 0) + (int)$line['quantity'];
        if ($used[$parentKey] > (int)$parent['quantity']) throw new ApiException('Only one manual free pizza is allowed per paid pizza quantity', 422);
        $amount = money((float)$line['unit_price'] * (int)$line['quantity']);
        $discount += $amount;
        $details[] = ['parent_key'=>$parentKey,'item'=>$line['item']['name'],'size'=>$line['variant']['name'],'quantity'=>(int)$line['quantity'],'discount'=>$amount];
    }
    return ['discount'=>money($discount),'details'=>$details];
}

function audit_staff_adjustments(int $orderId, int $actorId, string $action, array $calc, ?array $delivery, bool $force = false): void {
    $free = [];
    foreach ($calc['lines'] as $line) if (!empty($line['is_manual_free'])) $free[] = ['client_key'=>$line['client_key'],'parent_key'=>$line['manual_parent_key'],'product_id'=>(int)$line['item']['id'],'variant_id'=>(int)$line['variant']['id'],'quantity'=>(int)$line['quantity'],'original_price'=>$line['unit_price'],'discount'=>money((float)$line['unit_price'] * (int)$line['quantity']),'applied_by'=>(int)$line['manual_applied_by']];
    if (!$free && $delivery === null && !$force) return;
    db()->prepare('INSERT INTO staff_order_adjustment_audit (order_id,actor_id,action,details) VALUES (?,?,?,?)')->execute([$orderId,$actorId,$action,json_encode(['manual_free'=>$free,'staff_delivery'=>$delivery],JSON_UNESCAPED_SLASHES)]);
}

function handle_staff_delivery_admin(string $path, string $method, array $data): void {
    if (!preg_match('#^/admin/staff-delivery-slabs(?:/([1-9][0-9]*))?$#D',$path,$match)) return;
    $id = (int)($match[1] ?? 0);
    if ($method === 'GET' && !$id) json_response(['items'=>db()->query('SELECT * FROM staff_delivery_slabs ORDER BY priority ASC,min_order_amount DESC,id ASC')->fetchAll()]);
    $existing = [];
    if ($id) {
        $query = db()->prepare('SELECT * FROM staff_delivery_slabs WHERE id=?'); $query->execute([$id]);
        $existing = $query->fetch();
        if (!$existing) json_response(['error'=>'Staff delivery charge not found'],404);
    }
    if ($id && $method === 'DELETE') {
        db()->prepare('UPDATE staff_delivery_slabs SET is_active=0 WHERE id=?')->execute([$id]);
        json_response(['ok'=>true,'archived'=>true]);
    }
    if (($method === 'POST' && !$id) || ($method === 'PUT' && $id)) {
        $fields = array_flip(['name','min_order_amount','max_order_amount','charge','priority','is_active']);
        $payload = array_replace(['min_order_amount'=>0,'max_order_amount'=>null,'priority'=>100,'is_active'=>1],array_intersect_key($existing,$fields),array_intersect_key($data,$fields));
        $payload['name'] = trim((string)($payload['name'] ?? ''));
        if ($payload['name'] === '' || !array_key_exists('charge',$payload) || !valid_decimal($payload['charge'])) throw new ApiException('Enter a staff delivery name and an explicit valid charge',422);
        foreach (['min_order_amount','charge'] as $key) {
            if (!valid_decimal($payload[$key]) || (float)$payload[$key] < 0 || (float)$payload[$key] > 99999999.99) throw new ApiException('Invalid staff delivery amount',422);
            $payload[$key] = money((float)$payload[$key]);
        }
        if ($payload['max_order_amount'] === '') $payload['max_order_amount'] = null;
        if ($payload['max_order_amount'] !== null) {
            if (!valid_decimal($payload['max_order_amount']) || (float)$payload['max_order_amount'] < $payload['min_order_amount']) throw new ApiException('Maximum order amount must be at least the minimum',422);
            $payload['max_order_amount'] = money((float)$payload['max_order_amount']);
        }
        $payload['priority'] = (int)$payload['priority']; $payload['is_active'] = (int)$payload['is_active'];
        if ($id) {
            $sets = implode(',',array_map(fn($key)=>"$key=?",array_keys($payload)));
            db()->prepare("UPDATE staff_delivery_slabs SET $sets WHERE id=?")->execute([...array_values($payload),$id]);
        } else {
            db()->prepare('INSERT INTO staff_delivery_slabs (' . implode(',',array_keys($payload)) . ') VALUES (' . implode(',',array_fill(0,count($payload),'?')) . ')')->execute(array_values($payload));
            $id = (int)db()->lastInsertId();
        }
        json_response(['ok'=>true,'id'=>$id],$method === 'POST' ? 201 : 200);
    }
    json_response(['error'=>'Unsupported staff delivery operation'],405);
}

function topping_scope_payload(array $payload): array {
    foreach (['category_ids'=>'categories','product_ids'=>'menu_items'] as $key=>$table) {
        $ids = json_int_list($payload[$key] ?? '');
        if ($ids) {
            $query = db()->prepare("SELECT COUNT(*) FROM $table WHERE id IN (" . implode(',',array_fill(0,count($ids),'?')) . ')');
            $query->execute($ids);
            if ((int)$query->fetchColumn() !== count($ids)) throw new ApiException('Selected topping categories or products no longer exist',422);
        }
        $payload[$key] = json_encode($ids);
    }
    return $payload;
}
