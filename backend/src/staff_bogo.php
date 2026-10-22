<?php
declare(strict_types=1);

// This private Staff POS policy never changes scheduled public/customer offers.
function staff_bogo_default_config(): array {
    return ['name'=>'Staff BOGO · Every day','allowed_free_sizes'=>['M'=>['M','S']], 'category_ids'=>[], 'product_ids'=>[], 'free_product_ids'=>[]];
}
function staff_bogo_offer_from_config(array $config): array {
    return ['id'=>0,'offer_type'=>'bogo','is_active'=>1,'buy_qty'=>1,'get_qty'=>1,'staff_always_available'=>true,'size_rules'=>[], 'weekdays'=>[], ...$config];
}
function staff_bogo_policy_schema(): array {
    return security_object([
        'name'=>security_string(120,false),
        'allowed_free_sizes'=>security_object(['M'=>security_list(security_enum(['M','S']),2,1)],['M']),
        'category_ids'=>security_list(security_id(),2000), 'product_ids'=>security_list(security_id(),2000), 'free_product_ids'=>security_list(security_id(),2000),
    ],['name','allowed_free_sizes','category_ids','product_ids','free_product_ids']);
}
function staff_bogo_config(array $policy, bool $validateProducts = false): array {
    $required = array_keys(staff_bogo_default_config());
    if (array_diff(array_keys($policy),$required) || array_diff($required,array_keys($policy))) throw new ApiException('Invalid staff BOGO policy fields',422);
    if (!is_string($policy['name']) || trim($policy['name']) === '' || strlen($policy['name']) > 120 || !preg_match('//u',$policy['name']) || preg_match('/[\x00-\x1f\x7f]/',$policy['name'])) throw new ApiException('Enter a valid staff BOGO name',422);
    $sizes = $policy['allowed_free_sizes'];
    if (!is_array($sizes) || array_keys($sizes) !== ['M'] || !is_array($sizes['M']) || !array_is_list($sizes['M']) || count($sizes['M']) < 1 || count($sizes['M']) > 2 || count(array_unique($sizes['M'],SORT_REGULAR)) !== count($sizes['M'])) throw new ApiException('Select Medium, Small, or both free sizes',422);
    foreach ($sizes['M'] as $size) if (!in_array($size,['M','S'],true)) throw new ApiException('Select Medium, Small, or both free sizes',422);
    $config = ['name'=>trim($policy['name']),'allowed_free_sizes'=>['M'=>array_values(array_intersect(['M','S'],$sizes['M']))]];
    foreach (['category_ids','product_ids','free_product_ids'] as $key) {
        $ids = $policy[$key];
        if (!is_array($ids) || !array_is_list($ids) || count($ids) > 2000) throw new ApiException('Invalid staff BOGO product selection',422);
        $seen = [];
        foreach ($ids as $id) {
            if (!is_int($id) || $id < 1 || $id > 9007199254740991 || isset($seen[$id])) throw new ApiException('Staff BOGO selections require unique positive IDs',422);
            $seen[$id] = true;
        }
        sort($ids,SORT_NUMERIC); $config[$key] = $ids;
        if (!$validateProducts || !$ids) continue;
        $placeholders = implode(',',array_fill(0,count($ids),'?'));
        if ($key === 'category_ids') {
            $sql = "SELECT COUNT(*) FROM categories c WHERE c.id IN ($placeholders) AND c.is_active=1 AND EXISTS (SELECT 1 FROM menu_items p JOIN menu_item_variants v ON v.menu_item_id=p.id WHERE p.category_id=c.id AND p.is_active=1 AND v.is_active=1 AND v.name='M' AND (CASE WHEN v.price>0 THEN v.price ELSE p.price END)>0)";
        } else {
            $allowedSizes = $key === 'product_ids' ? ['M'] : $config['allowed_free_sizes']['M'];
            $sizePlaceholders = implode(',',array_fill(0,count($allowedSizes),'?'));
            $sql = "SELECT COUNT(*) FROM menu_items p JOIN categories c ON c.id=p.category_id WHERE p.id IN ($placeholders) AND p.is_active=1 AND c.is_active=1 AND EXISTS (SELECT 1 FROM menu_item_variants v WHERE v.menu_item_id=p.id AND v.is_active=1 AND (CASE WHEN v.price>0 THEN v.price ELSE p.price END)>0 AND v.name IN ($sizePlaceholders))";
            $ids = [...$ids,...$allowedSizes];
        }
        $query = db()->prepare($sql); $query->execute($ids);
        if ((int)$query->fetchColumn() !== count($config[$key])) throw new ApiException('Select active pizza categories/products with an eligible size',422);
    }
    return $config;
}
function staff_bogo_policy_record(): array {
    $query = db()->prepare('SELECT setting_value FROM settings WHERE setting_key=?'); $query->execute(['staff_bogo_policy']);
    $raw = $query->fetchColumn();
    if ($raw === false) return ['policy'=>staff_bogo_offer_from_config(staff_bogo_default_config()),'revision'=>'default-v1'];
    // Fail closed if stored policy is damaged; never silently broaden its scope.
    $record = json_decode((string)$raw,true,16,JSON_THROW_ON_ERROR);
    if (!is_array($record['policy'] ?? null)) throw new RuntimeException('Invalid stored staff BOGO policy');
    return ['policy'=>staff_bogo_offer_from_config(staff_bogo_config($record['policy'])), 'revision'=>hash('sha256',(string)$raw), 'updated_at'=>$record['updated_at'] ?? null];
}
function staff_everyday_bogo_offer(): array { return staff_bogo_policy_record()['policy']; }
function staff_can_manage_bogo(array $actor): bool {
    return ($actor['role'] ?? '') === 'admin' || (($actor['role'] ?? '') === 'staff' && !empty(staff_permissions((int)$actor['id'])['manage_staff_bogo']));
}
function save_staff_bogo_policy(array $actor, array $policy, string $revision): array {
    if (!in_array($actor['role'] ?? '',['staff','admin'],true) || !staff_can_manage_bogo($actor)) throw new ApiException('Staff BOGO management permission required',403);
    $config = staff_bogo_config($policy,true);
    $pdo = db();
    if ($pdo->inTransaction()) throw new RuntimeException('Staff BOGO policy save requires its own transaction');
    $pdo->beginTransaction();
    try {
        // Read current permission under a lock: stale browser permissions cannot
        // bypass revocation while this policy is being saved.
        if (($actor['role'] ?? '') !== 'admin') {
            $permission = $pdo->prepare('SELECT is_allowed FROM staff_permissions WHERE user_id=? AND permission_key=? FOR UPDATE');
            $permission->execute([(int)$actor['id'],'manage_staff_bogo']);
            if ((int)$permission->fetchColumn() !== 1) throw new ApiException('Staff BOGO management permission required',403);
        }
        $query = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key=?');
        $query->execute(['staff_bogo_policy']); $before = $query->fetchColumn();
        $currentRevision = $before === false ? 'default-v1' : hash('sha256',(string)$before);
        if (!hash_equals($currentRevision,$revision)) throw new ApiException('Staff BOGO rules changed. Reload the latest rules before saving.',409);
        $value = json_encode(['policy'=>$config,'updated_by'=>(int)$actor['id'],'updated_at'=>gmdate(DATE_ATOM),'previous_revision'=>$currentRevision,'change_id'=>bin2hex(random_bytes(16))],JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        if (strlen($value) > 60000) throw new ApiException('Staff BOGO selections are too large. Select fewer categories or products.',422);
        if ($before === false) {
            try { $pdo->prepare('INSERT INTO settings (setting_key,setting_value) VALUES (?,?)')->execute(['staff_bogo_policy',$value]); }
            catch (PDOException $error) {
                if ((string)$error->getCode() === '23000') throw new ApiException('Staff BOGO rules changed. Reload the latest rules before saving.',409);
                throw $error;
            }
        } else {
            // Compare stored bytes, not collation-insensitive strings, for CAS.
            $update = $pdo->prepare('UPDATE settings SET setting_value=? WHERE setting_key=? AND BINARY setting_value=BINARY ?');
            $update->execute([$value,'staff_bogo_policy',$before]);
            if ($update->rowCount() !== 1) throw new ApiException('Staff BOGO rules changed. Reload the latest rules before saving.',409);
        }
        $pdo->commit();
        return ['policy'=>staff_bogo_offer_from_config($config),'revision'=>hash('sha256',$value),'can_manage'=>true];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
function staff_bogo_product_in_scope(array $product, array $policy): bool {
    $categories = $policy['category_ids']; $products = $policy['product_ids'];
    return (!$categories && !$products) || in_array((int)$product['id'],$products,true) || in_array((int)$product['category_id'],$categories,true);
}
function staff_bogo_pair_allowed_by_policy(array $paid, array $free, array $policy): bool {
    if (!empty($paid['is_bogo_free']) || !empty($paid['is_manual_free']) || !empty($free['is_manual_free'])) return false;
    $paidSize = pizza_size_code((string)($paid['variant']['name'] ?? '')); $freeSize = pizza_size_code((string)($free['variant']['name'] ?? ''));
    $categoryId = (int)($paid['item']['category_id'] ?? 0); $freeProducts = $policy['free_product_ids'];
    return in_array($freeSize,$policy['allowed_free_sizes'][$paidSize] ?? [],true)
        && $categoryId > 0 && $categoryId === (int)($free['item']['category_id'] ?? 0)
        && staff_bogo_product_in_scope($paid['item'],$policy)
        && ($freeProducts ? in_array((int)$free['item']['id'],$freeProducts,true) : staff_bogo_product_in_scope($free['item'],$policy))
        && (float)$free['unit_price'] <= (float)$paid['unit_price'];
}
function staff_everyday_bogo_pair_allowed(array $paid, array $free, ?array $actor): bool {
    return in_array($actor['role'] ?? '',['staff','admin'],true) && staff_bogo_pair_allowed_by_policy($paid,$free,staff_everyday_bogo_offer());
}
function matching_staff_bogo_policy(array $paid, array $free, ?array $actor): ?array {
    if (!in_array($actor['role'] ?? '',['staff','admin'],true)) return null;
    $historical = $free['__historical_staff_bogo_policy'] ?? null;
    if (is_array($historical) && ($free['__historical_staff_bogo_parent'] ?? null) === ($paid['client_key'] ?? null) && staff_bogo_pair_allowed_by_policy($paid,$free,$historical)) return $historical;
    $current = $actor['__staff_bogo_policy'] ?? staff_everyday_bogo_offer();
    return staff_bogo_pair_allowed_by_policy($paid,$free,$current) ? $current : null;
}

function prepare_staff_bogo_history(array $items, array $oldItems): array {
    $oldById = []; $oldByKey = []; $currentByKey = [];
    foreach ($oldItems as $old) {
        $meta = decoded_item_options($old['options_snapshot'] ?? null);
        $oldById[(int)$old['id']] = ['row'=>$old,'meta'=>$meta];
        if (($meta['client_key'] ?? '') !== '') $oldByKey[$meta['client_key']] = ['row'=>$old,'meta'=>$meta];
    }
    foreach ($items as $item) $currentByKey[(string)($item['client_key'] ?? '')] = $item;
    foreach ($items as &$item) {
        if (empty($item['is_bogo_free']) || !empty($item['is_manual_free']) || !array_key_exists('__historical_unit',$item)) continue;
        $original = $oldById[(int)($item['order_item_id'] ?? 0)] ?? null;
        if (!$original || empty($original['meta']['bogo']['is_free']) || (int)$item['quantity'] > (int)$original['row']['quantity']) continue;
        $meta = $original['meta'];
        $parentKey = (string)($meta['bogo']['parent_key'] ?? '');
        if ($parentKey === '' || (string)($item['bogo_parent_key'] ?? '') !== $parentKey || (string)($item['client_key'] ?? '') !== (string)($meta['client_key'] ?? '')) continue;
        $oldParent = $oldByKey[$parentKey] ?? null; $parent = $currentByKey[$parentKey] ?? null;
        if (!$oldParent || !$parent || !array_key_exists('__historical_unit',$parent)
            || !empty($parent['is_bogo_free']) || !empty($parent['is_manual_free'])
            || !empty($oldParent['meta']['bogo']['is_free']) || !empty($oldParent['meta']['manual_free']['is_free'])
            || (int)($parent['order_item_id'] ?? 0) !== (int)$oldParent['row']['id']
            || (int)$parent['quantity'] > (int)$oldParent['row']['quantity']) continue;
        $saved = $meta['bogo']['staff_policy'] ?? null;
        // Legacy Staff orders predate policy snapshots and were created using
        // the original all-pizza M→M/S policy. Only exact existing pairs qualify.
        if ($saved === null) $saved = staff_bogo_offer_from_config(staff_bogo_default_config());
        if (!is_array($saved) || empty($saved['staff_always_available'])) continue;
        try { $policy = staff_bogo_offer_from_config(staff_bogo_config(array_intersect_key($saved,staff_bogo_default_config()))); }
        catch (ApiException $error) { continue; }
        $item['__historical_staff_bogo_policy'] = $policy;
        $item['__historical_staff_bogo_parent'] = $parentKey;
    }
    unset($item);
    return $items;
}
