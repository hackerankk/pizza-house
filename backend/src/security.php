<?php
declare(strict_types=1);

// The HTTP boundary is deliberately separate from pricing/business validation.
class RequestValidationException extends RuntimeException {
    public function __construct(public string $field) { parent::__construct('Invalid request input'); }
}
function security_config(string $name, int $default): int {
    $value = env($name);
    if ($value === null || $value === '') return $default;
    if (!ctype_digit($value) || (int)$value < 1 || (int)$value > 100000000) throw new RuntimeException('Invalid security configuration: ' . $name);
    return (int)$value;
}

function security_log_exception(Throwable $error, string $context = 'request'): string {
    $id = bin2hex(random_bytes(8));
    $detail = (string)$error;
    foreach ($GLOBALS['security_private_values'] ?? [] as $secret) {
        if (strlen($secret) >= 4) $detail = str_replace($secret, '[redacted]', $detail);
    }
    foreach (['DB_PASS','JWT_SECRET','RAZORPAY_KEY_SECRET','WHATSAPP_TOKEN','VAPID_PRIVATE_KEY','SMTP_PASSWORD','RATE_LIMIT_SECRET','GOOGLE_MAPS_API_KEY','GOOGLE_MAPS_BROWSER_API_KEY'] as $key) {
        $secret = env($key, '');
        if (strlen($secret) >= 4) $detail = str_replace($secret, '[redacted]', $detail);
    }
    error_log('[The Pizza House][' . $id . '][' . $context . '] ' . $detail);
    return $id;
}

function security_reject(string $field): never {
    throw new RequestValidationException($field);
}

function security_string(int $max, bool $empty = true, ?string $pattern = null): array {
    return ['type' => 'string', 'max' => $max, 'empty' => $empty, 'pattern' => $pattern];
}
function security_enum(array $values, bool $empty = false): array { return ['type' => 'enum', 'values' => $values, 'empty' => $empty]; }
function security_number(float $min = 0, float $max = 99999999.99, bool $empty = false): array { return ['type' => 'number', 'min' => $min, 'max' => $max, 'empty' => $empty]; }
function security_id(bool $empty = false): array { return ['type' => 'integer', 'min' => 1, 'max' => 9007199254740991, 'empty' => $empty]; }
function security_object(array $fields, array $required = []): array { return ['type' => 'object', 'fields' => $fields, 'required' => $required]; }
function security_list(array $item, int $max = 100, int $min = 0): array { return ['type' => 'list', 'item' => $item, 'max' => $max, 'min' => $min]; }

function security_validate(mixed $value, array $schema, string $field = 'body'): void {
    if (($value === '' || $value === null) && ($schema['empty'] ?? false)) return;
    $type = $schema['type'];
    if ($type === 'object') {
        if (!$value instanceof stdClass) security_reject($field);
        $values = get_object_vars($value);
        foreach ($schema['required'] ?? [] as $key) if (!array_key_exists($key, $values)) security_reject($field . '.' . $key);
        foreach ($values as $key => $entry) {
            if (!array_key_exists($key, $schema['fields'])) security_reject($field . '.' . $key);
            security_validate($entry, $schema['fields'][$key], $field . '.' . $key);
        }
        return;
    }
    if ($type === 'map') {
        if (!$value instanceof stdClass || count(get_object_vars($value)) > ($schema['max'] ?? 100)) security_reject($field);
        foreach (get_object_vars($value) as $key => $entry) {
            if (!preg_match($schema['keys'], (string)$key)) security_reject($field);
            security_validate($entry, $schema['item'], $field . '.' . $key);
        }
        return;
    }
    if ($type === 'list') {
        if (!is_array($value) || !array_is_list($value) || count($value) > $schema['max'] || count($value) < $schema['min']) security_reject($field);
        foreach ($value as $index => $entry) security_validate($entry, $schema['item'], $field . '.' . $index);
        return;
    }
    if ($type === 'json') {
        if (!is_string($value) || strlen($value) > 16384) security_reject($field);
        try { $decoded = json_decode($value, false, 12, JSON_THROW_ON_ERROR); } catch (JsonException $e) { security_reject($field); }
        security_validate($decoded, $schema['schema'], $field);
        return;
    }
    if ($type === 'number' || $type === 'integer') {
        // Existing HTML form contracts explicitly allow canonical decimal strings.
        if (!is_int($value) && !is_float($value) && !is_string($value)) security_reject($field);
        if (is_string($value) && (strlen($value) > 24 || !preg_match($type === 'integer' ? '/^(0|[1-9][0-9]*)$/D' : '/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/D', $value))) security_reject($field);
        if (!is_numeric($value) || !is_finite((float)$value) || ($type === 'integer' && floor((float)$value) !== (float)$value) || (float)$value < $schema['min'] || (float)$value > $schema['max']) security_reject($field);
        return;
    }
    if ($type === 'flag') {
        if (!in_array($value, [true, false, 0, 1, '0', '1'], true)) security_reject($field);
        return;
    }
    if ($type === 'boolean') { if (!is_bool($value)) security_reject($field); return; }
    if ($type === 'enum') { if (!in_array($value, $schema['values'], true)) security_reject($field); return; }
    if (!is_string($value) || strlen($value) > ($schema['max'] ?? 255) || !preg_match('//u', $value) || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $value)) security_reject($field);
    if (!($schema['empty'] ?? false) && trim($value) === '') security_reject($field);
    if (isset($schema['pattern']) && !preg_match($schema['pattern'], $value)) security_reject($field);
    if ($type === 'email' && !filter_var($value, FILTER_VALIDATE_EMAIL)) security_reject($field);
    if ($type === 'url' && (!filter_var($value, FILTER_VALIDATE_URL) || !str_starts_with($value, 'https://'))) security_reject($field);
    if ($type === 'date' || $type === 'datetime') {
        $format = $type === 'date' ? '/^\d{4}-\d{2}-\d{2}$/D' : '/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/D';
        if (!preg_match($format, $value) || !checkdate((int)substr($value, 5, 2), (int)substr($value, 8, 2), (int)substr($value, 0, 4))) security_reject($field);
        if ($type === 'datetime' && ((int)substr($value, 11, 2) > 23 || (int)substr($value, 14, 2) > 59 || (isset($value[17]) && (int)substr($value, 17, 2) > 59))) security_reject($field);
        if ($type === 'datetime' && preg_match('/[+-](\d{2}):(\d{2})$/D', $value, $offset) && ((int)$offset[1] > 14 || (int)$offset[2] > 59 || ((int)$offset[1] === 14 && (int)$offset[2] !== 0))) security_reject($field);
    }
}

function security_contact_fields(): array {
    return ['name' => security_string(120, false), 'phone' => security_string(30, true, '/^[+0-9 ()-]*$/D'), 'email' => ['type' => 'email', 'max' => 180, 'empty' => true]];
}

function security_order_fields(): array {
    $item = security_object([
        'id' => security_id(), 'menu_item_id' => security_id(), 'variant_id' => security_id(true),
        'quantity' => ['type'=>'integer','min'=>1,'max'=>10000], 'option_ids' => security_list(security_id(), 100),
        'option_selections' => security_list(security_object(['id'=>security_id(),'quantity'=>['type'=>'integer','min'=>1,'max'=>20]],['id','quantity']),100),
        'order_item_id' => security_id(true), 'is_manual_free' => ['type'=>'boolean'], 'manual_parent_key' => security_string(255),
        'client_key' => security_string(255), 'is_bogo_free' => ['type'=>'boolean'],
        'bogo_group_id' => security_string(255), 'bogo_parent_key' => security_string(255),
        // Accepted for legacy callers, but prices are always recalculated by PHP.
        'price' => security_number(),
    ], ['quantity']);
    $contact = security_contact_fields();
    return [
        'items' => security_list($item, 200, 1), 'order_type' => security_enum(['delivery','takeaway','dine_in']),
        'coupon_code' => security_string(40, true, '/^[A-Za-z0-9_-]*$/D'),
        'latitude' => security_number(-90,90,true), 'longitude' => security_number(-180,180,true),
        'distance_km' => security_number(0,10000,true), 'delivery_address' => security_string(4000),
        'staff_delivery_slab_id' => security_id(true),
        'payment_mode' => security_enum(['full','partial','cod']), 'payment_method' => security_enum(['cash','online','split']),
        'cash_received' => security_number(0,99999999.99,true), 'online_received' => security_number(0,99999999.99,true),
        'table_number' => security_string(40), 'idempotency_key' => security_string(100, false, '/^[A-Za-z0-9_-]+$/D'),
        'guest' => security_object($contact, ['name','phone']),
        'customer_name' => $contact['name'] + [], 'customer_phone' => $contact['phone'], 'customer_email' => $contact['email'],
        'name' => $contact['name'], 'phone' => $contact['phone'], 'email' => $contact['email'],
        'discount_type' => security_enum(['none','fixed','percent','bogo'], true), 'discount_amount' => security_number(0,99999999.99,true),
        'discount_reason' => security_string(255), 'offer_id' => security_id(true), 'order_id' => security_id(),
    ];
}

function security_settings_fields(): array {
    $fields = [];
    foreach (['restaurant_name','restaurant_address','restaurant_phone','restaurant_email','currency','admin_new_order_custom_sound_name'] as $key) $fields[$key] = security_string($key === 'restaurant_address' ? 4000 : 180);
    foreach (['minimum_order','partial_payment_value'] as $key) $fields[$key] = security_number();
    $fields['restaurant_latitude'] = security_number(-90,90);
    $fields['restaurant_longitude'] = security_number(-180,180);
    foreach (['partial_payment_enabled','cod_enabled','full_payment_enabled','customer_login_required','razorpay_enabled','google_maps_enabled','accept_orders','force_close_orders','customer_theme_enabled','customer_dark_mode_enabled','online_ordering_enabled','delivery_enabled','takeaway_enabled','guest_checkout_enabled','customer_login_enabled','staff_pos_enabled','admin_new_order_sound_enabled'] as $key) $fields[$key] = ['type'=>'flag'];
    $fields['partial_payment_type'] = security_enum(['percent','fixed']);
    foreach (['customer_default_theme','admin_theme_mode'] as $key) $fields[$key] = security_enum(['light','dark','system']);
    $fields['order_manual_override'] = security_enum(['auto','open','closed']);
    $fields['admin_new_order_sound_tone'] = security_enum(['classic_bell','soft_chime','double_beep','urgent_ping']);
    $fields['admin_new_order_sound_source'] = security_enum(['builtin','custom']);
    $fields['admin_new_order_custom_sound_url'] = security_string(255,true,'#^$|^uploads/notifications/[A-Za-z0-9._-]+\.(mp3|wav|ogg)$#D');
    $fields['order_schedule'] = ['type'=>'json','schema'=>security_schedule_schema()];
    return $fields;
}

function security_schedule_schema(): array {
    $day = security_object(['enabled'=>['type'=>'flag'], 'open'=>security_string(5,false,'/^([01][0-9]|2[0-3]):[0-5][0-9]$/D'), 'close'=>security_string(5,false,'/^([01][0-9]|2[0-3]):[0-5][0-9]$/D')], ['enabled','open','close']);
    return security_object(array_fill_keys(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], $day));
}

function security_resource_schema(string $name): array {
    $s = fn(int $max = 255) => security_string($max);
    $flag = ['type'=>'flag']; $id = security_id(true); $money = security_number(0,99999999.99,true);
    $integer = ['type'=>'integer','min'=>0,'max'=>2147483647,'empty'=>true];
    $date = ['type'=>'datetime','max'=>35,'empty'=>true];
    $common = ['name'=>security_string(120,false), 'slug'=>security_string(140,true,'/^[a-z0-9-]*$/D'), 'is_active'=>$flag];
    $prices = ['type'=>'map','keys'=>'/^[^\x00-\x1f]{1,80}$/uD','item'=>security_number(.01),'max'=>50];
    $sizePrices = $prices; $sizePrices['keys']='/^[SML]$/D';
    $jsonIds = ['type'=>'json','schema'=>security_list(security_id(), 200)];
    $sizes = ['type'=>'map','keys'=>'/^[SML]$/D','item'=>security_enum(['S','M','L','']),'max'=>3];
    $sizeRules = security_object(array_fill_keys(['monday','tuesday','wednesday','thursday','friday','saturday','sunday','default'], $sizes) + ['S'=>security_enum(['S','M','L','']), 'M'=>security_enum(['S','M','L','']), 'L'=>security_enum(['S','M','L',''])]);
    $image = security_string(500,true,'#^$|^uploads/(products|categories|promotions)/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$|^https?://[^\s<>]+$#Di');
    $promotion = ['title'=>$s(160),'subtitle'=>$s(1000),'description'=>$s(4000),'image_url'=>$image,'button_text'=>$s(80),'destination_type'=>security_enum(['none','menu','product','category','offer','custom_url']),'destination_value'=>$s(500),'display_order'=>$integer,'start_at'=>$date,'end_at'=>$date,'is_active'=>$flag];
    return match ($name) {
        'categories' => $common + ['description'=>$s(4000),'image_url'=>$image,'sort_order'=>$integer],
        'products' => $common + ['category_id'=>security_id(),'description'=>$s(4000),'price'=>$money,'stock'=>$integer,'low_stock_threshold'=>$integer,'image_url'=>$image,'size_prices'=>$sizePrices,'variant_prices'=>$prices],
        'toppings' => $common + ['small_price'=>$money,'medium_price'=>$money,'large_price'=>$money,'fixed_price'=>$money,'applies_to'=>security_enum(['pizza','all']),'group_name'=>security_enum(['Pizza Topping','Add-On']),'category_ids'=>$jsonIds,'product_ids'=>$jsonIds],
        'coupons' => ['code'=>security_string(40,false,'/^[A-Za-z0-9_-]+$/D'),'discount_type'=>security_enum(['flat','percent']),'discount_value'=>$money,'min_order_value'=>$money,'max_discount'=>$money,'starts_at'=>$date,'expires_at'=>$date,'overall_usage_limit'=>$integer,'per_customer_limit'=>$integer,'is_active'=>$flag],
        'offers' => $common + ['offer_type'=>security_enum(['bogo','fixed','percent']),'discount_value'=>$money,'scope'=>security_enum(['item','category']),'scope_id'=>$id,'buy_product_id'=>$id,'free_product_id'=>$id,'category_ids'=>$jsonIds,'product_ids'=>$jsonIds,'weekdays'=>['type'=>'json','schema'=>security_list(security_enum(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']),7)],'size_rules'=>['type'=>'json','schema'=>$sizeRules],'start_time'=>security_string(8,true,'/^$|^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/D'),'end_time'=>security_string(8,true,'/^$|^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/D'),'buy_qty'=>security_id(),'get_qty'=>security_id(),'starts_at'=>$date,'expires_at'=>$date],
        'delivery-slabs' => ['min_order_amount'=>$money,'min_km'=>$money,'max_km'=>$money,'free_delivery_distance_km'=>$money,'free_delivery_enabled'=>$flag,'charge'=>$money,'priority'=>$integer,'order_types'=>security_string(80,false,'/^(delivery|takeaway|dine_in)(,(delivery|takeaway|dine_in))*$/D'),'is_active'=>$flag],
        'staff-delivery-slabs' => ['name'=>security_string(120,false),'min_order_amount'=>$money,'max_order_amount'=>$money,'charge'=>$money,'priority'=>$integer,'is_active'=>$flag],
        'promotional-banners' => array_diff_key($promotion, array_flip(['description'])),
        'promotional-popups' => array_diff_key($promotion, array_flip(['subtitle'])) + ['offer_text'=>$s(160),'display_frequency'=>security_enum(['session','daily','every_visit'])],
        'promotional-marquee' => ['message'=>$s(1000),'link'=>$s(500),'display_order'=>$integer,'start_at'=>$date,'end_at'=>$date,'is_active'=>$flag],
        default => [],
    };
}

function security_request_schema(string $path, string $method): array {
    $contact = security_contact_fields();
    $empty = security_object([]);
    $credentials = security_object(['email'=>['type'=>'email','max'=>180], 'password'=>security_string(72,false)], ['email','password']);
    if ($path === '/staff/bogo-policy' && $method === 'PUT') return security_object(['policy'=>staff_bogo_policy_schema(),'revision'=>security_string(64,false,'/^(default-v1|[a-f0-9]{64})$/D')],['policy','revision']);
    if (in_array($path, ['/auth/login','/auth/admin-login','/auth/staff-login'],true)) return $credentials;
    if ($path === '/auth/register') return security_object($contact + ['password'=>security_string(72,false)], ['name','phone','email','password']);
    if ($path === '/cart/validate' || $path === '/orders' || $path === '/staff/orders' && $method === 'POST' || preg_match('#^/(staff|admin)/orders/[1-9][0-9]*/edit$#D',$path)) {
        $fields = security_order_fields();
        // Walk-in POS customer details may be empty.
        $fields['customer_name']['empty'] = true;
        return security_object($fields, ['items']);
    }
    if ($path === '/delivery/quote' || $path === '/admin/delivery-slabs/calculate') return security_object(['latitude'=>security_number(-90,90),'longitude'=>security_number(-180,180),'order_amount'=>security_number(),'distance_km'=>security_number(0,10000),'order_type'=>security_enum(['delivery','takeaway','dine_in'])]);
    if ($path === '/payments/verify') return security_object(['order_id'=>security_id(),'razorpay_order_id'=>security_string(80,false,'/^order_[A-Za-z0-9]+$/D'),'razorpay_payment_id'=>security_string(80,false,'/^pay_[A-Za-z0-9]+$/D'),'razorpay_signature'=>security_string(64,false,'/^[a-f0-9]{64}$/D'),'guest_access_token'=>security_string(64,true,'/^$|^[a-f0-9]{64}$/D')],['order_id','razorpay_order_id','razorpay_payment_id','razorpay_signature']);
    if ($path === '/account/addresses') return security_object(['label'=>security_string(80,false),'address_line'=>security_string(4000,false),'latitude'=>security_number(-90,90),'longitude'=>security_number(-180,180)],['label','address_line','latitude','longitude']);
    if (preg_match('#^/orders/[1-9][0-9]*/email-invoice$#D',$path)) return security_object(['guest_access_token'=>security_string(64,false,'/^[a-f0-9]{64}$/D')]);
    if ($path === '/notifications/subscribe') return security_object(['endpoint'=>['type'=>'url','max'=>2048],'expirationTime'=>security_number(0,9007199254740991,true),'keys'=>security_object(['p256dh'=>security_string(200,false,'/^[A-Za-z0-9_=-]+$/D'),'auth'=>security_string(100,false,'/^[A-Za-z0-9_=-]+$/D')],['p256dh','auth'])],['endpoint','keys']);
    if (preg_match('#^/delivery/orders/[1-9][0-9]*/location$#D',$path)) return security_object(['latitude'=>security_number(-90,90),'longitude'=>security_number(-180,180),'accuracy'=>security_number(0,100000),'timestamp'=>['type'=>'datetime','max'=>35]],['latitude','longitude']);
    if (preg_match('#^/(admin|staff)/orders/[1-9][0-9]*$#D',$path)) return security_object(['status'=>security_enum(['received','accepted','preparing','ready','picked_up','out_for_delivery','delivered','cancelled']),'payment_status'=>security_enum(['Pending','Paid','Partially Paid','COD','Failed','Refunded']),'preparation_minutes'=>['type'=>'integer','min'=>1,'max'=>1440,'empty'=>true],'delivery_boy_id'=>security_id(true)]);
    if (preg_match('#^/admin/(staff|delivery-boys)(/[1-9][0-9]*)?$#D',$path,$m)) {
        $fields = $contact + ['password'=>security_string(72,true),'is_active'=>['type'=>'flag']];
        if ($m[1] === 'staff') $fields['permissions'] = security_object(array_fill_keys(staff_permission_keys(), ['type'=>'flag']));
        return security_object($fields,$method === 'POST' ? ['name','phone','email','password'] : []);
    }
    if ($path === '/admin/settings') return security_object(security_settings_fields());
    if ($path === '/admin/theme') {
        $fields = [];
        foreach (array_keys(theme()) as $key) $fields[$key] = security_string(2048);
        return security_object($fields);
    }
    if ($path === '/admin/settings/order-availability') return security_object(['schedule'=>security_schedule_schema()] + security_schedule_schema()['fields']);
    if ($path === '/admin/settings/order-availability/master') return security_object(['manual_override'=>security_enum(['auto','open','closed']),'accept_orders'=>['type'=>'flag']]);
    if ($path === '/admin/settings/integrations/razorpay') return security_object(['key_id'=>security_string(100,true,'/^$|^\*{8}$|^rzp_(test|live)_[A-Za-z0-9]+$/D'),'key_secret'=>security_string(256,true,'/^[A-Za-z0-9_*=-]*$/D'),'enabled'=>['type'=>'flag'],'mode'=>security_enum(['test','live'])]);
    if ($path === '/admin/settings/integrations/google-maps') return security_object(['api_key'=>security_string(256,true,'/^[A-Za-z0-9_*-]*$/D'),'enabled'=>['type'=>'flag']]);
    if (preg_match('#^/admin/([a-z-]+)(/[1-9][0-9]*)?$#D',$path,$m)) {
        $fields = security_resource_schema($m[1]);
        if ($fields) return security_object($fields);
    }
    return $empty; // Unrecognized routes cannot consume arbitrary fields.
}

function security_validate_request(string $path, string $method, array $data): void {
    if (!in_array($method,['GET','POST','PUT','DELETE'],true)) json_response(['error'=>'Method not allowed'],405);
    if (preg_match('#/(\d+)(?:/|$)#',$path,$m)) security_validate($m[1],security_id(),'path.id');
    $query = [];
    $pagination = ['page'=>security_id(),'per_page'=>['type'=>'integer','min'=>1,'max'=>200],'limit'=>['type'=>'integer','min'=>1,'max'=>200]];
    if (preg_match('#^/(admin|staff|account)/#',$path)) $query += $pagination;
    if (preg_match('#^/orders/[1-9][0-9]*/(track|invoice|email-invoice|driver-location)$#D',$path)) $query['access_token']=security_string(64,false,'/^[a-f0-9]{64}$/D');
    if ($path === '/offers/active-bogo') $query['as_of']=['type'=>'datetime','max'=>35,'empty'=>true];
    if ($path === '/staff/orders') $query['active']=['type'=>'flag'];
    if ($path === '/staff/customers/search') $query['phone']=security_string(30,false,'/^[+0-9 ()-]+$/D');
    if (in_array($path,['/admin/customers','/admin/products/search','/admin/orders'],true)) $query['q']=security_string(200);
    if ($path === '/admin/products/search') $query['include_inactive']=['type'=>'flag'];
    if ($path === '/admin/orders') $query += ['scope'=>security_enum(['today'],true),'source'=>security_enum(['customer_online','staff_offline'],true),'status'=>security_enum(order_statuses(),true)];
    if (str_contains($path,'/reports/') || $path === '/admin/staff-performance') $query += ['from'=>['type'=>'date','max'=>10,'empty'=>true],'to'=>['type'=>'date','max'=>10,'empty'=>true],'preset'=>security_enum(['today','yesterday','this_week','last_week','this_month','last_month','custom'],true),'staff_id'=>security_id(true),'source'=>security_enum(['customer_online','staff_offline'],true),'payment_status'=>security_enum(['Pending','Paid','Partially Paid','COD','Failed','Refunded'],true),'status'=>security_enum(order_statuses(),true),'format'=>security_enum(['csv','pdf'],true)];
    if ($path === '/admin/reports/revenue') $query += ['from'=>['type'=>'date','max'=>10,'empty'=>true],'to'=>['type'=>'date','max'=>10,'empty'=>true]];
    security_validate((object)$_GET,security_object($query),'query');
    foreach (['HTTP_X_IDEMPOTENCY_KEY'=>security_string(100,false,'/^[A-Za-z0-9_-]+$/D'),'HTTP_X_GUEST_ORDER_TOKEN'=>security_string(64,false,'/^[a-f0-9]{64}$/D')] as $header=>$rule) if (isset($_SERVER[$header])) security_validate($_SERVER[$header],$rule,'header');
    if (isset($_SERVER['HTTP_AUTHORIZATION']) && (!is_string($_SERVER['HTTP_AUTHORIZATION']) || !preg_match('/^Bearer [A-Za-z0-9._~-]{1,512}$/D',$_SERVER['HTTP_AUTHORIZATION']))) security_reject('authorization');
    // Existing refresh sessions issue 48 random bytes encoded as 96 hex digits.
    // This differs from the 64-character bearer/guest token contracts.
    if (isset($_COOKIE[admin_refresh_cookie_name()])) {
        $refreshCookie = $_COOKIE[admin_refresh_cookie_name()];
        if (!is_string($refreshCookie) || !preg_match('/^[a-f0-9]{96}$/D', $refreshCookie)) security_reject('refresh_cookie');
    }
    if (str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''),'multipart/form-data')) {
        $fileKey = $path === '/admin/notification-sound' ? 'audio' : 'image';
        if ($method !== 'POST' || !in_array($path,['/admin/product-image','/admin/category-image','/admin/promotion-image','/admin/notification-sound'],true)) security_reject('multipart');
        security_validate((object)$_POST,security_object(['name'=>security_string(120)]),'form');
        if (array_keys($_FILES) !== [$fileKey]) security_reject('files');
        foreach ($_FILES[$fileKey] as $entry) if (is_array($entry)) security_reject('file');
        security_validate($_FILES[$fileKey]['name'],security_string(200,false,'/^[\pL\pN _().-]+$/uD'),'file.name');
        return;
    }
    $object = $GLOBALS['security_json_object'] ?? new stdClass();
    if ($method === 'GET' || $method === 'DELETE') security_validate($object,security_object([]));
    else security_validate($object,security_request_schema($path,$method));
    if (isset($data['items'])) foreach ($data['items'] as $item) if (!isset($item['id']) && !isset($item['menu_item_id'])) security_reject('body.items.id');
}

function security_peer_ip(): string {
    $peer = $_SERVER['REMOTE_ADDR'] ?? '';
    if (!filter_var($peer,FILTER_VALIDATE_IP)) return 'unknown';
    $trusted = array_filter(array_map('trim',explode(',',env('RATE_LIMIT_TRUSTED_PROXIES',''))));
    // Ignore forwarding headers unless the immediate transport peer is explicitly trusted.
    if (!in_array($peer,$trusted,true)) return $peer;
    $chain = array_map('trim',explode(',',$_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
    while ($chain) {
        $candidate = array_pop($chain);
        if (!filter_var($candidate,FILTER_VALIDATE_IP)) return $peer;
        if (!in_array($candidate,$trusted,true)) return $candidate;
    }
    return $peer;
}

function security_rate_key(string $scope, string $identity): string {
    $secret = env('RATE_LIMIT_SECRET','') ?: env('JWT_SECRET','');
    if (strlen($secret) < 32) throw new RuntimeException('Configure RATE_LIMIT_SECRET or JWT_SECRET with at least 32 bytes');
    $namespace=env('RATE_LIMIT_NAMESPACE','pizza-house');
    if(!preg_match('/^[A-Za-z0-9_-]{1,64}$/D',$namespace))throw new RuntimeException('Invalid rate limit namespace');
    return hash_hmac('sha256',$namespace . ':' . $scope . ':' . $identity,$secret);
}

function security_rate_bucket(string $scope, string $identity, int $limit, int $window, bool $auth = false, ?int $now = null): int {
    $now ??= time();
    $pdo = db(); $key = security_rate_key($scope,$identity);
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT IGNORE INTO request_rate_limits (bucket_key,window_started,expires_at) VALUES (?,?,?)')->execute([$key,$now,$now+security_config('RATE_LIMIT_RETENTION_SECONDS',86400)]);
        $select=$pdo->prepare('SELECT * FROM request_rate_limits WHERE bucket_key=? FOR UPDATE'); $select->execute([$key]); $row=$select->fetch();
        $wait=max(0,(int)$row['next_allowed']-$now);
        if (!$wait) {
            $count=$now-(int)$row['window_started'] >= $window ? 1 : (int)$row['request_count']+1;
            $start=$count === 1 ? $now : (int)$row['window_started'];
            if ($count>$limit) $wait=$auth ? security_backoff($count-$limit) : max(1,$start+$window-$now);
            $pdo->prepare('UPDATE request_rate_limits SET request_count=?,window_started=?,next_allowed=?,expires_at=? WHERE bucket_key=?')->execute([$count,$start,$wait ? $now+$wait : 0,$now+security_config('RATE_LIMIT_RETENTION_SECONDS',86400),$key]);
        }
        $pdo->commit(); return $wait;
    } catch (Throwable $e) { if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
}

function security_backoff(int $excess): int {
    return (int)min(security_config('RATE_LIMIT_AUTH_BACKOFF_MAX_SECONDS',300),security_config('RATE_LIMIT_AUTH_BACKOFF_BASE_SECONDS',2)*pow(2,min(30,max(0,$excess-1))));
}

function security_rate_response(int $wait): never {
    header('Retry-After: ' . $wait);
    header('Cache-Control: no-store');
    json_response(['error'=>'Too many requests. Please try again shortly.','retry_after'=>$wait],429);
}

function security_rate_before(string $path): void {
    $ip=security_peer_ip();
    $auth = str_starts_with($path,'/auth/');
    if ($auth) {
        $wait=security_rate_bucket('auth-ip',$ip,security_config('RATE_LIMIT_AUTH_IP_REQUESTS',30),security_config('RATE_LIMIT_AUTH_WINDOW_SECONDS',60),true);
    } else {
        $wait=security_rate_bucket('edge-ip',$ip,security_config('RATE_LIMIT_EDGE_IP_REQUESTS',1800),security_config('RATE_LIMIT_EDGE_WINDOW_SECONDS',60));
    }
    if ($wait) security_rate_response($wait);
    if (!$auth) {
        $user = bearer_token() ? current_user(false) : null;
        $wait=$user ? security_rate_bucket('user',(string)$user['id'],security_config('RATE_LIMIT_USER_REQUESTS',600),security_config('RATE_LIMIT_USER_WINDOW_SECONDS',60)) : security_rate_bucket('public-ip',$ip,security_config('RATE_LIMIT_PUBLIC_REQUESTS',120),security_config('RATE_LIMIT_PUBLIC_WINDOW_SECONDS',60));
        if ($wait) security_rate_response($wait);
    }
    if (random_int(1,security_config('RATE_LIMIT_CLEANUP_EVERY_REQUESTS',100))===1) db()->prepare('DELETE FROM request_rate_limits WHERE expires_at<? LIMIT ' . security_config('RATE_LIMIT_CLEANUP_ROWS',500))->execute([time()]);
}

function security_rate_account(string $path, array $data): void {
    if (!str_starts_with($path,'/auth/') || !isset($data['email'])) return;
    $identity=strtolower(trim($data['email']));
    $wait=security_rate_bucket('auth-account',$identity,security_config('RATE_LIMIT_AUTH_ACCOUNT_REQUESTS',10),security_config('RATE_LIMIT_AUTH_WINDOW_SECONDS',60),true);
    if ($wait) security_rate_response($wait);
    $GLOBALS['security_auth_buckets'] = ['auth-account'=>$identity,'auth-ip'=>security_peer_ip()];
}

function security_auth_result(int $status): void {
    $buckets=$GLOBALS['security_auth_buckets'] ?? [];
    if (!$buckets || ($status !== 401 && $status !== 403 && $status >= 300)) return;
    foreach ($buckets as $scope=>$identity) {
        $key=security_rate_key($scope,$identity); $pdo=db(); $now=time();
        $pdo->beginTransaction();
        try {
            $select=$pdo->prepare('SELECT * FROM request_rate_limits WHERE bucket_key=? FOR UPDATE');$select->execute([$key]);$row=$select->fetch();
            if ($status < 300) {
                if ($scope === 'auth-account') $pdo->prepare('UPDATE request_rate_limits SET failures=0,next_allowed=0,last_failure=0 WHERE bucket_key=?')->execute([$key]);
            } else {
                $failures=$now-(int)$row['last_failure'] >= security_config('RATE_LIMIT_AUTH_FAILURE_DECAY_SECONDS',900) ? 1 : (int)$row['failures']+1;
                $threshold=$scope==='auth-ip' ? security_config('RATE_LIMIT_AUTH_IP_FAILURES',10) : security_config('RATE_LIMIT_AUTH_ACCOUNT_FAILURES',3);
                $next=$failures >= $threshold ? $now+security_backoff($failures-$threshold+1) : 0;
                $pdo->prepare('UPDATE request_rate_limits SET failures=?,last_failure=?,next_allowed=? WHERE bucket_key=?')->execute([$failures,$now,$next,$key]);
            }
            $pdo->commit();
        } catch(Throwable $e) { if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
    }
}
