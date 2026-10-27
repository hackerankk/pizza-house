<?php
declare(strict_types=1);

function product_type_metadata(array $product): array {
    if (!isset($product['category_name']) && !isset($product['category_slug']) && !empty($product['category_id']) && function_exists('db')) {
        static $categories = null;
        if ($categories === null) {
            $categories = [];
            foreach (db()->query('SELECT id,name,slug FROM categories')->fetchAll() as $category) $categories[(int)$category['id']] = $category;
        }
        $category = $categories[(int)$product['category_id']] ?? [];
        $product['category_name'] = $category['name'] ?? '';
        $product['category_slug'] = $category['slug'] ?? '';
    }
    return $product;
}
function product_is_pizza(array $product): bool {
    $product = product_type_metadata($product);
    $category = trim(strtolower((string)($product['category_slug'] ?? $product['category_name'] ?? '')));
    $category = trim((string)preg_replace('/[^a-z0-9]+/', '-', $category), '-');
    if (in_array($category, ['pizza','pizzas','simply-veg','classic-veg','veg-special','different-sauce','premium-pizza','pizza-mania'], true)) return true;
    if (preg_match('/(^|-)(burger|burgers|beverages|drinks|coffee|tea|shakes|mocktails|dessert|desserts|ice-cream|momos|dip|fries|bread|pasta|combo|combos)(-|$)/', $category)) return false;
    return (bool)preg_match('/(^|[^a-z])pizzas?([^a-z]|$)/i', ($product['name'] ?? '') . ' ' . ($product['category_name'] ?? '') . ' ' . $category);
}
