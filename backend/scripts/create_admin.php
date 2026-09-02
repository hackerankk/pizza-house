<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit("CLI only\n");
}

function load_env_file(string $path): void {
    if (!is_file($path)) {
        return;
    }
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        putenv(trim($key) . '=' . trim($value));
    }
}

function env_value(string $key, string $default = ''): string {
    $value = getenv($key);
    return $value === false ? $default : $value;
}

load_env_file(__DIR__ . '/../.env');

$email = $argv[1] ?? null;
$password = $argv[2] ?? null;
$name = $argv[3] ?? 'Admin';

if (!$email || !$password) {
    exit("Usage: php backend/scripts/create_admin.php admin@example.com StrongPassword \"Admin Name\"\n");
}

$dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
    env_value('DB_HOST', '127.0.0.1'),
    env_value('DB_PORT', '3306'),
    env_value('DB_NAME', 'pizza_house')
);
$pdo = new PDO($dsn, env_value('DB_USER', 'root'), env_value('DB_PASS', ''), [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$stmt = $pdo->prepare("INSERT INTO users (name, phone, email, password_hash, role) VALUES (?, '', ?, ?, 'admin') ON DUPLICATE KEY UPDATE name=VALUES(name), password_hash=VALUES(password_hash), role='admin'");
$stmt->execute([$name, strtolower($email), password_hash($password, PASSWORD_DEFAULT)]);
echo "Admin user ready: {$email}\n";
