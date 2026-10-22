<?php
declare(strict_types=1);

// No database, SMTP credentials or mail delivery is used by these tests.
function env(string $key, ?string $default = null): ?string {
    $value = getenv($key);
    return $value === false ? $default : $value;
}
require_once __DIR__ . '/../src/security_headers.php';
function prelaunch_check(bool $condition, string $label): void {
    if (!$condition) throw new RuntimeException($label);
    echo "PASS: $label\n";
}
$previousServer = $_SERVER;
$keys = ['APP_ENV', 'APP_URL', 'RATE_LIMIT_TRUSTED_PROXIES'];
$previousEnvironment = array_combine($keys, array_map('getenv', $keys));
try {
    putenv('APP_ENV=production');
    putenv('APP_URL=https://api.thepizzahouse.online');
    putenv('RATE_LIMIT_TRUSTED_PROXIES=');
    $_SERVER = ['HTTPS' => 'on', 'SERVER_PORT' => 443, 'REMOTE_ADDR' => '127.0.0.1'];
    $headers = security_response_header_values();
    prelaunch_check(($headers['Strict-Transport-Security'] ?? '') === 'max-age=31536000', 'Production HTTPS receives HSTS');
    prelaunch_check($headers['X-Content-Type-Options'] === 'nosniff' && $headers['X-Frame-Options'] === 'DENY', 'API blocks MIME sniffing and framing');
    prelaunch_check(str_contains($headers['Content-Security-Policy'], "frame-ancestors 'none'") && isset($headers['Content-Security-Policy-Report-Only']), 'API has enforced framing protection and report-only resource policy');
    $_SERVER = ['SERVER_PORT' => 80, 'REMOTE_ADDR' => '127.0.0.1', 'HTTP_X_FORWARDED_PROTO' => 'https'];
    prelaunch_check(!isset(security_response_header_values()['Strict-Transport-Security']), 'Untrusted forwarded protocol cannot enable HSTS');
    putenv('RATE_LIMIT_TRUSTED_PROXIES=127.0.0.1');
    prelaunch_check(isset(security_response_header_values()['Strict-Transport-Security']), 'Explicit trusted TLS proxy can enable HSTS');
    foreach (['http://api.thepizzahouse.online', 'https://localhost', 'https://127.0.0.1', 'https://api.example', 'https://api.test', 'https://api.local', 'https://preview.thepizzahouse.online'] as $origin) {
        putenv('APP_URL=' . $origin);
        prelaunch_check(!isset(security_response_header_values()['Strict-Transport-Security']), 'HSTS excludes non-public/non-HTTPS origin ' . $origin);
    }
    putenv('APP_URL=https://api.thepizzahouse.online');
    putenv('APP_ENV=local');
    prelaunch_check(!isset(security_response_header_values()['Strict-Transport-Security']), 'Local environment excludes HSTS');
} finally {
    $_SERVER = $previousServer;
    foreach ($previousEnvironment as $key => $value) putenv($value === false ? $key : "$key=$value");
}

// Give mail() an isolated test double without changing production transport.
$mailSource = file_get_contents(__DIR__ . '/../src/invoice_mail.php');
$mailSource = preg_replace('/^<\?php\s*declare\(strict_types=1\);/', '', $mailSource);
eval('namespace PrelaunchInvoiceMailFixture; use \\Throwable; use \\ErrorException; use \\RuntimeException;' . $mailSource);
eval('namespace PrelaunchInvoiceMailFixture;
    function mail(string $recipient, string $subject, string $body, string $headers): bool {
        if ($GLOBALS["fixture_mail_mode"] === "throw") throw new \\RuntimeException("private transport diagnostic");
        return $GLOBALS["fixture_mail_mode"] === "accept";
    }
    function security_log_exception(\\Throwable $error, string $context): string {
        $GLOBALS["fixture_mail_logs"][] = [$context, $error->getMessage()];
        return "fixture-reference";
    }
');
$GLOBALS['fixture_mail_logs'] = [];
foreach (['accept', 'reject', 'throw'] as $mode) {
    $GLOBALS['fixture_mail_mode'] = $mode;
    $result = \PrelaunchInvoiceMailFixture\invoice_mail_transport('fixture@example.test', 'Test', 'Test', 'From: fixture@example.test');
    $response = \PrelaunchInvoiceMailFixture\invoice_mail_result($result['accepted']);
    prelaunch_check($response['ok'] === ($mode === 'accept') && $response['delivery_confirmed'] === false, 'Mail ' . $mode . ' is reported accurately without claiming delivery');
    if ($mode !== 'accept') prelaunch_check($result['request_id'] === 'fixture-reference' && !str_contains(json_encode($response), 'private transport'), 'Mail ' . $mode . ' logs a reference and returns a generic error');
}
prelaunch_check(count($GLOBALS['fixture_mail_logs']) === 2, 'Rejected and exceptional transports both produce server diagnostics');
