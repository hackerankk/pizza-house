<?php
declare(strict_types=1);

ini_set('display_errors', '0');
date_default_timezone_set('Asia/Kolkata');

set_exception_handler(function (Throwable $e): void {
    json_response(['error' => 'Server error', 'detail' => getenv('APP_ENV') === 'local' ? $e->getMessage() : null], 500);
});

load_env(dirname(__DIR__) . '/.env');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
$allowed = env('FRONTEND_URL', '*');
header('Access-Control-Allow-Origin: ' . ($allowed === '*' ? $origin : $allowed));
header('Vary: Origin');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Idempotency-Key, X-Guest-Order-Token');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function load_env(string $path): void {
    if (!is_file($path)) {
        return;
    }
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = parse_env_value(trim($value));
        $_ENV[$key] = $value;
        putenv($key . '=' . $value);
    }
}

function parse_env_value(string $value): string {
    if (strlen($value) >= 2) {
        $first = $value[0];
        $last = $value[strlen($value) - 1];
        if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
            return stripcslashes(substr($value, 1, -1));
        }
    }
    return $value;
}

function env(string $key, ?string $default = null): ?string {
    $value = getenv($key);
    return $value === false ? $default : $value;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', env('DB_HOST', '127.0.0.1'), env('DB_PORT', '3306'), env('DB_NAME', 'pizza_house'));
    $pdo = new PDO($dsn, env('DB_USER', 'root'), env('DB_PASS', ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}

function ensure_order_management_schema(): void {
    static $done = false;
    if ($done) {
        return;
    }
    $pdo = db();
    $dbName = env('DB_NAME', 'pizza_house');
    $pdo->exec("ALTER TABLE users MODIFY role ENUM('customer','admin','delivery_boy') NOT NULL DEFAULT 'customer'");
    $userColumns = $pdo->prepare('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?');
    $userColumns->execute([$dbName, 'users']);
    $existingUserColumns = array_column($userColumns->fetchAll(), 'COLUMN_NAME');
    if (!in_array('is_active', $existingUserColumns, true)) {
        $pdo->exec('ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role');
    }
    $tokenColumns = $pdo->prepare('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?');
    $tokenColumns->execute([$dbName, 'auth_tokens']);
    $existingTokenColumns = array_column($tokenColumns->fetchAll(), 'COLUMN_NAME');
    if (!in_array('password_hash_snapshot', $existingTokenColumns, true)) {
        $pdo->exec('ALTER TABLE auth_tokens ADD COLUMN password_hash_snapshot CHAR(64) NULL AFTER token_hash');
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS admin_refresh_tokens (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        password_hash_snapshot CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_admin_refresh_user (user_id),
        INDEX idx_admin_refresh_expires (expires_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $stmt = $pdo->prepare('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?');
    $stmt->execute([$dbName, 'orders']);
    $existing = array_column($stmt->fetchAll(), 'COLUMN_NAME');
    $nullableStmt = $pdo->prepare('SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1');
    $nullableStmt->execute([$dbName, 'orders', 'user_id']);
    if (($nullableStmt->fetchColumn() ?: 'NO') !== 'YES') {
        $pdo->exec('ALTER TABLE orders MODIFY user_id BIGINT UNSIGNED NULL');
    }
    if (!in_array('guest_name', $existing, true)) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN guest_name VARCHAR(120) NULL AFTER user_id');
    }
    if (!in_array('guest_phone', $existing, true)) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN guest_phone VARCHAR(30) NULL AFTER guest_name');
    }
    if (!in_array('guest_email', $existing, true)) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN guest_email VARCHAR(180) NULL AFTER guest_phone');
    }
    if (!in_array('delivery_boy_id', $existing, true)) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN delivery_boy_id BIGINT UNSIGNED NULL AFTER coupon_id');
        $pdo->exec('ALTER TABLE orders ADD CONSTRAINT fk_orders_delivery_boy FOREIGN KEY (delivery_boy_id) REFERENCES users(id) ON DELETE SET NULL');
    }
    if (!in_array('accepted_at', $existing, true)) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN accepted_at DATETIME NULL AFTER idempotency_key');
    }
    if (!in_array('estimated_ready_at', $existing, true)) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN estimated_ready_at DATETIME NULL AFTER accepted_at');
    }
    if (!in_array('preparation_minutes', $existing, true)) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN preparation_minutes INT UNSIGNED NULL AFTER estimated_ready_at');
    }
    if (!in_array('delivery_started_at', $existing, true)) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN delivery_started_at DATETIME NULL AFTER preparation_minutes');
    }
    if (!in_array('delivered_at', $existing, true)) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN delivered_at DATETIME NULL AFTER delivery_started_at');
    }
    if (!in_array('guest_access_token_hash', $existing, true)) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN guest_access_token_hash CHAR(64) NULL AFTER delivered_at');
    }
    if (!in_array('guest_access_expires_at', $existing, true)) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN guest_access_expires_at DATETIME NULL AFTER guest_access_token_hash');
    }
    $indexStmt = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=?');
    $indexStmt->execute([$dbName, 'orders', 'idx_orders_guest_token']);
    if ((int)$indexStmt->fetchColumn() === 0) {
        $pdo->exec('CREATE INDEX idx_orders_guest_token ON orders (guest_access_token_hash)');
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS delivery_locations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_id BIGINT UNSIGNED NOT NULL UNIQUE,
        delivery_boy_id BIGINT UNSIGNED NOT NULL,
        latitude DECIMAL(10,7) NOT NULL,
        longitude DECIMAL(10,7) NOT NULL,
        accuracy DECIMAL(10,2) NULL,
        recorded_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_delivery_locations_order (order_id),
        INDEX idx_delivery_locations_boy (delivery_boy_id),
        INDEX idx_delivery_locations_recorded (recorded_at),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (delivery_boy_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("ALTER TABLE orders MODIFY status VARCHAR(40) NOT NULL DEFAULT 'received'");
    $map = [
        'Placed' => 'received',
        'Confirmed' => 'accepted',
        'Preparing' => 'preparing',
        'Out for Delivery' => 'out_for_delivery',
        'Delivered' => 'delivered',
        'Cancelled' => 'cancelled',
    ];
    foreach ($map as $old => $new) {
        $update = $pdo->prepare('UPDATE orders SET status=? WHERE status=?');
        $update->execute([$new, $old]);
        $hist = $pdo->prepare('UPDATE order_status_history SET new_status=? WHERE new_status=?');
        $hist->execute([$new, $old]);
        $histOld = $pdo->prepare('UPDATE order_status_history SET old_status=? WHERE old_status=?');
        $histOld->execute([$new, $old]);
    }
    $pdo->exec("ALTER TABLE orders MODIFY status ENUM('received','accepted','preparing','ready','picked_up','out_for_delivery','delivered','cancelled') NOT NULL DEFAULT 'received'");
    $couponNullableStmt = $pdo->prepare('SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1');
    $couponNullableStmt->execute([$dbName, 'coupon_redemptions', 'user_id']);
    if (($couponNullableStmt->fetchColumn() ?: 'NO') !== 'YES') {
        $pdo->exec('ALTER TABLE coupon_redemptions MODIFY user_id BIGINT UNSIGNED NULL');
    }
    $channelType = $pdo->prepare('SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1');
    $channelType->execute([$dbName, 'notifications', 'channel']);
    if (is_string($channelType->fetchColumn())) {
        $pdo->exec("ALTER TABLE notifications MODIFY channel ENUM('whatsapp','web_push','email') NOT NULL");
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS order_email_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_id BIGINT UNSIGNED NOT NULL,
        email_type VARCHAR(60) NOT NULL DEFAULT 'order_confirmation',
        recipient VARCHAR(180) NOT NULL,
        status ENUM('sent','failed','skipped') NOT NULL,
        error_message TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order_email_logs_order (order_id),
        INDEX idx_order_email_logs_status (status),
        UNIQUE KEY uniq_order_email_type (order_id, email_type),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->prepare('INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)')->execute(['customer_login_required', '0']);
    $done = true;
}

function order_statuses(): array {
    return ['received','accepted','preparing','ready','picked_up','out_for_delivery','delivered','cancelled'];
}

function status_label(string $status): string {
    return ucwords(str_replace('_', ' ', $status));
}

function valid_next_statuses(string $current, string $orderType): array {
    $flow = $orderType === 'takeaway'
        ? ['received', 'accepted', 'preparing', 'ready', 'picked_up']
        : ['received', 'accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'delivered'];
    if ($current === 'cancelled' || $current === 'delivered' || ($current === 'picked_up' && $orderType === 'takeaway')) {
        return [];
    }
    $next = [];
    $index = array_search($current, $flow, true);
    if ($index !== false && isset($flow[$index + 1])) {
        $next[] = $flow[$index + 1];
    }
    if ($current !== 'delivered') {
        $next[] = 'cancelled';
    }
    return array_values(array_unique($next));
}

function order_is_admin_alertable(array $order): bool {
    return in_array($order['payment_status'] ?? '', ['Paid', 'Partially Paid', 'COD'], true)
        && ($order['status'] ?? '') === 'received';
}

function valid_coordinates($lat, $lng): bool {
    return valid_decimal($lat) && valid_decimal($lng) && (float)$lat >= -90 && (float)$lat <= 90 && (float)$lng >= -180 && (float)$lng <= 180;
}

function order_tracking_payload(array $order): array {
    $items = db()->prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id');
    $items->execute([$order['id']]);
    $payments = db()->prepare('SELECT id, razorpay_order_id, razorpay_payment_id, amount, status, method, created_at, updated_at FROM payments WHERE order_id=? ORDER BY id');
    $payments->execute([$order['id']]);
    $hist = db()->prepare('SELECT * FROM order_status_history WHERE order_id=? ORDER BY created_at');
    $hist->execute([$order['id']]);
    $deliveryBoy = null;
    if (!empty($order['delivery_boy_id'])) {
        $boy = db()->prepare("SELECT id, name, phone FROM users WHERE id=? AND role='delivery_boy' LIMIT 1");
        $boy->execute([$order['delivery_boy_id']]);
        $deliveryBoy = $boy->fetch() ?: null;
    }
    $driver = db()->prepare('SELECT dl.latitude, dl.longitude, dl.accuracy, dl.recorded_at, u.name AS delivery_boy_name, u.phone AS delivery_boy_phone FROM delivery_locations dl JOIN users u ON u.id=dl.delivery_boy_id WHERE dl.order_id=? LIMIT 1');
    $driver->execute([$order['id']]);
    return ['order' => public_order($order), 'items' => array_map('public_order_item', $items->fetchAll()), 'payments' => $payments->fetchAll(), 'history' => $hist->fetchAll(), 'delivery_boy' => $deliveryBoy, 'driver_location' => $driver->fetch() ?: null];
}

function public_order(array $order): array {
    unset($order['guest_access_token_hash'], $order['guest_access_expires_at']);
    return $order;
}

function variant_display(?string $name): ?string {
    if ($name === null || $name === '') return null;
    return match ($name) {
        'S' => 'Small',
        'M' => 'Medium',
        'L' => 'Large',
        default => $name,
    };
}

function option_snapshot(array $line): string {
    $options = array_map(fn($option) => [
        'id' => (int)$option['id'],
        'group_name' => (string)$option['group_name'],
        'name' => (string)$option['name'],
        'price' => money((float)$option['price']),
    ], $line['options'] ?? []);
    $crust = null;
    $toppings = [];
    $addons = [];
    foreach ($options as $option) {
        $group = strtolower($option['group_name']);
        if ($group === 'crust') {
            $crust = $option;
        } elseif (str_contains($group, 'topping')) {
            $toppings[] = $option;
        } else {
            $addons[] = $option;
        }
    }
    return json_encode([
        'variant' => $line['variant'] ? [
            'id' => (int)$line['variant']['id'],
            'name' => (string)$line['variant']['name'],
            'label' => variant_display((string)$line['variant']['name']),
        ] : null,
        'crust' => $crust,
        'toppings' => $toppings,
        'addons' => $addons,
        'options' => $options,
    ], JSON_UNESCAPED_SLASHES);
}

function decoded_item_options(?string $snapshot): array {
    if (!$snapshot) {
        return ['variant' => null, 'crust' => null, 'toppings' => [], 'addons' => [], 'options' => [], 'display' => ''];
    }
    $decoded = json_decode($snapshot, true);
    if (is_array($decoded)) {
        $options = $decoded['options'] ?? [];
        return [
            'variant' => $decoded['variant'] ?? null,
            'crust' => $decoded['crust'] ?? null,
            'toppings' => $decoded['toppings'] ?? [],
            'addons' => $decoded['addons'] ?? [],
            'options' => is_array($options) ? $options : [],
            'display' => option_display_text($decoded),
        ];
    }
    return ['variant' => null, 'crust' => null, 'toppings' => [], 'addons' => [], 'options' => [], 'display' => $snapshot];
}

function option_display_text(array $decoded): string {
    $parts = [];
    if (!empty($decoded['crust']['name'])) {
        $parts[] = 'Crust: ' . $decoded['crust']['name'];
    }
    if (!empty($decoded['toppings']) && is_array($decoded['toppings'])) {
        $parts[] = 'Toppings: ' . implode(', ', array_map(fn($o) => (string)($o['name'] ?? ''), $decoded['toppings']));
    }
    if (!empty($decoded['addons']) && is_array($decoded['addons'])) {
        $parts[] = 'Add-ons: ' . implode(', ', array_map(fn($o) => (string)($o['name'] ?? ''), $decoded['addons']));
    }
    if (!$parts && !empty($decoded['options']) && is_array($decoded['options'])) {
        $parts[] = implode(', ', array_map(fn($o) => trim((string)($o['group_name'] ?? '') . ': ' . (string)($o['name'] ?? ''), ': '), $decoded['options']));
    }
    return implode(' | ', array_filter($parts));
}

function public_order_item(array $item): array {
    $meta = decoded_item_options($item['options_snapshot'] ?? null);
    $item['variant_label'] = variant_display($item['variant_snapshot'] ?? null);
    $item['selection_meta'] = $meta;
    $item['options_display'] = $meta['display'];
    return $item;
}

function json_response(array $payload, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function input(): array {
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function route_path(): string {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    return rtrim($path, '/') ?: '/';
}

function bearer_token(): ?string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.+)/i', $header, $m)) {
        return trim($m[1]);
    }
    return null;
}

function current_user(bool $required = true, ?string $role = null): ?array {
    $token = bearer_token();
    if (!$token) {
        if ($required) json_response(['error' => 'Authentication required'], 401);
        return null;
    }
    $stmt = db()->prepare('SELECT u.*, t.password_hash_snapshot AS token_password_hash_snapshot FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.expires_at > NOW() LIMIT 1');
    $stmt->execute([hash('sha256', $token)]);
    $user = $stmt->fetch();
    if (!$user) {
        if ($required) json_response(['error' => 'Invalid or expired token'], 401);
        return null;
    }
    if (($user['role'] ?? '') === 'admin' && !empty($user['token_password_hash_snapshot']) && !hash_equals($user['token_password_hash_snapshot'], hash('sha256', $user['password_hash']))) {
        db()->prepare('DELETE FROM auth_tokens WHERE token_hash=?')->execute([hash('sha256', $token)]);
        if ($required) json_response(['error' => 'Invalid or expired token'], 401);
        return null;
    }
    if (isset($user['is_active']) && (int)$user['is_active'] !== 1) {
        if ($required) json_response(['error' => 'Account is inactive'], 403);
        return null;
    }
    if ($role && $user['role'] !== $role) {
        json_response(['error' => 'Forbidden'], 403);
    }
    return $user;
}

function issue_token(int $userId, string $ttl = '30 DAY'): string {
    $token = bin2hex(random_bytes(32));
    $allowedTtls = ['12 HOUR', '30 DAY'];
    if (!in_array($ttl, $allowedTtls, true)) {
        $ttl = '30 DAY';
    }
    $user = db()->prepare('SELECT role, password_hash FROM users WHERE id=? LIMIT 1');
    $user->execute([$userId]);
    $row = $user->fetch();
    $passwordSnapshot = ($row && ($row['role'] ?? '') === 'admin') ? hash('sha256', $row['password_hash']) : null;
    $stmt = db()->prepare("INSERT INTO auth_tokens (user_id, token_hash, password_hash_snapshot, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL $ttl))");
    $stmt->execute([$userId, hash('sha256', $token), $passwordSnapshot]);
    return $token;
}

function admin_refresh_cookie_name(): string {
    return 'pizza_house_admin_refresh';
}

function cookie_secure(): bool {
    $configured = env('COOKIE_SECURE');
    if ($configured !== null && $configured !== '') {
        return filter_var($configured, FILTER_VALIDATE_BOOL);
    }
    return !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
}

function set_admin_refresh_cookie(string $token, int $maxAge = 5184000): void {
    setcookie(admin_refresh_cookie_name(), $token, [
        'expires' => time() + $maxAge,
        'path' => '/',
        'secure' => cookie_secure(),
        'httponly' => true,
        'samesite' => cookie_secure() ? 'None' : 'Lax',
    ]);
}

function clear_admin_refresh_cookie(): void {
    setcookie(admin_refresh_cookie_name(), '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => cookie_secure(),
        'httponly' => true,
        'samesite' => cookie_secure() ? 'None' : 'Lax',
    ]);
}

function issue_admin_refresh_session(array $admin): string {
    $refresh = bin2hex(random_bytes(48));
    $stmt = db()->prepare('INSERT INTO admin_refresh_tokens (user_id, token_hash, password_hash_snapshot, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 60 DAY))');
    $stmt->execute([(int)$admin['id'], hash('sha256', $refresh), hash('sha256', $admin['password_hash'])]);
    set_admin_refresh_cookie($refresh);
    return $refresh;
}

function revoke_admin_refresh_session(?string $refreshToken = null): void {
    $refreshToken = $refreshToken ?: ($_COOKIE[admin_refresh_cookie_name()] ?? null);
    if ($refreshToken) {
        $stmt = db()->prepare('UPDATE admin_refresh_tokens SET revoked_at=NOW() WHERE token_hash=? AND revoked_at IS NULL');
        $stmt->execute([hash('sha256', $refreshToken)]);
    }
    clear_admin_refresh_cookie();
}

function require_fields(array $data, array $fields): void {
    foreach ($fields as $field) {
        if (!isset($data[$field]) || (!is_array($data[$field]) && trim((string)$data[$field]) === '') || (is_array($data[$field]) && count($data[$field]) === 0)) {
            json_response(['error' => "Missing field: $field"], 422);
        }
    }
}

function money(float $value): float {
    return round($value, 2);
}

function valid_decimal($value): bool {
    return is_numeric($value) && is_finite((float)$value);
}

function is_truthy_setting($value): bool {
    return in_array((string)$value, ['0', '1'], true);
}

function settings(): array {
    $rows = db()->query('SELECT setting_key, setting_value FROM settings')->fetchAll();
    return array_column($rows, 'setting_value', 'setting_key');
}

function theme(): array {
    $rows = db()->query('SELECT setting_key, setting_value FROM theme_settings')->fetchAll();
    return array_column($rows, 'setting_value', 'setting_key');
}

function slugify(string $value): string {
    $slug = strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '-', $value), '-'));
    return $slug ?: bin2hex(random_bytes(4));
}

function public_upload_path(string $relativePath): string {
    $root = realpath(__DIR__);
    if (!$root) {
        throw new RuntimeException('Public directory is not available');
    }
    $relativePath = ltrim(str_replace(['\\', "\0"], ['/', ''], $relativePath), '/');
    $target = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
    $parent = dirname($target);
    if (!is_dir($parent) && !mkdir($parent, 0755, true) && !is_dir($parent)) {
        throw new RuntimeException('Upload directory could not be created');
    }
    $resolvedParent = realpath($parent);
    if (!$resolvedParent || !str_starts_with($resolvedParent, $root)) {
        throw new RuntimeException('Invalid upload path');
    }
    return $target;
}

function uploaded_product_image_path(array $file, string $baseName = 'product'): string {
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $errors = [
            UPLOAD_ERR_INI_SIZE => 'Uploaded image exceeds the server upload limit',
            UPLOAD_ERR_FORM_SIZE => 'Uploaded image exceeds the form upload limit',
            UPLOAD_ERR_PARTIAL => 'Image upload was incomplete',
            UPLOAD_ERR_NO_FILE => 'Product image is required',
        ];
        json_response(['error' => $errors[$file['error']] ?? 'Image upload failed'], 422);
    }
    if ((int)($file['size'] ?? 0) <= 0 || (int)$file['size'] > 5 * 1024 * 1024) {
        json_response(['error' => 'Product image must be 5MB or smaller'], 422);
    }
    $original = (string)($file['name'] ?? '');
    $extension = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    $allowedExtensions = ['jpg' => 'jpg', 'jpeg' => 'jpg', 'png' => 'png', 'webp' => 'webp'];
    if (!isset($allowedExtensions[$extension])) {
        json_response(['error' => 'Only JPG, PNG or WEBP product images are allowed'], 422);
    }
    $tmp = (string)($file['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        json_response(['error' => 'Invalid uploaded image'], 422);
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($tmp) ?: '';
    $allowedMimes = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($allowedMimes[$mime]) || $allowedMimes[$mime] !== $allowedExtensions[$extension]) {
        json_response(['error' => 'Uploaded file content does not match an allowed image type'], 422);
    }
    if (@getimagesize($tmp) === false) {
        json_response(['error' => 'Uploaded file is not a valid image'], 422);
    }
    $safeBase = slugify($baseName);
    $filename = $safeBase . '-' . bin2hex(random_bytes(8)) . '.' . $allowedMimes[$mime];
    $relative = 'uploads/products/' . $filename;
    $target = public_upload_path($relative);
    if (!move_uploaded_file($tmp, $target)) {
        json_response(['error' => 'Unable to save uploaded image'], 500);
    }
    @chmod($target, 0644);
    return $relative;
}

function delete_local_upload(?string $relativePath): void {
    if (!$relativePath) {
        return;
    }
    $relativePath = ltrim(str_replace(['\\', "\0"], ['/', ''], $relativePath), '/');
    if (!str_starts_with($relativePath, 'uploads/products/')) {
        return;
    }
    $root = realpath(__DIR__);
    if (!$root) {
        return;
    }
    $target = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
    $resolved = realpath($target);
    if ($resolved && str_starts_with($resolved, $root . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'products' . DIRECTORY_SEPARATOR) && is_file($resolved)) {
        @unlink($resolved);
    }
}

function haversine(float $lat1, float $lon1, float $lat2, float $lon2): float {
    $earth = 6371;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
    return $earth * 2 * atan2(sqrt($a), sqrt(1 - $a));
}

function delivery_quote(float $lat, float $lng): array {
    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
        json_response(['error' => 'Invalid delivery coordinates'], 422);
    }
    $s = settings();
    $distance = money(haversine((float)$s['restaurant_latitude'], (float)$s['restaurant_longitude'], $lat, $lng));
    $stmt = db()->prepare('SELECT * FROM delivery_slabs WHERE is_active=1 AND ? BETWEEN min_km AND max_km ORDER BY min_km LIMIT 1');
    $stmt->execute([$distance]);
    $slab = $stmt->fetch();
    if (!$slab) {
        json_response(['error' => 'Delivery is not available for this distance', 'distance_km' => $distance], 422);
    }
    return ['distance_km' => $distance, 'delivery_charge' => money((float)$slab['charge']), 'slab' => $slab];
}

function setting_enabled(string $key, bool $default = false): bool {
    $settings = settings();
    if (!array_key_exists($key, $settings)) {
        return $default;
    }
    return (string)$settings[$key] === '1';
}

function active_coupon(?string $code, float $subtotal, ?int $userId): array {
    if (!$code) {
        return ['coupon' => null, 'discount' => 0.0];
    }
    $stmt = db()->prepare("SELECT * FROM coupons WHERE code=? AND is_active=1 AND (starts_at IS NULL OR starts_at <= NOW()) AND (expires_at IS NULL OR expires_at >= NOW()) LIMIT 1");
    $stmt->execute([strtoupper(trim($code))]);
    $coupon = $stmt->fetch();
    if (!$coupon) json_response(['error' => 'Invalid coupon'], 422);
    if ($subtotal < (float)$coupon['min_order_value']) json_response(['error' => 'Coupon minimum order value not met'], 422);
    if ($coupon['overall_usage_limit'] !== null) {
        $count = db()->prepare('SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id=?');
        $count->execute([$coupon['id']]);
        if ((int)$count->fetchColumn() >= (int)$coupon['overall_usage_limit']) json_response(['error' => 'Coupon usage limit reached'], 422);
    }
    if ($coupon['per_customer_limit'] !== null && $userId !== null) {
        $count = db()->prepare('SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id=? AND user_id=?');
        $count->execute([$coupon['id'], $userId]);
        if ((int)$count->fetchColumn() >= (int)$coupon['per_customer_limit']) json_response(['error' => 'Coupon customer usage limit reached'], 422);
    }
    $discount = $coupon['discount_type'] === 'percent' ? $subtotal * ((float)$coupon['discount_value'] / 100) : (float)$coupon['discount_value'];
    if ($coupon['max_discount'] !== null) {
        $discount = min($discount, (float)$coupon['max_discount']);
    }
    return ['coupon' => $coupon, 'discount' => money(min($discount, $subtotal))];
}

function bogo_free_qty(array $item, int $qty): int {
    $stmt = db()->prepare("SELECT * FROM offers WHERE is_active=1 AND buy_qty > 0 AND get_qty > 0 AND (starts_at IS NULL OR starts_at <= NOW()) AND (expires_at IS NULL OR expires_at >= NOW()) AND ((scope='item' AND scope_id=?) OR (scope='category' AND scope_id=?)) ORDER BY get_qty DESC LIMIT 1");
    $stmt->execute([$item['id'], $item['category_id']]);
    $offer = $stmt->fetch();
    if (!$offer) return 0;
    return intdiv($qty, (int)$offer['buy_qty']) * (int)$offer['get_qty'];
}

function option_price_for_variant(array $option, string $variantName): float {
    $name = strtolower($variantName);
    if ($name === 's' || str_contains($name, 'small')) return (float)($option['small_price'] ?? $option['fixed_price'] ?? 0);
    if ($name === 'm' || str_contains($name, 'medium')) return (float)($option['medium_price'] ?? $option['fixed_price'] ?? 0);
    if ($name === 'l' || str_contains($name, 'large')) return (float)($option['large_price'] ?? $option['fixed_price'] ?? 0);
    return (float)($option['fixed_price'] ?? $option['small_price'] ?? 0);
}

function calculate_cart(array $items, ?string $couponCode, ?int $userId, ?float $lat, ?float $lng, string $orderType = 'delivery'): array {
    if (!in_array($orderType, ['delivery', 'takeaway'], true)) {
        json_response(['error' => 'Invalid order type'], 422);
    }
    if (!$items) json_response(['error' => 'Cart is empty'], 422);
    $ids = array_values(array_unique(array_map(fn($i) => (int)($i['id'] ?? 0), $items)));
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = db()->prepare("SELECT * FROM menu_items WHERE id IN ($placeholders) AND is_active=1");
    $stmt->execute($ids);
    $products = [];
    foreach ($stmt->fetchAll() as $row) $products[(int)$row['id']] = $row;
    $lines = [];
    $subtotal = 0.0;
    foreach ($items as $cartItem) {
        $id = (int)($cartItem['id'] ?? 0);
        $qty = max(1, (int)($cartItem['quantity'] ?? 1));
        if (!isset($products[$id])) json_response(['error' => 'Invalid menu item'], 422);
        $product = $products[$id];
        $variant = null;
        $variantId = isset($cartItem['variant_id']) ? (int)$cartItem['variant_id'] : 0;
        if ($variantId > 0) {
            $variantStmt = db()->prepare('SELECT * FROM menu_item_variants WHERE id=? AND menu_item_id=? AND is_active=1 LIMIT 1');
            $variantStmt->execute([$variantId, $id]);
            $variant = $variantStmt->fetch();
            if (!$variant) json_response(['error' => 'Invalid product variant'], 422);
        } else {
            try {
                $variantStmt = db()->prepare('SELECT * FROM menu_item_variants WHERE menu_item_id=? AND is_active=1 ORDER BY is_default DESC, sort_order, id LIMIT 1');
                $variantStmt->execute([$id]);
                $variant = $variantStmt->fetch() ?: null;
            } catch (Throwable $e) {
                $variant = null;
            }
        }
        $unitPrice = $variant ? (float)$variant['price'] : (float)$product['price'];
        $selectedOptions = [];
        $optionTotal = 0.0;
        $optionIds = array_values(array_unique(array_map('intval', $cartItem['option_ids'] ?? [])));
        if ($optionIds) {
            $optionPlaceholders = implode(',', array_fill(0, count($optionIds), '?'));
            $optionStmt = db()->prepare("SELECT o.*, g.name AS group_name FROM menu_item_options o JOIN menu_option_groups g ON g.id=o.group_id WHERE o.id IN ($optionPlaceholders) AND o.is_active=1 AND g.is_active=1");
            $optionStmt->execute($optionIds);
            $options = $optionStmt->fetchAll();
            if (count($options) !== count($optionIds)) json_response(['error' => 'Invalid menu option'], 422);
            foreach ($options as $option) {
                if (($option['applies_to'] ?? 'pizza') === 'pizza' && !in_array((string)($variant['name'] ?? ''), ['S', 'M', 'L'], true)) {
                    json_response(['error' => 'Selected option is only available for pizzas'], 422);
                }
                $optionPrice = option_price_for_variant($option, (string)($variant['name'] ?? 'Regular'));
                $optionTotal += $optionPrice;
                $selectedOptions[] = ['id' => (int)$option['id'], 'name' => $option['name'], 'group_name' => $option['group_name'], 'price' => money($optionPrice)];
            }
        }
        $free = bogo_free_qty($product, $qty);
        if ((int)$product['stock'] < $qty + $free) json_response(['error' => $product['name'] . ' does not have enough stock'], 422);
        $lineTotal = money(($unitPrice + $optionTotal) * $qty);
        $subtotal += $lineTotal;
        $lines[] = ['item' => $product, 'variant' => $variant, 'options' => $selectedOptions, 'quantity' => $qty, 'free_quantity' => $free, 'unit_price' => money($unitPrice + $optionTotal), 'line_total' => $lineTotal];
    }
    $coupon = active_coupon($couponCode, $subtotal, $userId);
    $delivery = ['distance_km' => null, 'delivery_charge' => 0.0, 'slab' => null];
    if ($orderType === 'delivery') {
        if ($lat === null || $lng === null) json_response(['error' => 'Delivery coordinates are required'], 422);
        $delivery = delivery_quote($lat, $lng);
    }
    $total = money($subtotal - $coupon['discount'] + $delivery['delivery_charge']);
    $minimum = (float)(settings()['minimum_order'] ?? 0);
    if ($subtotal < $minimum) {
        json_response(['error' => 'Minimum order value is ' . money($minimum)], 422);
    }
    return ['order_type' => $orderType, 'lines' => $lines, 'subtotal' => money($subtotal), 'discount' => $coupon['discount'], 'coupon' => $coupon['coupon'], 'delivery' => $delivery, 'total' => $total];
}

function payable_amount(float $total, string $mode, string $orderType = 'delivery'): array {
    $s = settings();
    if (!in_array($mode, ['full', 'partial', 'cod'], true)) {
        json_response(['error' => 'Invalid payment mode'], 422);
    }
    if ($orderType === 'takeaway' && $mode !== 'full') {
        json_response(['error' => 'Takeaway orders require full payment'], 422);
    }
    if ($mode === 'cod') {
        if (($s['cod_enabled'] ?? '0') !== '1') json_response(['error' => 'COD is disabled'], 422);
        return ['pay_now' => 0.0, 'remaining' => $total, 'status' => 'COD'];
    }
    if ($mode === 'partial') {
        if (($s['partial_payment_enabled'] ?? '0') !== '1') json_response(['error' => 'Partial payment is disabled'], 422);
        $value = (float)($s['partial_payment_value'] ?? 0);
        $amount = ($s['partial_payment_type'] ?? 'percent') === 'fixed' ? $value : $total * ($value / 100);
        $payNow = money(min(max($amount, 0), $total));
        return ['pay_now' => $payNow, 'remaining' => money($total - $payNow), 'status' => 'Pending'];
    }
    if (($s['full_payment_enabled'] ?? '1') !== '1') json_response(['error' => 'Full payment is disabled'], 422);
    return ['pay_now' => $total, 'remaining' => 0.0, 'status' => 'Pending'];
}

function ensure_online_payment_configured(float $payNow): void {
    if ($payNow > 0 && (!env('RAZORPAY_KEY_ID', '') || !env('RAZORPAY_KEY_SECRET', ''))) {
        json_response(['error' => 'Razorpay credentials are required for online payments'], 503);
    }
}

function razorpay_create_order(float $amount, string $receipt): ?array {
    $key = env('RAZORPAY_KEY_ID', '');
    $secret = env('RAZORPAY_KEY_SECRET', '');
    if ($amount <= 0) return null;
    if (!$key || !$secret) {
        json_response(['error' => 'Razorpay credentials are required for online payments'], 503);
    }
    $payload = json_encode(['amount' => (int)round($amount * 100), 'currency' => 'INR', 'receipt' => $receipt, 'payment_capture' => 1]);
    $ch = curl_init('https://api.razorpay.com/v1/orders');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_USERPWD => $key . ':' . $secret,
    ]);
    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $json = json_decode((string)$response, true);
    if ($response === false || $curlError !== '') {
        json_response(['error' => 'Unable to create Razorpay order', 'razorpay_status' => $status ?: null, 'razorpay_message' => $curlError], 502);
    }
    if ($status >= 400 || !is_array($json)) {
        $message = is_array($json) ? ($json['error']['description'] ?? $json['error']['reason'] ?? $json['error']['code'] ?? 'Razorpay API error') : 'Invalid Razorpay API response';
        json_response(['error' => 'Unable to create Razorpay order', 'razorpay_status' => $status, 'razorpay_message' => $message], 502);
    }
    return $json;
}

function razorpay_fetch_payment(string $paymentId): ?array {
    $key = env('RAZORPAY_KEY_ID', '');
    $secret = env('RAZORPAY_KEY_SECRET', '');
    if (!$key || !$secret) return null;
    $ch = curl_init('https://api.razorpay.com/v1/payments/' . rawurlencode($paymentId));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPGET => true,
        CURLOPT_USERPWD => $key . ':' . $secret,
    ]);
    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $json = json_decode((string)$response, true);
    if ($response === false || $curlError !== '') {
        json_response(['error' => 'Unable to verify Razorpay payment', 'razorpay_status' => $status ?: null, 'razorpay_message' => $curlError], 502);
    }
    if ($status >= 400 || !is_array($json)) {
        $message = is_array($json) ? ($json['error']['description'] ?? $json['error']['reason'] ?? $json['error']['code'] ?? 'Razorpay API error') : 'Invalid Razorpay API response';
        json_response(['error' => 'Unable to verify Razorpay payment', 'razorpay_status' => $status, 'razorpay_message' => $message], 502);
    }
    return $json;
}

function queue_notification(?int $orderId, string $channel, string $recipient, string $message): void {
    $stmt = db()->prepare('INSERT INTO notifications (order_id, channel, recipient, message) VALUES (?, ?, ?, ?)');
    $stmt->execute([$orderId, $channel, $recipient, $message]);
}

function queue_order_notifications(int $orderId, string $message): void {
    $stmt = db()->prepare('SELECT COALESCE(u.phone, o.guest_phone, "") AS phone FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.id=? LIMIT 1');
    $stmt->execute([$orderId]);
    $phone = (string)($stmt->fetchColumn() ?: '');
    if ($phone !== '') {
        queue_notification($orderId, 'whatsapp', $phone, $message);
    }
    $push = db()->prepare('SELECT endpoint FROM push_subscriptions WHERE user_id=(SELECT user_id FROM orders WHERE id=? AND user_id IS NOT NULL)');
    $push->execute([$orderId]);
    foreach ($push->fetchAll() as $sub) {
        queue_notification($orderId, 'web_push', $sub['endpoint'], $message);
    }
}

function order_with_customer(int $orderId): ?array {
    $stmt = db()->prepare("SELECT o.*, COALESCE(u.name, o.guest_name, 'Guest Customer') AS customer_name,
        COALESCE(u.phone, o.guest_phone, '') AS customer_phone,
        COALESCE(u.email, o.guest_email, '') AS customer_email
        FROM orders o
        LEFT JOIN users u ON u.id=o.user_id
        WHERE o.id=? LIMIT 1");
    $stmt->execute([$orderId]);
    return $stmt->fetch() ?: null;
}

function invoice_payload(array $order): array {
    $items = db()->prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id');
    $items->execute([$order['id']]);
    return [
        'settings' => settings(),
        'order' => public_order($order),
        'items' => array_map('public_order_item', $items->fetchAll()),
    ];
}

function pdf_escape(string $value): string {
    $value = preg_replace('/[^\x20-\x7E\r\n]/', '', $value) ?? '';
    return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $value);
}

function pdf_text_lines(array $lines): string {
    $ops = "BT\n/F1 10 Tf\n50 790 Td\n14 TL\n";
    foreach ($lines as $index => $line) {
        $ops .= ($index > 0 ? "T*\n" : '') . '(' . pdf_escape((string)$line) . ") Tj\n";
    }
    return $ops . "ET\n";
}

function simple_pdf(array $lines): string {
    $content = pdf_text_lines($lines);
    $objects = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        "5 0 obj\n<< /Length " . strlen($content) . " >>\nstream\n" . $content . "endstream\nendobj\n",
    ];
    $pdf = "%PDF-1.4\n";
    $offsets = [0];
    foreach ($objects as $object) {
        $offsets[] = strlen($pdf);
        $pdf .= $object;
    }
    $xref = strlen($pdf);
    $pdf .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
    for ($i = 1; $i <= count($objects); $i++) {
        $pdf .= str_pad((string)$offsets[$i], 10, '0', STR_PAD_LEFT) . " 00000 n \n";
    }
    return $pdf . "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n$xref\n%%EOF";
}

function invoice_pdf_bytes(array $order): string {
    $payload = invoice_payload($order);
    $settings = $payload['settings'];
    $order = $payload['order'];
    $lines = [
        ($settings['restaurant_name'] ?? 'The Pizza House') . ' - Invoice',
        'Order ID: ' . ($order['order_number'] ?? $order['id']),
        'Order Date: ' . ($order['created_at'] ?? ''),
        'Customer: ' . ($order['customer_name'] ?? 'Customer'),
        'Mobile: ' . ($order['customer_phone'] ?? ''),
        'Email: ' . ($order['customer_email'] ?? ''),
        'Order Type: ' . ucfirst((string)($order['order_type'] ?? 'delivery')),
    ];
    if (($order['order_type'] ?? '') === 'delivery') {
        $lines[] = 'Delivery Address: ' . ($order['delivery_address'] ?? '');
    }
    $lines[] = '';
    $lines[] = 'Items';
    $lines[] = str_repeat('-', 72);
    foreach ($payload['items'] as $item) {
        $title = $item['name_snapshot'];
        if (!empty($item['variant_label'])) $title .= ' - ' . $item['variant_label'];
        $lines[] = $title;
        if (!empty($item['options_display'])) $lines[] = '  ' . $item['options_display'];
        $lines[] = '  Qty: ' . $item['quantity'] . ' | Unit: INR ' . number_format((float)$item['unit_price'], 2) . ' | Line: INR ' . number_format((float)$item['line_total'], 2);
        if ((int)$item['free_quantity'] > 0) $lines[] = '  Free quantity: ' . $item['free_quantity'];
    }
    $lines[] = str_repeat('-', 72);
    $lines[] = 'Subtotal: INR ' . number_format((float)$order['subtotal'], 2);
    $lines[] = 'Delivery Charge: INR ' . number_format((float)$order['delivery_charge'], 2);
    $lines[] = 'Discount: INR ' . number_format((float)$order['discount_amount'], 2);
    $lines[] = 'Paid Amount: INR ' . number_format((float)$order['paid_amount'], 2);
    $lines[] = 'Remaining Amount: INR ' . number_format((float)$order['remaining_amount'], 2);
    $lines[] = 'Grand Total: INR ' . number_format((float)$order['total_amount'], 2);
    $lines[] = 'Payment Status: ' . ($order['payment_status'] ?? '');
    return simple_pdf($lines);
}

function send_pdf_response(array $order): void {
    $filename = 'invoice-' . preg_replace('/[^A-Za-z0-9_-]/', '-', (string)$order['order_number']) . '.pdf';
    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="' . $filename . '"');
    echo invoice_pdf_bytes($order);
    exit;
}

function log_invoice_email(int $orderId, string $recipient, string $status, ?string $error = null): void {
    db()->prepare("INSERT INTO order_email_logs (order_id, email_type, recipient, status, error_message)
        VALUES (?, 'order_confirmation', ?, ?, ?)
        ON DUPLICATE KEY UPDATE recipient=VALUES(recipient), status=VALUES(status), error_message=VALUES(error_message), created_at=CURRENT_TIMESTAMP")
        ->execute([$orderId, $recipient, $status, $error]);
}

function send_invoice_email(array $order, bool $manual = false): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    if ($recipient === '' || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        log_invoice_email((int)$order['id'], $recipient ?: 'not-provided', 'skipped', 'No valid customer email available');
        return ['ok' => false, 'status' => 'skipped', 'error' => 'No valid customer email available'];
    }
    $from = env('MAIL_FROM_EMAIL', env('SMTP_FROM_EMAIL', ''));
    if ($from === '' || !filter_var($from, FILTER_VALIDATE_EMAIL)) {
        log_invoice_email((int)$order['id'], $recipient, 'skipped', 'MAIL_FROM_EMAIL is not configured');
        return ['ok' => false, 'status' => 'skipped', 'error' => 'MAIL_FROM_EMAIL is not configured'];
    }
    $boundary = 'TPH-' . bin2hex(random_bytes(12));
    $subject = 'The Pizza House invoice for ' . $order['order_number'];
    $message = "Thank you for ordering from The Pizza House.\r\n\r\nOrder: {$order['order_number']}\r\nTotal: INR " . number_format((float)$order['total_amount'], 2) . "\r\nPayment status: {$order['payment_status']}\r\n\r\nYour invoice is attached.";
    $pdf = chunk_split(base64_encode(invoice_pdf_bytes($order)));
    $filename = 'invoice-' . preg_replace('/[^A-Za-z0-9_-]/', '-', (string)$order['order_number']) . '.pdf';
    $headers = [
        'From: ' . $from,
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="' . $boundary . '"',
    ];
    $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n$message\r\n";
    $body .= "--$boundary\r\nContent-Type: application/pdf; name=\"$filename\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"$filename\"\r\n\r\n$pdf\r\n--$boundary--";
    $sent = @mail($recipient, $subject, $body, implode("\r\n", $headers));
    log_invoice_email((int)$order['id'], $recipient, $sent ? 'sent' : 'failed', $sent ? null : 'PHP mail() returned false');
    if ($manual && !$sent) {
        json_response(['error' => 'Invoice email could not be sent. Check MAIL_FROM_EMAIL and server mail configuration.'], 503);
    }
    return ['ok' => $sent, 'status' => $sent ? 'sent' : 'failed', 'error' => $sent ? null : 'PHP mail() returned false'];
}

function queue_invoice_email_after_order(int $orderId): void {
    try {
        $order = order_with_customer($orderId);
        if ($order) {
            send_invoice_email($order);
        }
    } catch (Throwable $e) {
        try {
            log_invoice_email($orderId, 'unknown', 'failed', $e->getMessage());
        } catch (Throwable $ignored) {
        }
    }
}

function upsert_setting_table(string $table, array $values): array {
    $allowed = $table === 'theme_settings' ? array_keys(theme()) : array_keys(settings());
    foreach ($values as $key => $value) {
        if (!in_array($key, $allowed, true)) continue;
        if ($table === 'theme_settings') {
            validate_theme_value($key, (string)$value);
        } else {
            validate_setting_value($key, (string)$value);
        }
        $stmt = db()->prepare("INSERT INTO $table (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)");
        $stmt->execute([$key, (string)$value]);
    }
    return $table === 'theme_settings' ? theme() : settings();
}

function validate_theme_value(string $key, string $value): void {
    $colorKeys = ['background_color','primary_color','secondary_color','button_color','button_hover_color','button_text_color','text_color','card_color','header_color','footer_color','border_color','accent_color'];
    $sizeKeys = ['heading_font_size','body_font_size','button_font_size','navigation_font_size','product_font_size','button_border_radius','card_border_radius'];
    if (in_array($key, $colorKeys, true) && !preg_match('/^#[0-9a-fA-F]{6}$/', $value)) {
        json_response(['error' => "Invalid color value for $key"], 422);
    }
    if (in_array($key, $sizeKeys, true) && !preg_match('/^\d{1,3}(\.\d{1,2})?(px|rem|em)$/', $value)) {
        json_response(['error' => "Invalid size value for $key"], 422);
    }
    if ($key === 'button_padding' && !preg_match('/^\d{1,3}(\.\d{1,2})?(px|rem|em)(\s+\d{1,3}(\.\d{1,2})?(px|rem|em)){0,3}$/', $value)) {
        json_response(['error' => 'Invalid button padding'], 422);
    }
    if ($key === 'button_font_weight' && !preg_match('/^(normal|bold|[1-9]00)$/', $value)) {
        json_response(['error' => 'Invalid button font weight'], 422);
    }
    if ($key === 'font_family' && !preg_match('/^[A-Za-z0-9\s,"\-]+$/', $value)) {
        json_response(['error' => 'Invalid font family'], 422);
    }
    if (in_array($key, ['logo_url', 'favicon_url'], true) && $value !== '' && !filter_var($value, FILTER_VALIDATE_URL)) {
        json_response(['error' => "Invalid URL for $key"], 422);
    }
}

function validate_setting_value(string $key, string $value): void {
    if (in_array($key, ['restaurant_latitude','restaurant_longitude','minimum_order','partial_payment_value'], true) && !valid_decimal($value)) {
        json_response(['error' => "Invalid numeric setting $key"], 422);
    }
    if ($key === 'partial_payment_type' && !in_array($value, ['percent', 'fixed'], true)) {
        json_response(['error' => 'Partial payment type must be percent or fixed'], 422);
    }
    if (in_array($key, ['partial_payment_enabled','cod_enabled','full_payment_enabled','customer_login_required'], true) && !is_truthy_setting($value)) {
        json_response(['error' => "$key must be 0 or 1"], 422);
    }
    if ($key === 'partial_payment_value' && (float)$value < 0) {
        json_response(['error' => 'Partial payment value cannot be negative'], 422);
    }
    if ($key === 'minimum_order' && (float)$value < 0) {
        json_response(['error' => 'Minimum order cannot be negative'], 422);
    }
}

function guest_token_hash(?string $token): ?string {
    $token = trim((string)$token);
    return $token === '' ? null : hash('sha256', $token);
}

function guest_order_token_from_request(array $data = []): ?string {
    return $data['guest_access_token']
        ?? $_GET['access_token']
        ?? ($_SERVER['HTTP_X_GUEST_ORDER_TOKEN'] ?? null);
}

function order_accessible_to_request(array $order, array $data = []): bool {
    $token = bearer_token();
    if ($token) {
        $stmt = db()->prepare('SELECT u.id, u.role, u.is_active FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.expires_at > NOW() LIMIT 1');
        $stmt->execute([hash('sha256', $token)]);
        $user = $stmt->fetch();
        if ($user && (int)($user['is_active'] ?? 1) === 1 && $user['role'] === 'customer' && (int)$order['user_id'] === (int)$user['id']) {
            return true;
        }
    }
    $guestTokenHash = guest_token_hash(guest_order_token_from_request($data));
    return $guestTokenHash !== null
        && empty($order['user_id'])
        && !empty($order['guest_access_token_hash'])
        && hash_equals((string)$order['guest_access_token_hash'], $guestTokenHash)
        && (empty($order['guest_access_expires_at']) || strtotime((string)$order['guest_access_expires_at']) >= time());
}

function validate_admin_resource(string $name, array $payload): void {
    if ($name === 'products') {
        foreach (['price','stock','low_stock_threshold'] as $field) {
            if (isset($payload[$field]) && !valid_decimal($payload[$field])) json_response(['error' => "Invalid $field"], 422);
        }
        if (isset($payload['price']) && (float)$payload['price'] < 0) json_response(['error' => 'Price cannot be negative'], 422);
        if (isset($payload['stock']) && (int)$payload['stock'] < 0) json_response(['error' => 'Stock cannot be negative'], 422);
    }
    if ($name === 'coupons') {
        if (isset($payload['discount_type']) && !in_array($payload['discount_type'], ['flat','percent'], true)) json_response(['error' => 'Invalid discount type'], 422);
        foreach (['discount_value','min_order_value','max_discount'] as $field) {
            if (isset($payload[$field]) && $payload[$field] !== '' && !valid_decimal($payload[$field])) json_response(['error' => "Invalid $field"], 422);
        }
        if (($payload['discount_type'] ?? '') === 'percent' && isset($payload['discount_value']) && ((float)$payload['discount_value'] <= 0 || (float)$payload['discount_value'] > 100)) json_response(['error' => 'Percent discount must be between 1 and 100'], 422);
    }
    if ($name === 'offers') {
        if (isset($payload['scope']) && !in_array($payload['scope'], ['item','category'], true)) json_response(['error' => 'Invalid offer scope'], 422);
        foreach (['buy_qty','get_qty','scope_id'] as $field) {
            if (isset($payload[$field]) && (int)$payload[$field] <= 0) json_response(['error' => "$field must be positive"], 422);
        }
    }
    if ($name === 'delivery-slabs') {
        foreach (['min_km','max_km','charge'] as $field) {
            if (isset($payload[$field]) && !valid_decimal($payload[$field])) json_response(['error' => "Invalid $field"], 422);
        }
        if (isset($payload['min_km'], $payload['max_km']) && (float)$payload['min_km'] > (float)$payload['max_km']) json_response(['error' => 'Delivery slab min_km cannot exceed max_km'], 422);
        if (isset($payload['charge']) && (float)$payload['charge'] < 0) json_response(['error' => 'Delivery charge cannot be negative'], 422);
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = route_path();
$data = input();

if ($path === '/health') json_response(['ok' => true, 'time' => date(DATE_ATOM)]);
if ($path === '/health/db') {
    try {
        db()->query('SELECT 1')->fetchColumn();
        json_response(['ok' => true, 'database' => 'connected']);
    } catch (Throwable $e) {
        json_response(['ok' => false, 'database' => 'unavailable', 'detail' => getenv('APP_ENV') === 'local' ? $e->getMessage() : null], 503);
    }
}

if (str_starts_with($path, '/orders') || str_starts_with($path, '/account/orders') || str_starts_with($path, '/admin') || str_starts_with($path, '/delivery') || str_starts_with($path, '/auth') || str_starts_with($path, '/cart') || str_starts_with($path, '/payments') || $path === '/settings') {
    ensure_order_management_schema();
}
if ($path === '/theme' && $method === 'GET') json_response(['theme' => theme()]);
if ($path === '/settings' && $method === 'GET') {
    $s = settings();
    unset($s['RAZORPAY_KEY_SECRET']);
    json_response(['settings' => $s, 'razorpay_key_id' => env('RAZORPAY_KEY_ID', '')]);
}

if ($path === '/auth/register' && $method === 'POST') {
    require_fields($data, ['name', 'phone', 'email', 'password']);
    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) json_response(['error' => 'Invalid email'], 422);
    if (strlen((string)$data['password']) < 8) json_response(['error' => 'Password must be at least 8 characters'], 422);
    $stmt = db()->prepare("INSERT INTO users (name, phone, email, password_hash, role) VALUES (?, ?, ?, ?, 'customer')");
    try {
        $stmt->execute([trim($data['name']), trim($data['phone']), strtolower(trim($data['email'])), password_hash($data['password'], PASSWORD_DEFAULT)]);
    } catch (PDOException $e) {
        json_response(['error' => 'A customer account with this email already exists'], 422);
    }
    $id = (int)db()->lastInsertId();
    json_response(['token' => issue_token($id), 'user' => ['id' => $id, 'name' => trim($data['name']), 'phone' => trim($data['phone']), 'email' => strtolower(trim($data['email'])), 'role' => 'customer']], 201);
}

if (($path === '/auth/login' || $path === '/auth/admin-login') && $method === 'POST') {
    require_fields($data, ['email', 'password']);
    $role = $path === '/auth/admin-login' ? 'admin' : null;
    $sql = 'SELECT * FROM users WHERE email=?' . ($role ? ' AND role=?' : '') . ' LIMIT 1';
    $stmt = db()->prepare($sql);
    $stmt->execute($role ? [strtolower(trim($data['email'])), $role] : [strtolower(trim($data['email']))]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($data['password'], $user['password_hash'])) json_response(['error' => 'Invalid credentials'], 401);
    if (isset($user['is_active']) && (int)$user['is_active'] !== 1) json_response(['error' => 'Account is inactive'], 403);
    if ($path === '/auth/admin-login') {
        issue_admin_refresh_session($user);
        json_response(['token' => issue_token((int)$user['id'], '12 HOUR'), 'user' => ['id' => (int)$user['id'], 'name' => $user['name'], 'phone' => $user['phone'], 'email' => $user['email'], 'role' => $user['role']]]);
    }
    json_response(['token' => issue_token((int)$user['id']), 'user' => ['id' => (int)$user['id'], 'name' => $user['name'], 'phone' => $user['phone'], 'email' => $user['email'], 'role' => $user['role']]]);
}

if ($path === '/auth/me' && $method === 'GET') {
    $user = current_user();
    json_response(['user' => ['id' => (int)$user['id'], 'name' => $user['name'], 'phone' => $user['phone'], 'email' => $user['email'], 'role' => $user['role']]]);
}

if ($path === '/auth/logout' && $method === 'POST') {
    $token = bearer_token();
    if ($token) {
        db()->prepare('DELETE FROM auth_tokens WHERE token_hash=?')->execute([hash('sha256', $token)]);
    }
    json_response(['ok' => true]);
}

if ($path === '/auth/admin-refresh' && $method === 'POST') {
    $refresh = $_COOKIE[admin_refresh_cookie_name()] ?? '';
    if (!$refresh) json_response(['error' => 'Admin session expired'], 401);
    $stmt = db()->prepare("SELECT rt.*, u.id AS admin_id, u.name, u.email, u.role, u.password_hash, u.is_active
        FROM admin_refresh_tokens rt
        JOIN users u ON u.id=rt.user_id
        WHERE rt.token_hash=? AND rt.revoked_at IS NULL AND rt.expires_at > NOW()
        LIMIT 1");
    $stmt->execute([hash('sha256', $refresh)]);
    $session = $stmt->fetch();
    if (!$session || $session['role'] !== 'admin' || (int)$session['is_active'] !== 1 || !hash_equals($session['password_hash_snapshot'], hash('sha256', $session['password_hash']))) {
        revoke_admin_refresh_session($refresh);
        json_response(['error' => 'Admin session expired'], 401);
    }
    revoke_admin_refresh_session($refresh);
    issue_admin_refresh_session(['id' => $session['admin_id'], 'password_hash' => $session['password_hash']]);
    json_response(['token' => issue_token((int)$session['admin_id'], '12 HOUR'), 'user' => ['id' => (int)$session['admin_id'], 'name' => $session['name'], 'email' => $session['email'], 'role' => 'admin']]);
}

if ($path === '/auth/admin-logout' && $method === 'POST') {
    $token = bearer_token();
    if ($token) {
        db()->prepare('DELETE FROM auth_tokens WHERE token_hash=?')->execute([hash('sha256', $token)]);
    }
    revoke_admin_refresh_session();
    json_response(['ok' => true]);
}

if ($path === '/menu' && $method === 'GET') {
    $categories = db()->query('SELECT * FROM categories WHERE is_active=1 ORDER BY sort_order, name')->fetchAll();
    $items = db()->query('SELECT * FROM menu_items WHERE is_active=1 ORDER BY name')->fetchAll();
    $variants = [];
    try {
        foreach (db()->query('SELECT * FROM menu_item_variants WHERE is_active=1 ORDER BY menu_item_id, sort_order, id')->fetchAll() as $variant) {
            $variants[(int)$variant['menu_item_id']][] = $variant;
        }
    } catch (Throwable $e) {
        $variants = [];
    }
    $items = array_map(function (array $item) use ($variants): array {
        $item['variants'] = $variants[(int)$item['id']] ?? [];
        return $item;
    }, $items);
    $optionGroups = [];
    try {
        $groups = db()->query('SELECT * FROM menu_option_groups WHERE is_active=1 ORDER BY sort_order, name')->fetchAll();
        $optionsByGroup = [];
        foreach (db()->query('SELECT * FROM menu_item_options WHERE is_active=1 ORDER BY group_id, name')->fetchAll() as $option) {
            $optionsByGroup[(int)$option['group_id']][] = $option;
        }
        foreach ($groups as $group) {
            $group['options'] = $optionsByGroup[(int)$group['id']] ?? [];
            $optionGroups[] = $group;
        }
    } catch (Throwable $e) {
        $optionGroups = [];
    }
    json_response(['categories' => $categories, 'items' => $items, 'option_groups' => $optionGroups]);
}

if ($path === '/delivery/quote' && $method === 'POST') {
    require_fields($data, ['latitude', 'longitude']);
    if (!valid_decimal($data['latitude']) || !valid_decimal($data['longitude'])) json_response(['error' => 'Invalid coordinates'], 422);
    json_response(delivery_quote((float)$data['latitude'], (float)$data['longitude']));
}

if ($path === '/cart/validate' && $method === 'POST') {
    $authUser = current_user(false);
    $userId = $authUser && ($authUser['role'] ?? '') === 'customer' ? (int)$authUser['id'] : null;
    require_fields($data, ['items']);
    $orderType = $data['order_type'] ?? 'delivery';
    if (!in_array($orderType, ['delivery', 'takeaway'], true)) json_response(['error' => 'Invalid order type'], 422);
    $lat = null;
    $lng = null;
    if ($orderType === 'delivery') {
        require_fields($data, ['latitude', 'longitude']);
        if (!valid_decimal($data['latitude']) || !valid_decimal($data['longitude'])) json_response(['error' => 'Invalid coordinates'], 422);
        $lat = (float)$data['latitude'];
        $lng = (float)$data['longitude'];
    }
    json_response(calculate_cart($data['items'], $data['coupon_code'] ?? null, $userId, $lat, $lng, $orderType));
}

if ($path === '/orders' && $method === 'POST') {
    $authUser = current_user(false);
    $user = $authUser && ($authUser['role'] ?? '') === 'customer' ? $authUser : null;
    if (!$user && setting_enabled('customer_login_required', false)) {
        json_response(['error' => 'Customer login is required before checkout'], 401);
    }
    require_fields($data, ['items', 'payment_mode']);
    $orderType = $data['order_type'] ?? 'delivery';
    if (!in_array($orderType, ['delivery', 'takeaway'], true)) json_response(['error' => 'Invalid order type'], 422);
    $lat = null;
    $lng = null;
    $deliveryAddress = null;
    if ($orderType === 'delivery') {
        require_fields($data, ['delivery_address', 'latitude', 'longitude']);
        if (!valid_decimal($data['latitude']) || !valid_decimal($data['longitude'])) json_response(['error' => 'Invalid coordinates'], 422);
        $lat = (float)$data['latitude'];
        $lng = (float)$data['longitude'];
        $deliveryAddress = trim((string)$data['delivery_address']);
    }
    if ($orderType === 'takeaway' && $data['payment_mode'] !== 'full') {
        json_response(['error' => 'Takeaway orders require full payment'], 422);
    }
    $idempotency = $_SERVER['HTTP_X_IDEMPOTENCY_KEY'] ?? ($data['idempotency_key'] ?? '');
    if (!$idempotency) json_response(['error' => 'Idempotency key required'], 422);
    $guest = null;
    $guestAccessToken = null;
    if (!$user) {
        $guestInput = is_array($data['guest'] ?? null) ? $data['guest'] : $data;
        $guestName = trim((string)($guestInput['name'] ?? $guestInput['customer_name'] ?? ''));
        $guestPhone = trim((string)($guestInput['phone'] ?? $guestInput['customer_phone'] ?? ''));
        $guestEmail = strtolower(trim((string)($guestInput['email'] ?? $guestInput['customer_email'] ?? '')));
        if ($guestName === '' || $guestPhone === '') {
            json_response(['error' => 'Guest name and phone are required'], 422);
        }
        if ($guestEmail !== '' && !filter_var($guestEmail, FILTER_VALIDATE_EMAIL)) {
            json_response(['error' => 'Invalid guest email'], 422);
        }
        $guest = ['name' => $guestName, 'phone' => $guestPhone, 'email' => $guestEmail ?: null];
        $guestAccessToken = bin2hex(random_bytes(32));
    }
    $pdo = db();
    $existing = $pdo->prepare('SELECT * FROM orders WHERE idempotency_key=? LIMIT 1');
    $existing->execute([$idempotency]);
    if ($row = $existing->fetch()) {
        json_response(['order' => public_order($row), 'duplicate' => true]);
    }
    $calc = calculate_cart($data['items'], $data['coupon_code'] ?? null, $user ? (int)$user['id'] : null, $lat, $lng, $orderType);
    $payable = payable_amount($calc['total'], $data['payment_mode'], $orderType);
    ensure_online_payment_configured($payable['pay_now']);
    $pdo->beginTransaction();
    try {
        $orderNumber = 'TPH-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
        $stmt = $pdo->prepare('INSERT INTO orders (order_number, user_id, guest_name, guest_phone, guest_email, order_type, subtotal, discount_amount, delivery_charge, total_amount, coupon_id, delivery_address, latitude, longitude, distance_km, payment_mode, payment_status, paid_amount, remaining_amount, idempotency_key, guest_access_token_hash, guest_access_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))');
        $stmt->execute([$orderNumber, $user['id'] ?? null, $guest['name'] ?? null, $guest['phone'] ?? null, $guest['email'] ?? null, $orderType, $calc['subtotal'], $calc['discount'], $calc['delivery']['delivery_charge'], $calc['total'], $calc['coupon']['id'] ?? null, $deliveryAddress, $lat, $lng, $calc['delivery']['distance_km'], $data['payment_mode'], $payable['status'], $payable['remaining'], $idempotency, $guestAccessToken ? hash('sha256', $guestAccessToken) : null]);
        $orderId = (int)$pdo->lastInsertId();
        foreach ($calc['lines'] as $line) {
            $item = $line['item'];
            $variant = $line['variant'];
            $optionsSnapshot = option_snapshot($line);
            $pdo->prepare('INSERT INTO order_items (order_id, menu_item_id, variant_id, name_snapshot, variant_snapshot, options_snapshot, unit_price, quantity, free_quantity, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$orderId, $item['id'], $variant['id'] ?? null, $item['name'], $variant['name'] ?? null, $optionsSnapshot, $line['unit_price'], $line['quantity'], $line['free_quantity'], $line['line_total']]);
            $stockStmt = $pdo->prepare('UPDATE menu_items SET stock = stock - ? WHERE id=? AND stock >= ?');
            $stockStmt->execute([$line['quantity'] + $line['free_quantity'], $item['id'], $line['quantity'] + $line['free_quantity']]);
            if ($stockStmt->rowCount() !== 1) {
                throw new RuntimeException($item['name'] . ' stock changed while ordering. Please retry.');
            }
        }
        if ($calc['coupon']) {
            $pdo->prepare('INSERT INTO coupon_redemptions (coupon_id, user_id, order_id) VALUES (?, ?, ?)')->execute([$calc['coupon']['id'], $user['id'] ?? null, $orderId]);
        }
        $pdo->prepare('INSERT INTO order_status_history (order_id, new_status, changed_by) VALUES (?, ?, ?)')->execute([$orderId, 'received', $user['id'] ?? null]);
        $razorpayOrder = razorpay_create_order($payable['pay_now'], $orderNumber);
        if ($razorpayOrder) {
            $pdo->prepare('UPDATE orders SET razorpay_order_id=? WHERE id=?')->execute([$razorpayOrder['id'], $orderId]);
            $pdo->prepare('INSERT INTO payments (order_id, razorpay_order_id, amount, status) VALUES (?, ?, ?, ?)')->execute([$orderId, $razorpayOrder['id'], $payable['pay_now'], 'created']);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    $stmt = $pdo->prepare('SELECT * FROM orders WHERE id=?');
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    queue_order_notifications($orderId, 'Your order ' . $orderNumber . ' has been placed.');
    $owner = env('OWNER_WHATSAPP_NUMBER', '');
    if ($owner) queue_notification($orderId, 'whatsapp', $owner, 'New order ' . $orderNumber . ' received.');
    if (($order['payment_status'] ?? '') === 'COD') {
        queue_invoice_email_after_order($orderId);
    }
    $payload = ['order' => public_order($order), 'razorpay_order' => $razorpayOrder, 'pay_now' => $payable['pay_now'], 'remaining' => $payable['remaining']];
    if ($guestAccessToken) {
        $payload['guest_access_token'] = $guestAccessToken;
    }
    json_response($payload, 201);
}

if ($path === '/payments/verify' && $method === 'POST') {
    require_fields($data, ['order_id', 'razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature']);
    $stmt = db()->prepare('SELECT * FROM orders WHERE id=? LIMIT 1');
    $stmt->execute([$data['order_id']]);
    $order = $stmt->fetch();
    if (!$order) json_response(['error' => 'Order not found'], 404);
    if (!order_accessible_to_request($order, $data)) json_response(['error' => 'Order not found'], 404);
    if ($order['razorpay_payment_id']) json_response(['order' => public_order($order), 'duplicate' => true]);
    $secret = env('RAZORPAY_KEY_SECRET', '');
    if ($secret) {
        $expected = hash_hmac('sha256', $data['razorpay_order_id'] . '|' . $data['razorpay_payment_id'], $secret);
        if (!hash_equals($expected, $data['razorpay_signature'])) json_response(['error' => 'Invalid Razorpay signature'], 422);
    } else {
        json_response(['error' => 'Razorpay secret is not configured'], 500);
    }
    $payment = db()->prepare('SELECT * FROM payments WHERE order_id=? AND razorpay_order_id=? LIMIT 1');
    $payment->execute([$order['id'], $data['razorpay_order_id']]);
    $paymentRow = $payment->fetch();
    if (!$paymentRow) json_response(['error' => 'Payment record not found'], 422);
    $remotePayment = razorpay_fetch_payment((string)$data['razorpay_payment_id']);
    if ($remotePayment) {
        $expectedPaise = (int)round((float)$paymentRow['amount'] * 100);
        if (($remotePayment['order_id'] ?? '') !== $data['razorpay_order_id']) json_response(['error' => 'Razorpay order mismatch'], 422);
        if ((int)($remotePayment['amount'] ?? 0) !== $expectedPaise) json_response(['error' => 'Razorpay amount mismatch'], 422);
        if (!in_array(($remotePayment['status'] ?? ''), ['captured', 'authorized'], true)) json_response(['error' => 'Razorpay payment is not successful'], 422);
    }
    $paidAmount = (float)$paymentRow['amount'];
    $status = $paidAmount >= (float)$order['total_amount'] ? 'Paid' : 'Partially Paid';
    $remaining = money((float)$order['total_amount'] - $paidAmount);
    db()->prepare('UPDATE payments SET razorpay_payment_id=?, status=?, raw_payload=? WHERE id=?')->execute([$data['razorpay_payment_id'], 'verified', json_encode($data), $paymentRow['id']]);
    db()->prepare('UPDATE orders SET razorpay_payment_id=?, paid_amount=?, remaining_amount=?, payment_status=? WHERE id=?')->execute([$data['razorpay_payment_id'], $paidAmount, $remaining, $status, $order['id']]);
    $stmt = db()->prepare('SELECT * FROM orders WHERE id=?');
    $stmt->execute([$order['id']]);
    $updatedOrder = $stmt->fetch();
    queue_invoice_email_after_order((int)$order['id']);
    json_response(['order' => public_order($updatedOrder)]);
}

if (preg_match('#^/orders/(\d+)/invoice$#', $path, $m) && $method === 'GET') {
    $order = order_with_customer((int)$m[1]);
    if (!$order || !order_accessible_to_request($order)) json_response(['error' => 'Order not found'], 404);
    send_pdf_response($order);
}

if (preg_match('#^/orders/(\d+)/email-invoice$#', $path, $m) && $method === 'POST') {
    $order = order_with_customer((int)$m[1]);
    if (!$order || !order_accessible_to_request($order, $data)) json_response(['error' => 'Order not found'], 404);
    json_response(['email' => send_invoice_email($order, true)]);
}

if (preg_match('#^/orders/(\d+)/track$#', $path, $m) && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM orders WHERE id=? LIMIT 1');
    $stmt->execute([(int)$m[1]]);
    $order = $stmt->fetch();
    if (!$order || !order_accessible_to_request($order)) json_response(['error' => 'Order not found'], 404);
    json_response(order_tracking_payload($order));
}

if (preg_match('#^/orders/(\d+)/driver-location$#', $path, $m) && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM orders WHERE id=? LIMIT 1');
    $stmt->execute([(int)$m[1]]);
    $order = $stmt->fetch();
    if (!$order || !order_accessible_to_request($order)) json_response(['error' => 'Order not found'], 404);
    $driver = db()->prepare('SELECT dl.latitude, dl.longitude, dl.accuracy, dl.recorded_at, u.name AS delivery_boy_name, u.phone AS delivery_boy_phone FROM delivery_locations dl JOIN users u ON u.id=dl.delivery_boy_id WHERE dl.order_id=? LIMIT 1');
    $driver->execute([$order['id']]);
    json_response(['order_status' => $order['status'], 'driver_location' => $driver->fetch() ?: null]);
}

if ($path === '/account/orders' && $method === 'GET') {
    $user = current_user(true, 'customer');
    $stmt = db()->prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC');
    $stmt->execute([$user['id']]);
    json_response(['orders' => $stmt->fetchAll()]);
}

if ($path === '/account/addresses') {
    $user = current_user(true, 'customer');
    if ($method === 'GET') {
        $stmt = db()->prepare('SELECT * FROM addresses WHERE user_id=? ORDER BY updated_at DESC');
        $stmt->execute([$user['id']]);
        json_response(['addresses' => $stmt->fetchAll()]);
    }
    if ($method === 'POST') {
        require_fields($data, ['label', 'address_line', 'latitude', 'longitude']);
        db()->prepare('INSERT INTO addresses (user_id, label, address_line, latitude, longitude) VALUES (?, ?, ?, ?, ?)')->execute([$user['id'], $data['label'], $data['address_line'], $data['latitude'], $data['longitude']]);
        json_response(['ok' => true], 201);
    }
}

if ($path === '/notifications/subscribe' && $method === 'POST') {
    $user = current_user(true, 'customer');
    require_fields($data, ['endpoint', 'keys']);
    if (!isset($data['keys']['p256dh'], $data['keys']['auth'])) {
        json_response(['error' => 'Invalid push subscription'], 422);
    }
    $stmt = db()->prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)');
    $stmt->execute([$user['id'], $data['endpoint'], $data['keys']['p256dh'], $data['keys']['auth']]);
    json_response(['ok' => true], 201);
}

if (str_starts_with($path, '/delivery')) {
    $deliveryBoy = current_user(true, 'delivery_boy');
    if ($path === '/delivery/orders' && $method === 'GET') {
        $sql = "SELECT o.*, COALESCE(u.name, o.guest_name, 'Guest Customer') AS customer_name, COALESCE(u.phone, o.guest_phone, '') AS customer_phone,
            COALESCE(items.items_summary, '') AS items_summary,
            dl.latitude AS driver_latitude, dl.longitude AS driver_longitude, dl.accuracy AS driver_accuracy, dl.recorded_at AS driver_recorded_at
            FROM orders o
            LEFT JOIN users u ON u.id=o.user_id
            LEFT JOIN (
                SELECT order_id, GROUP_CONCAT(CONCAT(name_snapshot, ' x ', quantity, IF(free_quantity > 0, CONCAT(' + ', free_quantity, ' free'), '')) ORDER BY id SEPARATOR ', ') AS items_summary
                FROM order_items
                GROUP BY order_id
            ) items ON items.order_id=o.id
            LEFT JOIN delivery_locations dl ON dl.order_id=o.id
            WHERE o.delivery_boy_id=? AND o.order_type='delivery' AND o.status NOT IN ('delivered','cancelled')
            ORDER BY o.created_at DESC";
        $stmt = db()->prepare($sql);
        $stmt->execute([$deliveryBoy['id']]);
        json_response(['orders' => $stmt->fetchAll()]);
    }
    if (preg_match('#^/delivery/orders/(\d+)/start$#', $path, $m) && $method === 'POST') {
        $stmt = db()->prepare("SELECT * FROM orders WHERE id=? AND delivery_boy_id=? AND order_type='delivery' LIMIT 1");
        $stmt->execute([(int)$m[1], $deliveryBoy['id']]);
        $order = $stmt->fetch();
        if (!$order) json_response(['error' => 'Assigned delivery order not found'], 404);
        if (!in_array($order['status'], ['ready','picked_up'], true)) json_response(['error' => 'Order is not ready for delivery'], 422);
        $previous = $order['status'];
        db()->prepare("UPDATE orders SET status='out_for_delivery', delivery_started_at=COALESCE(delivery_started_at, NOW()) WHERE id=?")->execute([$order['id']]);
        db()->prepare('INSERT INTO order_status_history (order_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)')->execute([$order['id'], $previous, 'out_for_delivery', $deliveryBoy['id']]);
        queue_order_notifications((int)$order['id'], 'Order ' . $order['order_number'] . ' is out for delivery.');
        json_response(['ok' => true]);
    }
    if (preg_match('#^/delivery/orders/(\d+)/location$#', $path, $m) && $method === 'POST') {
        require_fields($data, ['latitude', 'longitude']);
        if (!valid_coordinates($data['latitude'], $data['longitude'])) json_response(['error' => 'Invalid GPS coordinates'], 422);
        $accuracy = isset($data['accuracy']) && valid_decimal($data['accuracy']) ? max(0, (float)$data['accuracy']) : null;
        $stmt = db()->prepare("SELECT * FROM orders WHERE id=? AND delivery_boy_id=? AND status='out_for_delivery' LIMIT 1");
        $stmt->execute([(int)$m[1], $deliveryBoy['id']]);
        $order = $stmt->fetch();
        if (!$order) json_response(['error' => 'Order is not active for this delivery boy'], 403);
        $sql = 'INSERT INTO delivery_locations (order_id, delivery_boy_id, latitude, longitude, accuracy, recorded_at) VALUES (?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE delivery_boy_id=VALUES(delivery_boy_id), latitude=VALUES(latitude), longitude=VALUES(longitude), accuracy=VALUES(accuracy), recorded_at=VALUES(recorded_at)';
        db()->prepare($sql)->execute([$order['id'], $deliveryBoy['id'], (float)$data['latitude'], (float)$data['longitude'], $accuracy]);
        json_response(['ok' => true, 'recorded_at' => date('Y-m-d H:i:s')]);
    }
    if (preg_match('#^/delivery/orders/(\d+)/delivered$#', $path, $m) && $method === 'POST') {
        $stmt = db()->prepare("SELECT * FROM orders WHERE id=? AND delivery_boy_id=? AND status='out_for_delivery' LIMIT 1");
        $stmt->execute([(int)$m[1], $deliveryBoy['id']]);
        $order = $stmt->fetch();
        if (!$order) json_response(['error' => 'Active delivery order not found'], 404);
        db()->prepare("UPDATE orders SET status='delivered', delivered_at=NOW() WHERE id=?")->execute([$order['id']]);
        db()->prepare('INSERT INTO order_status_history (order_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)')->execute([$order['id'], 'out_for_delivery', 'delivered', $deliveryBoy['id']]);
        queue_order_notifications((int)$order['id'], 'Order ' . $order['order_number'] . ' has been delivered.');
        json_response(['ok' => true]);
    }
}

if (str_starts_with($path, '/admin')) {
    $admin = current_user(true, 'admin');
    if ($path === '/admin/dashboard' && $method === 'GET') {
        $stats = [
            'total_orders' => (int)db()->query('SELECT COUNT(*) FROM orders')->fetchColumn(),
            'pending_orders' => (int)db()->query("SELECT COUNT(*) FROM orders WHERE status IN ('received','accepted','preparing','ready','out_for_delivery') OR (order_type='delivery' AND status='picked_up')")->fetchColumn(),
            'completed_orders' => (int)db()->query("SELECT COUNT(*) FROM orders WHERE status='delivered' OR (order_type='takeaway' AND status='picked_up')")->fetchColumn(),
            'revenue' => (float)db()->query("SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE payment_status IN ('Paid','Partially Paid')")->fetchColumn(),
            'pending_payments' => (float)db()->query("SELECT COALESCE(SUM(remaining_amount),0) FROM orders WHERE remaining_amount > 0")->fetchColumn(),
            'low_stock_products' => (int)db()->query('SELECT COUNT(*) FROM menu_items WHERE stock <= low_stock_threshold')->fetchColumn(),
        ];
        json_response(['stats' => $stats]);
    }
    if ($path === '/admin/delivery-boys' && $method === 'GET') {
        $boys = db()->query("SELECT id, name, phone, email, role, is_active, created_at, updated_at FROM users WHERE role='delivery_boy' ORDER BY name")->fetchAll();
        json_response(['delivery_boys' => $boys]);
    }
    if ($path === '/admin/delivery-boys' && $method === 'POST') {
        require_fields($data, ['name', 'phone', 'email', 'password']);
        if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) json_response(['error' => 'Invalid email'], 422);
        if (strlen((string)$data['password']) < 8) json_response(['error' => 'Password must be at least 8 characters'], 422);
        $isActive = isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1;
        $stmt = db()->prepare("INSERT INTO users (name, phone, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 'delivery_boy', ?)");
        try {
            $stmt->execute([trim((string)$data['name']), trim((string)$data['phone']), strtolower(trim((string)$data['email'])), password_hash((string)$data['password'], PASSWORD_DEFAULT), $isActive]);
        } catch (PDOException $e) {
            json_response(['error' => 'A user with this email already exists'], 422);
        }
        $id = (int)db()->lastInsertId();
        $fresh = db()->prepare("SELECT id, name, phone, email, role, is_active FROM users WHERE id=? AND role='delivery_boy'");
        $fresh->execute([$id]);
        json_response(['delivery_boy' => $fresh->fetch()], 201);
    }
    if (preg_match('#^/admin/delivery-boys/(\d+)$#', $path, $m) && $method === 'PUT') {
        $stmt = db()->prepare("SELECT * FROM users WHERE id=? AND role='delivery_boy' LIMIT 1");
        $stmt->execute([(int)$m[1]]);
        $boy = $stmt->fetch();
        if (!$boy) json_response(['error' => 'Delivery boy not found'], 404);
        $name = trim((string)($data['name'] ?? $boy['name']));
        $phone = trim((string)($data['phone'] ?? $boy['phone']));
        $email = strtolower(trim((string)($data['email'] ?? $boy['email'])));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_response(['error' => 'Invalid email'], 422);
        $isActive = array_key_exists('is_active', $data) ? (int)(bool)$data['is_active'] : (int)$boy['is_active'];
        if (isset($data['password']) && trim((string)$data['password']) !== '') {
            if (strlen((string)$data['password']) < 8) json_response(['error' => 'Password must be at least 8 characters'], 422);
            $update = db()->prepare("UPDATE users SET name=?, phone=?, email=?, password_hash=?, is_active=? WHERE id=? AND role='delivery_boy'");
            $update->execute([$name, $phone, $email, password_hash((string)$data['password'], PASSWORD_DEFAULT), $isActive, $boy['id']]);
        } else {
            $update = db()->prepare("UPDATE users SET name=?, phone=?, email=?, is_active=? WHERE id=? AND role='delivery_boy'");
            $update->execute([$name, $phone, $email, $isActive, $boy['id']]);
        }
        $fresh = db()->prepare("SELECT id, name, phone, email, role, is_active FROM users WHERE id=? AND role='delivery_boy'");
        $fresh->execute([$boy['id']]);
        json_response(['delivery_boy' => $fresh->fetch()]);
    }
    if ($path === '/admin/product-image' && $method === 'POST') {
        if (empty($_FILES['image']) || !is_array($_FILES['image'])) {
            json_response(['error' => 'Product image is required'], 422);
        }
        $imagePath = uploaded_product_image_path($_FILES['image'], (string)($_POST['name'] ?? 'product'));
        json_response(['image_url' => $imagePath, 'url' => rtrim(env('APP_URL', ''), '/') . '/' . $imagePath], 201);
    }
    $resources = [
        'categories' => ['table' => 'categories', 'fields' => ['name','slug','description','sort_order','is_active']],
        'products' => ['table' => 'menu_items', 'fields' => ['category_id','name','slug','description','price','stock','low_stock_threshold','image_url','is_active']],
        'coupons' => ['table' => 'coupons', 'fields' => ['code','discount_type','discount_value','min_order_value','max_discount','starts_at','expires_at','overall_usage_limit','per_customer_limit','is_active']],
        'offers' => ['table' => 'offers', 'fields' => ['name','scope','scope_id','buy_qty','get_qty','starts_at','expires_at','is_active']],
        'delivery-slabs' => ['table' => 'delivery_slabs', 'fields' => ['min_km','max_km','charge','is_active']],
    ];
    foreach ($resources as $name => $meta) {
        if ($path === '/admin/' . $name && $method === 'GET') {
            json_response(['items' => db()->query('SELECT * FROM ' . $meta['table'] . ' ORDER BY id DESC')->fetchAll()]);
        }
        if ($path === '/admin/' . $name && $method === 'POST') {
            $payload = array_intersect_key($data, array_flip($meta['fields']));
            if (isset($payload['name']) && empty($payload['slug']) && in_array('slug', $meta['fields'], true)) $payload['slug'] = slugify($payload['name']);
            if (isset($payload['code'])) $payload['code'] = strtoupper($payload['code']);
            if (!$payload) json_response(['error' => 'No valid fields supplied'], 422);
            validate_admin_resource($name, $payload);
            $cols = array_keys($payload);
            $sql = 'INSERT INTO ' . $meta['table'] . ' (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
            db()->prepare($sql)->execute(array_values($payload));
            json_response(['ok' => true, 'id' => db()->lastInsertId()], 201);
        }
        if (preg_match('#^/admin/' . preg_quote($name, '#') . '/(\d+)$#', $path, $m)) {
            if ($method === 'PUT') {
                $payload = array_intersect_key($data, array_flip($meta['fields']));
                if (isset($payload['name']) && empty($payload['slug']) && in_array('slug', $meta['fields'], true)) $payload['slug'] = slugify($payload['name']);
                if (isset($payload['code'])) $payload['code'] = strtoupper($payload['code']);
                if (!$payload) json_response(['error' => 'No valid fields supplied'], 422);
                validate_admin_resource($name, $payload);
                $previousImage = null;
                if ($name === 'products' && array_key_exists('image_url', $payload)) {
                    $previousStmt = db()->prepare('SELECT image_url FROM menu_items WHERE id=? LIMIT 1');
                    $previousStmt->execute([(int)$m[1]]);
                    $previousImage = $previousStmt->fetchColumn() ?: null;
                }
                $sets = implode(',', array_map(fn($c) => "$c=?", array_keys($payload)));
                db()->prepare('UPDATE ' . $meta['table'] . " SET $sets WHERE id=?")->execute([...array_values($payload), (int)$m[1]]);
                if ($name === 'products' && array_key_exists('image_url', $payload) && $previousImage && $previousImage !== ($payload['image_url'] ?? '')) {
                    delete_local_upload($previousImage);
                }
                json_response(['ok' => true]);
            }
            if ($method === 'DELETE') {
                $previousImage = null;
                if ($name === 'products') {
                    $previousStmt = db()->prepare('SELECT image_url FROM menu_items WHERE id=? LIMIT 1');
                    $previousStmt->execute([(int)$m[1]]);
                    $previousImage = $previousStmt->fetchColumn() ?: null;
                }
                db()->prepare('DELETE FROM ' . $meta['table'] . ' WHERE id=?')->execute([(int)$m[1]]);
                if ($name === 'products') {
                    delete_local_upload($previousImage);
                }
                json_response(['ok' => true]);
            }
        }
    }
    if ($path === '/admin/orders' && $method === 'GET') {
        $sql = "SELECT o.*, COALESCE(u.name, o.guest_name, 'Guest Customer') AS customer_name, COALESCE(u.phone, o.guest_phone, '') AS customer_phone, dboy.name AS delivery_boy_name, dboy.phone AS delivery_boy_phone,
            COALESCE(items.items_summary, '') AS items_summary, COALESCE(items.items_count, 0) AS items_count,
            dl.latitude AS driver_latitude, dl.longitude AS driver_longitude, dl.accuracy AS driver_accuracy, dl.recorded_at AS driver_recorded_at
            FROM orders o
            LEFT JOIN users u ON u.id=o.user_id
            LEFT JOIN users dboy ON dboy.id=o.delivery_boy_id
            LEFT JOIN (
                SELECT order_id, GROUP_CONCAT(CONCAT(name_snapshot, ' x ', quantity, IF(free_quantity > 0, CONCAT(' + ', free_quantity, ' free'), '')) ORDER BY id SEPARATOR ', ') AS items_summary,
                    SUM(quantity + free_quantity) AS items_count
                FROM order_items
                GROUP BY order_id
            ) items ON items.order_id=o.id
            LEFT JOIN delivery_locations dl ON dl.order_id=o.id
            ORDER BY o.created_at DESC
            LIMIT 200";
        json_response(['orders' => db()->query($sql)->fetchAll(), 'statuses' => order_statuses()]);
    }
    if (preg_match('#^/admin/orders/(\d+)/tracking$#', $path, $m) && $method === 'GET') {
        $order = order_with_customer((int)$m[1]);
        if (!$order) json_response(['error' => 'Order not found'], 404);
        json_response(order_tracking_payload($order));
    }
    if (preg_match('#^/admin/orders/(\d+)/invoice$#', $path, $m) && $method === 'GET') {
        $order = order_with_customer((int)$m[1]);
        if (!$order) json_response(['error' => 'Order not found'], 404);
        send_pdf_response($order);
    }
    if (preg_match('#^/admin/orders/(\d+)/email-invoice$#', $path, $m) && $method === 'POST') {
        $order = order_with_customer((int)$m[1]);
        if (!$order) json_response(['error' => 'Order not found'], 404);
        json_response(['email' => send_invoice_email($order, true)]);
    }
    if ($path === '/admin/payments' && $method === 'GET') {
        $sql = 'SELECT p.id, p.order_id, o.order_number, p.razorpay_order_id, p.razorpay_payment_id, p.amount, p.status, p.method, p.created_at FROM payments p JOIN orders o ON o.id=p.order_id ORDER BY p.created_at DESC LIMIT 200';
        json_response(['payments' => db()->query($sql)->fetchAll()]);
    }
    if (preg_match('#^/admin/orders/(\d+)$#', $path, $m) && $method === 'PUT') {
        $stmt = db()->prepare('SELECT * FROM orders WHERE id=?');
        $stmt->execute([(int)$m[1]]);
        $order = $stmt->fetch();
        if (!$order) json_response(['error' => 'Order not found'], 404);
        $status = $data['status'] ?? $order['status'];
        if (!in_array($status, order_statuses(), true)) json_response(['error' => 'Invalid order status'], 422);
        if ($status !== $order['status'] && !in_array($status, valid_next_statuses($order['status'], $order['order_type']), true)) {
            json_response(['error' => 'Invalid status transition from ' . status_label($order['status']) . ' to ' . status_label($status)], 422);
        }
        $paymentStatus = $data['payment_status'] ?? $order['payment_status'];
        $allowedPaymentStatuses = ['Pending','Partially Paid','Paid','Failed','Refunded','COD'];
        if (!in_array($paymentStatus, $allowedPaymentStatuses, true)) json_response(['error' => 'Invalid payment status'], 422);
        $preparationMinutes = $data['preparation_minutes'] ?? $order['preparation_minutes'];
        $acceptedAt = $order['accepted_at'];
        $estimatedReadyAt = $order['estimated_ready_at'];
        if ($status === 'accepted') {
            if (!is_numeric($preparationMinutes) || (int)$preparationMinutes < 1 || (int)$preparationMinutes > 240) {
                json_response(['error' => 'Preparation minutes must be between 1 and 240'], 422);
            }
            $preparationMinutes = (int)$preparationMinutes;
            $acceptedAt = $acceptedAt ?: date('Y-m-d H:i:s');
            $estimatedReadyAt = (new DateTimeImmutable($acceptedAt))->modify('+' . $preparationMinutes . ' minutes')->format('Y-m-d H:i:s');
        }
        $deliveryBoyId = array_key_exists('delivery_boy_id', $data) ? ($data['delivery_boy_id'] === '' || $data['delivery_boy_id'] === null ? null : (int)$data['delivery_boy_id']) : $order['delivery_boy_id'];
        if ($deliveryBoyId !== null) {
            if ($order['order_type'] !== 'delivery') json_response(['error' => 'Delivery boy can only be assigned to delivery orders'], 422);
            if (in_array($order['status'], ['out_for_delivery','delivered','cancelled'], true) && (int)$order['delivery_boy_id'] !== (int)$deliveryBoyId) {
                json_response(['error' => 'Delivery boy cannot be reassigned after delivery starts'], 422);
            }
            $boy = db()->prepare("SELECT id FROM users WHERE id=? AND role='delivery_boy' AND is_active=1 LIMIT 1");
            $boy->execute([$deliveryBoyId]);
            if (!$boy->fetch()) json_response(['error' => 'Delivery boy not found'], 422);
        }
        db()->prepare('UPDATE orders SET status=?, payment_status=?, delivery_boy_id=?, accepted_at=?, estimated_ready_at=?, preparation_minutes=? WHERE id=?')->execute([$status, $paymentStatus, $deliveryBoyId, $acceptedAt, $estimatedReadyAt, $preparationMinutes, $order['id']]);
        if ($status !== $order['status']) {
            db()->prepare('INSERT INTO order_status_history (order_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)')->execute([$order['id'], $order['status'], $status, $admin['id']]);
            queue_order_notifications((int)$order['id'], 'Order ' . $order['order_number'] . ' status changed to ' . status_label($status));
        }
        $fresh = db()->prepare('SELECT * FROM orders WHERE id=?');
        $fresh->execute([$order['id']]);
        json_response(['ok' => true, 'order' => $fresh->fetch()]);
    }
    if ($path === '/admin/settings') {
        if ($method === 'GET') json_response(['settings' => settings()]);
        if ($method === 'PUT') json_response(['settings' => upsert_setting_table('settings', $data)]);
    }
    if ($path === '/admin/theme') {
        if ($method === 'GET') json_response(['theme' => theme()]);
        if ($method === 'PUT') json_response(['theme' => upsert_setting_table('theme_settings', $data)]);
        if ($method === 'DELETE') {
            db()->exec('DELETE FROM theme_settings');
            $schema = file_get_contents(dirname(__DIR__) . '/schema.sql');
            preg_match_all('/INSERT INTO theme_settings .*?;/s', $schema, $matches);
            foreach ($matches[0] as $sql) db()->exec($sql);
            json_response(['theme' => theme()]);
        }
    }
    if ($path === '/admin/notifications' && $method === 'GET') {
        json_response(['notifications' => db()->query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200')->fetchAll()]);
    }
}

json_response(['error' => 'Not found', 'path' => $path], 404);
