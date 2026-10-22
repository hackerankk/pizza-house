<?php
declare(strict_types=1);

/** Security headers also apply on early CORS preflight and error responses. */
function security_response_header_values(): array {
    $headers = [
        'X-Content-Type-Options' => 'nosniff',
        'X-Frame-Options' => 'DENY',
        'Referrer-Policy' => 'strict-origin-when-cross-origin',
        'Permissions-Policy' => 'camera=(), microphone=(), geolocation=(self), payment=()',
        'Content-Security-Policy' => "base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
        'Content-Security-Policy-Report-Only' => "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'",
    ];

    $configured = parse_url((string)env('APP_URL', ''));
    $host = strtolower((string)($configured['host'] ?? ''));
    $publicHttps = ($configured['scheme'] ?? '') === 'https'
        && $host !== '' && $host !== 'localhost' && !str_ends_with($host, '.localhost')
        && str_contains($host, '.') && !preg_match('/(?:^|\.)(?:test|invalid|example|local)$/D', $host)
        && !preg_match('/your[-.]|deploy-preview|preview/', $host)
        && !filter_var(trim($host, '[]'), FILTER_VALIDATE_IP)
        && empty($configured['user']) && empty($configured['pass']);
    $https = in_array(strtolower((string)($_SERVER['HTTPS'] ?? '')), ['on', '1'], true) || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
    // Forwarded headers are trusted only from explicitly configured proxy IPs.
    $trusted = array_filter(array_map('trim', explode(',', (string)env('RATE_LIMIT_TRUSTED_PROXIES', ''))));
    if (!$https && in_array((string)($_SERVER['REMOTE_ADDR'] ?? ''), $trusted, true)) {
        $https = strtolower(trim((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))) === 'https';
    }
    if (env('APP_ENV') === 'production' && $publicHttps && $https) {
        $headers['Strict-Transport-Security'] = 'max-age=31536000';
    }
    return $headers;
}

function security_response_headers(): void {
    foreach (security_response_header_values() as $name => $value) header($name . ': ' . $value);
    header_remove('X-Powered-By');
}
