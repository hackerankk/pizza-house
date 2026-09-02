<?php
declare(strict_types=1);

function load_env_file(string $path): void {
    if (!is_file($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$key, $value] = explode('=', $line, 2);
        $value = trim($value);
        if (strlen($value) >= 2 && (($value[0] === '"' && $value[strlen($value) - 1] === '"') || ($value[0] === "'" && $value[strlen($value) - 1] === "'"))) {
            $value = stripcslashes(substr($value, 1, -1));
        }
        putenv(trim($key) . '=' . $value);
    }
}

function env_value(string $key, string $default = ''): string {
    $value = getenv($key);
    return $value === false ? $default : $value;
}

load_env_file(__DIR__ . '/../.env');

$dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', env_value('DB_HOST', '127.0.0.1'), env_value('DB_PORT', '3306'), env_value('DB_NAME', 'pizza_house'));
try {
    $pdo = new PDO($dsn, env_value('DB_USER', 'root'), env_value('DB_PASS', ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (Throwable $e) {
    fwrite(STDERR, 'Database connection failed: ' . $e->getMessage() . PHP_EOL);
    fwrite(STDERR, 'Create/import the MySQL database and update backend/.env, then rerun this check.' . PHP_EOL);
    exit(1);
}

$required = [
    'users',
    'auth_tokens',
    'categories',
    'menu_items',
    'menu_item_variants',
    'menu_option_groups',
    'menu_item_options',
    'addresses',
    'coupons',
    'coupon_redemptions',
    'offers',
    'delivery_slabs',
    'settings',
    'theme_settings',
    'orders',
    'order_items',
    'payments',
    'notifications',
    'push_subscriptions',
    'order_status_history',
];

$missing = [];
foreach ($required as $table) {
    $stmt = $pdo->prepare('SHOW TABLES LIKE ?');
    $stmt->execute([$table]);
    if (!$stmt->fetchColumn()) {
        $missing[] = $table;
    }
}

if ($missing) {
    fwrite(STDERR, 'Missing tables: ' . implode(', ', $missing) . PHP_EOL);
    exit(1);
}

$requiredColumns = [
    'orders' => ['order_type', 'delivery_address', 'latitude', 'longitude', 'distance_km', 'payment_mode', 'paid_amount', 'remaining_amount'],
    'order_items' => ['variant_id', 'variant_snapshot', 'options_snapshot'],
];

$missingColumns = [];
foreach ($requiredColumns as $table => $columns) {
    foreach ($columns as $column) {
        $stmt = $pdo->prepare('SHOW COLUMNS FROM ' . $table . ' LIKE ?');
        $stmt->execute([$column]);
        if (!$stmt->fetchColumn()) {
            $missingColumns[] = $table . '.' . $column;
        }
    }
}

if ($missingColumns) {
    fwrite(STDERR, 'Missing columns: ' . implode(', ', $missingColumns) . PHP_EOL);
    fwrite(STDERR, 'Run the latest schema import or migration files, then rerun this check.' . PHP_EOL);
    exit(1);
}

echo "Database connection and schema check passed.\n";
