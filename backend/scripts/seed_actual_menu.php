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

function slugify(string $value): string {
    $slug = strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '-', $value), '-'));
    return $slug ?: bin2hex(random_bytes(4));
}

load_env_file(__DIR__ . '/../.env');

$pdo = new PDO(
    sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', env_value('DB_HOST', '127.0.0.1'), env_value('DB_PORT', '3306'), env_value('DB_NAME', 'pizza_house')),
    env_value('DB_USER', 'root'),
    env_value('DB_PASS', ''),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$pdo->exec("CREATE TABLE IF NOT EXISTS menu_item_variants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY menu_item_variant_unique (menu_item_id, name),
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$pdo->exec("CREATE TABLE IF NOT EXISTS menu_option_groups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$pdo->exec("CREATE TABLE IF NOT EXISTS menu_item_options (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  small_price DECIMAL(10,2) NULL,
  medium_price DECIMAL(10,2) NULL,
  large_price DECIMAL(10,2) NULL,
  fixed_price DECIMAL(10,2) NULL,
  applies_to ENUM('pizza','all') NOT NULL DEFAULT 'pizza',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES menu_option_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$columns = array_column($pdo->query('SHOW COLUMNS FROM order_items')->fetchAll(), 'Field');
if (!in_array('variant_id', $columns, true)) $pdo->exec('ALTER TABLE order_items ADD COLUMN variant_id BIGINT UNSIGNED NULL AFTER menu_item_id');
if (!in_array('variant_snapshot', $columns, true)) $pdo->exec('ALTER TABLE order_items ADD COLUMN variant_snapshot VARCHAR(80) NULL AFTER name_snapshot');
if (!in_array('options_snapshot', $columns, true)) $pdo->exec('ALTER TABLE order_items ADD COLUMN options_snapshot TEXT NULL AFTER variant_snapshot');

$menu = [
    ['Simply Veg', 10, ['S' => 149, 'M' => 259, 'L' => 349], ['Cheese N Corn','Sweet Juicy Corn','Real Mozzarella','Cheese Tomato','Cheese & Juicy Tomato','Cheese & Mushroom','Cheese & Grilled Mushroom']],
    ['Classic Veg', 20, ['S' => 179, 'M' => 319, 'L' => 459], ['Double Cheese Margherita','Fresh Veggie','381 Pasta Pizza','Green Veggie','Achari Do Pyaza','County Special']],
    ['Veg Special', 30, ['S' => 219, 'M' => 369, 'L' => 519], ['Farm House','Mexican Green Wave','Peppy Paneer','Veggie Paradise']],
    ['Different Sauce', 40, ['S' => 249, 'M' => 419, 'L' => 569], ['Paneer Makhani','Deluxe Veggie','Indi Tandoori Paneer','The Cheese Dominator','Veg Extravaganza']],
    ['Pizza Mania', 50, null, ['Paneer Special' => 119,'Veg Pan Loaded' => 149,'PM Veg Single Combo' => 309,'PM Veg Double Combo' => 369]],
    ['Dessert', 60, null, ['Hot Choco Lava Cake' => 70]],
    ['Veg Delicious Side', 70, null, ['French Fry (Salted)' => 70,'French Fry (Peri-Peri)' => 80,'Fiery French Fries' => 80,'Potato Cheese Shot' => 80,'Chilly Garlic Shot' => 85,'Cheese Corn Nuggets' => 100,'Taco Mexicana' => 140,'Zingy Parcel' => 90,'Veggie Fingers' => 99,'Spicy Cheese Pocket' => 140]],
    ['Delicious Pasta', 80, null, ['Red Sauce Pasta' => 119,'White Sauce Pasta' => 110,'Jalapeno Sauce Pasta' => 119,'Creamy Sauce Pasta' => 119,'Tandoor Sauce Pasta' => 129,'Mix Veg Pasta' => 139]],
    ['Bread Stick', 90, null, ['Garlic Bread With Dip' => 109,'Stuff Garlic Bread With Dip' => 140,'Onion Cheese Stuff Bread With Dip' => 140,'Paneer Tikka Stuff Bread With Dip' => 169,'Garlic Bread Combo With Dip' => 169,'Cheese Bite Hots Spicy' => 139]],
    ['Burger', 100, null, ['Aloo Patty Burger' => ['Normal' => 59, 'Premium' => 79], 'Veggie Burger' => ['Normal' => 79, 'Premium' => 99], 'Spicy Burger' => ['Normal' => 79, 'Premium' => 99], 'Tandoori Burger' => ['Normal' => 99, 'Premium' => 119], 'Classic Cheesy Burger' => 119]],
    ['Dip', 110, null, ['Hot Garlic Dip' => 25,'Cheese Dip' => 25,'Schezwan Dip' => 25,'Mint Mayo Dip' => 25,'Jalapeno Dip' => 25]],
    ['Meal Combo', 120, null, ['Combo for 1' => 249,'Combo for 2' => 479,'Combo for 4' => 649]],
    ['Cold Coffee', 130, null, ['Classic Cold Coffee' => 119,'Hazelnut Cold Coffee' => 129,'Irish Cold Coffee' => 129,'Caramel Cold Coffee' => 129]],
    ['Iced Tea', 140, null, ['Iced Tea Lemon' => 99,'Iced Tea Peach' => 99]],
    ['Beverages', 150, null, ['Mineral Water' => 0,'Pepsi' => 0,'Coke' => 0,'Dew' => 0,'7up' => 0]],
    ['Mocktails', 160, null, ['Virgin Mojito Mint' => 99,'Green Apple Mojito Mint' => 99,'Watermelon Mojito Mint' => 99,'Paan Mojito Mint' => 99,'Strawberry Mojito Mint' => 99,'Mango Mojito Mint' => 99,'Blackberry Mojito Mint' => 119,'Blue Lagoon' => 99]],
    ['Shakes', 170, null, ['Chocolate Coffee Frappe' => 119,'Berry Gummy Shake' => 119,'Kesar Mango Shake' => 119,'Pineapple Coconut Shake' => 119,'Paan Pina Shake' => 119,'Orange Paan Masti' => 119,'Kesar Mango Masti' => 119,'Paan & Pineapple Blast' => 119,'Bubblegum Berry Blast' => 119,'Caribbean Colada' => 119]],
];

$descriptions = [
    'combo-for-1' => 'Small Classic Veg + French Fries + Cold Drink 250ml',
    'combo-for-2' => 'Medium Classic Veg + Garlic Bread + Dip + 1 French Fries + Cold Drink 750ml',
    'combo-for-4' => 'Large Classic Veg + 2 Choco Lava + 2 French Fries',
];

function rename_slug_if_safe(PDO $pdo, string $table, string $oldSlug, string $newSlug, string $newName): void {
    $exists = $pdo->prepare("SELECT id FROM $table WHERE slug=? LIMIT 1");
    $exists->execute([$oldSlug]);
    $oldId = $exists->fetchColumn();
    if (!$oldId) return;
    $exists->execute([$newSlug]);
    if ($exists->fetchColumn()) return;
    $stmt = $pdo->prepare("UPDATE $table SET name=?, slug=? WHERE id=?");
    $stmt->execute([$newName, $newSlug, $oldId]);
}

$pdo->beginTransaction();
try {
    rename_slug_if_safe($pdo, 'categories', 'dips', 'dip', 'Dip');
    rename_slug_if_safe($pdo, 'menu_option_groups', 'pizza-toppings', 'pizza-topping', 'Pizza Topping');
    rename_slug_if_safe($pdo, 'menu_items', 'combo-for-1-small-classic-veg-french-fries-cold-drink-250ml', 'combo-for-1', 'Combo for 1');
    rename_slug_if_safe($pdo, 'menu_items', 'combo-for-2-medium-classic-veg-garlic-bread-dip-1-french-fries-cold-drink-750ml', 'combo-for-2', 'Combo for 2');
    rename_slug_if_safe($pdo, 'menu_items', 'combo-for-4-large-classic-veg-2-choco-lava-2-french-fries', 'combo-for-4', 'Combo for 4');
    rename_slug_if_safe($pdo, 'menu_items', 'classic', 'classic-cold-coffee', 'Classic Cold Coffee');
    rename_slug_if_safe($pdo, 'menu_items', 'hazelnut', 'hazelnut-cold-coffee', 'Hazelnut Cold Coffee');
    rename_slug_if_safe($pdo, 'menu_items', 'irish', 'irish-cold-coffee', 'Irish Cold Coffee');
    rename_slug_if_safe($pdo, 'menu_items', 'caramel', 'caramel-cold-coffee', 'Caramel Cold Coffee');
    rename_slug_if_safe($pdo, 'menu_items', 'lemon', 'iced-tea-lemon', 'Iced Tea Lemon');
    rename_slug_if_safe($pdo, 'menu_items', 'peach', 'iced-tea-peach', 'Iced Tea Peach');

    $pdo->exec("UPDATE menu_items SET is_active=0 WHERE slug IN ('margherita-pizza','farmhouse-pizza','garlic-bread')");
    $pdo->exec("UPDATE categories SET is_active=0 WHERE slug IN ('pizza','pizzas','sides','drinks')");

    $categoryStmt = $pdo->prepare('INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES (?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1');
    $productStmt = $pdo->prepare('INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active)');
    $variantStmt = $pdo->prepare('INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES (?, ?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1');

    foreach ($menu as [$category, $sort, $prices, $products]) {
        $categorySlug = slugify($category);
        $categoryStmt->execute([$category, $categorySlug, 'Imported from the restaurant menu PDF.', $sort]);
        $categoryId = (int)$pdo->query("SELECT id FROM categories WHERE slug=" . $pdo->quote($categorySlug))->fetchColumn();

        if ($prices) {
            foreach ($products as $name) {
                $slug = slugify($name);
                $productStmt->execute([$categoryId, $name, $slug, 'Available in S, M and L sizes.', min($prices), 100, '', 1]);
                $itemId = (int)$pdo->query("SELECT id FROM menu_items WHERE slug=" . $pdo->quote($slug))->fetchColumn();
                $variantStmt->execute([$itemId, 'S', $prices['S'], 1, 1]);
                $variantStmt->execute([$itemId, 'M', $prices['M'], 2, 0]);
                $variantStmt->execute([$itemId, 'L', $prices['L'], 3, 0]);
            }
            continue;
        }

        foreach ($products as $name => $price) {
            $slug = slugify((string)$name);
            if (is_array($price)) {
                $productStmt->execute([$categoryId, $name, $slug, 'Available in Normal and Premium variants.', min($price), 100, '', 1]);
                $itemId = (int)$pdo->query("SELECT id FROM menu_items WHERE slug=" . $pdo->quote($slug))->fetchColumn();
                $order = 1;
                foreach ($price as $variant => $variantPrice) {
                    $variantStmt->execute([$itemId, $variant, $variantPrice, $order, $order === 1 ? 1 : 0]);
                    $order++;
                }
            } else {
                $active = (float)$price > 0 ? 1 : 0;
                $description = $descriptions[$slug] ?? ((float)$price > 0 ? 'Imported from the restaurant menu PDF.' : 'MRP item from the restaurant menu PDF. Configure the exact sale price in Admin.');
                $productStmt->execute([$categoryId, $name, $slug, $description, (float)$price, 100, '', 1]);
                $itemId = (int)$pdo->query("SELECT id FROM menu_items WHERE slug=" . $pdo->quote($slug))->fetchColumn();
                $variantStmt->execute([$itemId, 'Regular', (float)$price, 1, 1]);
            }
        }
    }

    $groupStmt = $pdo->prepare('INSERT INTO menu_option_groups (name, slug, sort_order, is_active) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), sort_order=VALUES(sort_order), is_active=1');
    $optionStmt = $pdo->prepare('INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1');

    $groupStmt->execute(['Crust', 'crust', 1]);
    $crustGroupId = (int)$pdo->query("SELECT id FROM menu_option_groups WHERE slug='crust'")->fetchColumn();
    $optionStmt->execute([$crustGroupId, 'Cheese Burst', 'cheese-burst', 59, 89, 119, 'pizza']);
    $optionStmt->execute([$crustGroupId, 'Thin Crust', 'thin-crust', 29, 49, 89, 'pizza']);

    $groupStmt->execute(['Pizza Topping', 'pizza-topping', 2]);
    $toppingGroupId = (int)$pdo->query("SELECT id FROM menu_option_groups WHERE slug='pizza-topping'")->fetchColumn();
    $optionStmt->execute([$toppingGroupId, 'Extra Cheese', 'extra-cheese', 40, 60, 80, 'pizza']);
    foreach (['Onion','Capsicum','Tomato','Mushroom','Corn','Jalapeno','Red Pepper','Black Olive','Paneer'] as $topping) {
        $optionStmt->execute([$toppingGroupId, $topping, slugify($topping), 25, 35, 45, 'pizza']);
    }

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}

$counts = [
    'categories' => (int)$pdo->query('SELECT COUNT(*) FROM categories WHERE is_active=1')->fetchColumn(),
    'products' => (int)$pdo->query('SELECT COUNT(*) FROM menu_items')->fetchColumn(),
    'active_products' => (int)$pdo->query('SELECT COUNT(*) FROM menu_items WHERE is_active=1')->fetchColumn(),
    'variants' => (int)$pdo->query('SELECT COUNT(*) FROM menu_item_variants WHERE is_active=1')->fetchColumn(),
    'options' => (int)$pdo->query('SELECT COUNT(*) FROM menu_item_options WHERE is_active=1')->fetchColumn(),
];

echo json_encode($counts, JSON_PRETTY_PRINT) . PHP_EOL;
