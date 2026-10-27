<?php
declare(strict_types=1);

function order_is_completed(array $order): bool {
    return ($order['status'] ?? '') === 'delivered'
        || (($order['status'] ?? '') === 'picked_up' && in_array($order['order_type'] ?? '', ['takeaway', 'dine_in'], true));
}
function order_is_terminal(array $order): bool {
    return ($order['status'] ?? '') === 'cancelled' || order_is_completed($order);
}
function order_can_edit(array $order): bool {
    return !order_is_terminal($order) && ($order['status'] ?? '') !== 'out_for_delivery';
}
