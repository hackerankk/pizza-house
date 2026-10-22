<?php
declare(strict_types=1);

function invoice_mail_transport(string $recipient, string $subject, string $body, string $headers): array {
    $reference = null;
    set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
        throw new ErrorException($message, 0, $severity, $file, $line);
    });
    try {
        $accepted = mail($recipient, $subject, $body, $headers);
    } catch (Throwable $error) {
        $accepted = false;
        $reference = security_log_exception($error, 'invoice mail transport');
    } finally {
        restore_error_handler();
    }
    if (!$accepted && $reference === null) $reference = security_log_exception(new RuntimeException('PHP mail() did not accept the invoice.'), 'invoice mail transport');
    return ['accepted' => $accepted, 'request_id' => $reference];
}

function invoice_mail_result(bool $accepted): array {
    return ['ok' => $accepted, 'status' => $accepted ? 'sent' : 'failed', 'delivery_confirmed' => false,
        'message' => $accepted ? 'Invoice email accepted for delivery.' : null,
        'error' => $accepted ? null : 'Invoice email could not be sent. Please try again later.'];
}
