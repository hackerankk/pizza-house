<?php
declare(strict_types=1);

function load_env_file(string $path): void {
    if (!is_file($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$key, $value] = explode('=', $line, 2);
        putenv(trim($key) . '=' . parse_env_value(trim($value)));
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

function env_value(string $key, string $default = ''): string {
    $value = getenv($key);
    return $value === false ? $default : $value;
}

load_env_file(__DIR__ . '/../.env');

$autoload = __DIR__ . '/../vendor/autoload.php';
if (is_file($autoload)) {
    require $autoload;
}

$dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', env_value('DB_HOST', '127.0.0.1'), env_value('DB_PORT', '3306'), env_value('DB_NAME', 'pizza_house'));
$pdo = new PDO($dsn, env_value('DB_USER', 'root'), env_value('DB_PASS', ''), [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

$rows = $pdo->query("SELECT * FROM notifications WHERE status='queued' ORDER BY id LIMIT 25")->fetchAll();
$token = env_value('WHATSAPP_TOKEN');
$phoneId = env_value('WHATSAPP_PHONE_NUMBER_ID');

foreach ($rows as $row) {
    $status = 'failed';
    $responsePayload = ['error' => 'Unsupported channel or missing credentials'];
    if ($row['channel'] === 'whatsapp' && $token && $phoneId) {
        $body = json_encode([
            'messaging_product' => 'whatsapp',
            'to' => $row['recipient'],
            'type' => 'text',
            'text' => ['body' => $row['message']],
        ]);
        $ch = curl_init("https://graph.facebook.com/v20.0/{$phoneId}/messages");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $token,
            ],
        ]);
        $response = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $status = $code >= 200 && $code < 300 ? 'sent' : 'failed';
        $responsePayload = ['status_code' => $code, 'body' => json_decode((string)$response, true) ?: $response];
    } elseif ($row['channel'] === 'web_push' && class_exists('\\Minishlink\\WebPush\\WebPush')) {
        $subscriptionRow = $pdo->prepare('SELECT * FROM push_subscriptions WHERE endpoint=? LIMIT 1');
        $subscriptionRow->execute([$row['recipient']]);
        $sub = $subscriptionRow->fetch();
        if ($sub && env_value('VAPID_PUBLIC_KEY') && env_value('VAPID_PRIVATE_KEY')) {
            $auth = [
                'VAPID' => [
                    'subject' => env_value('VAPID_SUBJECT', 'mailto:owner@example.com'),
                    'publicKey' => env_value('VAPID_PUBLIC_KEY'),
                    'privateKey' => env_value('VAPID_PRIVATE_KEY'),
                ],
            ];
            $webPush = new \Minishlink\WebPush\WebPush($auth);
            $subscription = \Minishlink\WebPush\Subscription::create([
                'endpoint' => $sub['endpoint'],
                'keys' => ['p256dh' => $sub['p256dh'], 'auth' => $sub['auth']],
            ]);
            $report = $webPush->sendOneNotification($subscription, json_encode([
                'title' => 'The Pizza House',
                'body' => $row['message'],
                'url' => '/',
            ]));
            $status = $report->isSuccess() ? 'sent' : 'failed';
            $responsePayload = ['reason' => $report->getReason()];
        }
    }
    $stmt = $pdo->prepare('UPDATE notifications SET status=?, provider_response=? WHERE id=?');
    $stmt->execute([$status, json_encode($responsePayload), $row['id']]);
}

echo 'Processed ' . count($rows) . " queued notifications\n";
