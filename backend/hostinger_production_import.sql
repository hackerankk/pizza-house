-- Hostinger production import for The Pizza House
-- Safe import: no DROP, TRUNCATE, orders, payments, auth tokens, customer data, or secrets.
-- Import this into the selected Hostinger database with phpMyAdmin.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=1;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer','admin','delivery_boy') NOT NULL DEFAULT 'customer',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role_active (role, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  password_hash_snapshot CHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_tokens_user_expires (user_id, expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_refresh_tokens (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  description TEXT NULL,
  image_url VARCHAR(500) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_categories_active_sort (is_active, sort_order, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menu_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  description TEXT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 5,
  image_url VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_menu_items_active_category (is_active, category_id, name),
  INDEX idx_menu_items_stock (stock),
  FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menu_item_variants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_variants_item_active (menu_item_id, is_active, sort_order),
  UNIQUE KEY menu_item_variant_unique (menu_item_id, name),
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menu_option_groups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menu_item_options (
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
  INDEX idx_options_group_active (group_id, is_active),
  FOREIGN KEY (group_id) REFERENCES menu_option_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS addresses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(80) NOT NULL DEFAULT 'Home',
  address_line TEXT NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS coupons (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  discount_type ENUM('flat','percent') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  min_order_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_discount DECIMAL(10,2) NULL,
  starts_at DATETIME NULL,
  expires_at DATETIME NULL,
  overall_usage_limit INT NULL,
  per_customer_limit INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_coupons_active_code_dates (code, is_active, starts_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coupon_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  order_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_coupon_redemptions_coupon_user (coupon_id, user_id),
  INDEX idx_coupon_redemptions_order (order_id),
  FOREIGN KEY (coupon_id) REFERENCES coupons(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS offers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  scope ENUM('item','category') NOT NULL,
  scope_id BIGINT UNSIGNED NOT NULL,
  buy_qty INT NOT NULL,
  get_qty INT NOT NULL,
  starts_at DATETIME NULL,
  expires_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_offers_active_scope_dates (is_active, scope, scope_id, starts_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS delivery_slabs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  min_km DECIMAL(8,2) NOT NULL,
  max_km DECIMAL(8,2) NOT NULL,
  charge DECIMAL(10,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_delivery_slabs_active_range (is_active, min_km, max_km),
  UNIQUE KEY delivery_range_unique (min_km, max_km)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS promotional_banners (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  subtitle TEXT NULL,
  image_url VARCHAR(500) NOT NULL,
  button_text VARCHAR(80) NULL,
  destination_type ENUM('none','product','category','offer','custom_url') NOT NULL DEFAULT 'none',
  destination_value VARCHAR(500) NULL,
  display_order INT NOT NULL DEFAULT 0,
  start_at DATETIME NULL,
  end_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_promotional_banners_active (is_active, display_order),
  INDEX idx_promotional_banners_dates (start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS promotional_marquee (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message TEXT NOT NULL,
  link VARCHAR(500) NULL,
  display_order INT NOT NULL DEFAULT 0,
  start_at DATETIME NULL,
  end_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_promotional_marquee_active (is_active, display_order),
  INDEX idx_promotional_marquee_dates (start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS promotional_popups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NULL,
  image_url VARCHAR(500) NULL,
  offer_text VARCHAR(160) NULL,
  button_text VARCHAR(80) NULL,
  destination_type ENUM('none','product','category','offer','custom_url') NOT NULL DEFAULT 'none',
  destination_value VARCHAR(500) NULL,
  display_frequency ENUM('session','daily','every_visit') NOT NULL DEFAULT 'session',
  display_order INT NOT NULL DEFAULT 0,
  start_at DATETIME NULL,
  end_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_promotional_popups_active (is_active, display_order),
  INDEX idx_promotional_popups_dates (start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS theme_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(40) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NULL,
  guest_name VARCHAR(120) NULL,
  guest_phone VARCHAR(30) NULL,
  guest_email VARCHAR(180) NULL,
  order_type ENUM('delivery','takeaway') NOT NULL DEFAULT 'delivery',
  status ENUM('received','accepted','preparing','ready','picked_up','out_for_delivery','delivered','cancelled') NOT NULL DEFAULT 'received',
  subtotal DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  coupon_id BIGINT UNSIGNED NULL,
  delivery_boy_id BIGINT UNSIGNED NULL,
  delivery_address TEXT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  distance_km DECIMAL(8,2) NULL,
  payment_mode ENUM('full','partial','cod') NOT NULL,
  payment_status ENUM('Pending','Partially Paid','Paid','Failed','Refunded','COD') NOT NULL DEFAULT 'Pending',
  paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  remaining_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  razorpay_order_id VARCHAR(120) NULL UNIQUE,
  razorpay_payment_id VARCHAR(120) NULL UNIQUE,
  idempotency_key VARCHAR(120) NOT NULL UNIQUE,
  accepted_at DATETIME NULL,
  estimated_ready_at DATETIME NULL,
  preparation_minutes INT UNSIGNED NULL,
  delivery_started_at DATETIME NULL,
  delivered_at DATETIME NULL,
  guest_access_token_hash CHAR(64) NULL,
  guest_access_expires_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_guest_token (guest_access_token_hash),
  INDEX idx_orders_user_created (user_id, created_at),
  INDEX idx_orders_status_created (status, created_at),
  INDEX idx_orders_payment_status (payment_status),
  INDEX idx_orders_delivery_boy_status (delivery_boy_id, status),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (delivery_boy_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (coupon_id) REFERENCES coupons(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NULL,
  name_snapshot VARCHAR(160) NOT NULL,
  variant_snapshot VARCHAR(80) NULL,
  options_snapshot TEXT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL,
  free_quantity INT NOT NULL DEFAULT 0,
  line_total DECIMAL(10,2) NOT NULL,
  INDEX idx_order_items_order (order_id, id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
  FOREIGN KEY (variant_id) REFERENCES menu_item_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  razorpay_order_id VARCHAR(120) NULL,
  razorpay_payment_id VARCHAR(120) NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('created','verified','failed','refunded') NOT NULL DEFAULT 'created',
  method VARCHAR(60) NULL,
  raw_payload JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payments_order_status (order_id, status),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NULL,
  channel ENUM('whatsapp','web_push','email') NOT NULL,
  recipient VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued',
  provider_response JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_status_created (status, created_at),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_email_logs (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS delivery_locations (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_push_subscriptions_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  old_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_status_history_order_created (order_id, created_at),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO settings (setting_key, setting_value) VALUES
('restaurant_name','The Pizza House'),
('restaurant_address','Update restaurant address in admin settings'),
('restaurant_phone',''),
('restaurant_email',''),
('restaurant_latitude','12.9715987'),
('restaurant_longitude','77.5945627'),
('currency','INR'),
('minimum_order','0'),
('partial_payment_enabled','1'),
('partial_payment_type','percent'),
('partial_payment_value','30'),
('cod_enabled','1'),
('full_payment_enabled','1'),
('customer_login_required','0'),
('razorpay_key_id',''),
('razorpay_key_secret',''),
('razorpay_mode','test'),
('razorpay_enabled','1'),
('google_maps_api_key',''),
('google_maps_enabled','1'),
('accept_orders','1'),
('force_close_orders','0'),
('customer_theme_enabled','1'),
('customer_dark_mode_enabled','1'),
('online_ordering_enabled','1'),
('delivery_enabled','1'),
('takeaway_enabled','1'),
('guest_checkout_enabled','1'),
('customer_login_enabled','1'),
('order_schedule','{"monday":{"enabled":"1","open":"11:00","close":"23:00"},"tuesday":{"enabled":"1","open":"11:00","close":"23:00"},"wednesday":{"enabled":"1","open":"11:00","close":"23:00"},"thursday":{"enabled":"1","open":"11:00","close":"23:00"},"friday":{"enabled":"1","open":"11:00","close":"23:00"},"saturday":{"enabled":"1","open":"11:00","close":"23:00"},"sunday":{"enabled":"1","open":"11:00","close":"23:00"}}'),
('customer_default_theme','system'),
('admin_theme_mode','system')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

INSERT INTO theme_settings (setting_key, setting_value) VALUES
('background_color','#fff8f0'),
('primary_color','#d62828'),
('secondary_color','#f77f00'),
('button_color','#d62828'),
('button_hover_color','#b51f1f'),
('button_text_color','#ffffff'),
('text_color','#1f2933'),
('card_color','#ffffff'),
('header_color','#ffffff'),
('footer_color','#2b2118'),
('border_color','#ead9c7'),
('accent_color','#2a9d8f'),
('font_family','Inter, Arial, sans-serif'),
('heading_font_size','32px'),
('body_font_size','16px'),
('button_font_size','15px'),
('navigation_font_size','15px'),
('product_font_size','18px'),
('button_border_radius','8px'),
('button_padding','10px 16px'),
('button_font_weight','700'),
('card_border_radius','8px'),
('logo_url',''),
('favicon_url','')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

INSERT INTO categories (name, slug, description, sort_order) VALUES
('Pizzas','pizzas','Freshly baked pizzas',1),
('Sides','sides','Snacks and sides',2),
('Drinks','drinks','Cold drinks and beverages',3)
ON DUPLICATE KEY UPDATE name = name;

INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url) VALUES
((SELECT id FROM categories WHERE slug='pizzas'),'Margherita Pizza','margherita-pizza','Classic cheese and tomato pizza',299,25,''),
((SELECT id FROM categories WHERE slug='pizzas'),'Farmhouse Pizza','farmhouse-pizza','Loaded with vegetables and mozzarella',449,18,''),
((SELECT id FROM categories WHERE slug='sides'),'Garlic Bread','garlic-bread','Toasted garlic bread with herbs',149,30,'')
ON DUPLICATE KEY UPDATE name = name;

INSERT INTO delivery_slabs (min_km, max_km, charge) VALUES
(0,3,30),
(3.01,6,50),
(6.01,10,80)
ON DUPLICATE KEY UPDATE charge = charge;

-- Actual restaurant menu seed from backend/scripts/seed_actual_menu.php
START TRANSACTION;
UPDATE menu_items SET is_active=0 WHERE slug IN ('margherita-pizza','farmhouse-pizza','garlic-bread');
UPDATE categories SET is_active=0 WHERE slug IN ('pizza','pizzas','sides','drinks');
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Simply Veg', 'simply-veg', 'Imported from the restaurant menu PDF.', 10, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Classic Veg', 'classic-veg', 'Imported from the restaurant menu PDF.', 20, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Veg Special', 'veg-special', 'Imported from the restaurant menu PDF.', 30, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Different Sauce', 'different-sauce', 'Imported from the restaurant menu PDF.', 40, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Pizza Mania', 'pizza-mania', 'Imported from the restaurant menu PDF.', 50, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Dessert', 'dessert', 'Imported from the restaurant menu PDF.', 60, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Veg Delicious Side', 'veg-delicious-side', 'Imported from the restaurant menu PDF.', 70, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Delicious Pasta', 'delicious-pasta', 'Imported from the restaurant menu PDF.', 80, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Bread Stick', 'bread-stick', 'Imported from the restaurant menu PDF.', 90, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Burger', 'burger', 'Imported from the restaurant menu PDF.', 100, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Dip', 'dip', 'Imported from the restaurant menu PDF.', 110, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Meal Combo', 'meal-combo', 'Imported from the restaurant menu PDF.', 120, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Cold Coffee', 'cold-coffee', 'Imported from the restaurant menu PDF.', 130, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Iced Tea', 'iced-tea', 'Imported from the restaurant menu PDF.', 140, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Beverages', 'beverages', 'Imported from the restaurant menu PDF.', 150, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Mocktails', 'mocktails', 'Imported from the restaurant menu PDF.', 160, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES ('Shakes', 'shakes', 'Imported from the restaurant menu PDF.', 170, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='simply-veg' LIMIT 1), 'Cheese N Corn', 'cheese-n-corn', 'Available in S, M and L sizes.', 149.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-n-corn' LIMIT 1), 'S', 149.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-n-corn' LIMIT 1), 'M', 259.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-n-corn' LIMIT 1), 'L', 349.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='simply-veg' LIMIT 1), 'Sweet Juicy Corn', 'sweet-juicy-corn', 'Available in S, M and L sizes.', 149.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='sweet-juicy-corn' LIMIT 1), 'S', 149.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='sweet-juicy-corn' LIMIT 1), 'M', 259.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='sweet-juicy-corn' LIMIT 1), 'L', 349.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='simply-veg' LIMIT 1), 'Real Mozzarella', 'real-mozzarella', 'Available in S, M and L sizes.', 149.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='real-mozzarella' LIMIT 1), 'S', 149.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='real-mozzarella' LIMIT 1), 'M', 259.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='real-mozzarella' LIMIT 1), 'L', 349.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='simply-veg' LIMIT 1), 'Cheese Tomato', 'cheese-tomato', 'Available in S, M and L sizes.', 149.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-tomato' LIMIT 1), 'S', 149.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-tomato' LIMIT 1), 'M', 259.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-tomato' LIMIT 1), 'L', 349.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='simply-veg' LIMIT 1), 'Cheese & Juicy Tomato', 'cheese-juicy-tomato', 'Available in S, M and L sizes.', 149.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-juicy-tomato' LIMIT 1), 'S', 149.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-juicy-tomato' LIMIT 1), 'M', 259.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-juicy-tomato' LIMIT 1), 'L', 349.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='simply-veg' LIMIT 1), 'Cheese & Mushroom', 'cheese-mushroom', 'Available in S, M and L sizes.', 149.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-mushroom' LIMIT 1), 'S', 149.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-mushroom' LIMIT 1), 'M', 259.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-mushroom' LIMIT 1), 'L', 349.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='simply-veg' LIMIT 1), 'Cheese & Grilled Mushroom', 'cheese-grilled-mushroom', 'Available in S, M and L sizes.', 149.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-grilled-mushroom' LIMIT 1), 'S', 149.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-grilled-mushroom' LIMIT 1), 'M', 259.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-grilled-mushroom' LIMIT 1), 'L', 349.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='classic-veg' LIMIT 1), 'Double Cheese Margherita', 'double-cheese-margherita', 'Available in S, M and L sizes.', 179.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='double-cheese-margherita' LIMIT 1), 'S', 179.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='double-cheese-margherita' LIMIT 1), 'M', 319.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='double-cheese-margherita' LIMIT 1), 'L', 459.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='classic-veg' LIMIT 1), 'Fresh Veggie', 'fresh-veggie', 'Available in S, M and L sizes.', 179.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='fresh-veggie' LIMIT 1), 'S', 179.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='fresh-veggie' LIMIT 1), 'M', 319.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='fresh-veggie' LIMIT 1), 'L', 459.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='classic-veg' LIMIT 1), '381 Pasta Pizza', '381-pasta-pizza', 'Available in S, M and L sizes.', 179.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='381-pasta-pizza' LIMIT 1), 'S', 179.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='381-pasta-pizza' LIMIT 1), 'M', 319.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='381-pasta-pizza' LIMIT 1), 'L', 459.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='classic-veg' LIMIT 1), 'Green Veggie', 'green-veggie', 'Available in S, M and L sizes.', 179.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='green-veggie' LIMIT 1), 'S', 179.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='green-veggie' LIMIT 1), 'M', 319.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='green-veggie' LIMIT 1), 'L', 459.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='classic-veg' LIMIT 1), 'Achari Do Pyaza', 'achari-do-pyaza', 'Available in S, M and L sizes.', 179.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='achari-do-pyaza' LIMIT 1), 'S', 179.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='achari-do-pyaza' LIMIT 1), 'M', 319.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='achari-do-pyaza' LIMIT 1), 'L', 459.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='classic-veg' LIMIT 1), 'County Special', 'county-special', 'Available in S, M and L sizes.', 179.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='county-special' LIMIT 1), 'S', 179.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='county-special' LIMIT 1), 'M', 319.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='county-special' LIMIT 1), 'L', 459.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-special' LIMIT 1), 'Farm House', 'farm-house', 'Available in S, M and L sizes.', 219.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='farm-house' LIMIT 1), 'S', 219.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='farm-house' LIMIT 1), 'M', 369.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='farm-house' LIMIT 1), 'L', 519.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-special' LIMIT 1), 'Mexican Green Wave', 'mexican-green-wave', 'Available in S, M and L sizes.', 219.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='mexican-green-wave' LIMIT 1), 'S', 219.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='mexican-green-wave' LIMIT 1), 'M', 369.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='mexican-green-wave' LIMIT 1), 'L', 519.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-special' LIMIT 1), 'Peppy Paneer', 'peppy-paneer', 'Available in S, M and L sizes.', 219.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='peppy-paneer' LIMIT 1), 'S', 219.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='peppy-paneer' LIMIT 1), 'M', 369.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='peppy-paneer' LIMIT 1), 'L', 519.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-special' LIMIT 1), 'Veggie Paradise', 'veggie-paradise', 'Available in S, M and L sizes.', 219.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='veggie-paradise' LIMIT 1), 'S', 219.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='veggie-paradise' LIMIT 1), 'M', 369.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='veggie-paradise' LIMIT 1), 'L', 519.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='different-sauce' LIMIT 1), 'Paneer Makhani', 'paneer-makhani', 'Available in S, M and L sizes.', 249.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='paneer-makhani' LIMIT 1), 'S', 249.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='paneer-makhani' LIMIT 1), 'M', 419.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='paneer-makhani' LIMIT 1), 'L', 569.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='different-sauce' LIMIT 1), 'Deluxe Veggie', 'deluxe-veggie', 'Available in S, M and L sizes.', 249.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='deluxe-veggie' LIMIT 1), 'S', 249.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='deluxe-veggie' LIMIT 1), 'M', 419.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='deluxe-veggie' LIMIT 1), 'L', 569.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='different-sauce' LIMIT 1), 'Indi Tandoori Paneer', 'indi-tandoori-paneer', 'Available in S, M and L sizes.', 249.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='indi-tandoori-paneer' LIMIT 1), 'S', 249.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='indi-tandoori-paneer' LIMIT 1), 'M', 419.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='indi-tandoori-paneer' LIMIT 1), 'L', 569.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='different-sauce' LIMIT 1), 'The Cheese Dominator', 'the-cheese-dominator', 'Available in S, M and L sizes.', 249.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='the-cheese-dominator' LIMIT 1), 'S', 249.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='the-cheese-dominator' LIMIT 1), 'M', 419.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='the-cheese-dominator' LIMIT 1), 'L', 569.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='different-sauce' LIMIT 1), 'Veg Extravaganza', 'veg-extravaganza', 'Available in S, M and L sizes.', 249.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='veg-extravaganza' LIMIT 1), 'S', 249.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='veg-extravaganza' LIMIT 1), 'M', 419.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='veg-extravaganza' LIMIT 1), 'L', 569.00, 3, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='pizza-mania' LIMIT 1), 'Paneer Special', 'paneer-special', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='paneer-special' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='pizza-mania' LIMIT 1), 'Veg Pan Loaded', 'veg-pan-loaded', 'Imported from the restaurant menu PDF.', 149.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='veg-pan-loaded' LIMIT 1), 'Regular', 149.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='pizza-mania' LIMIT 1), 'PM Veg Single Combo', 'pm-veg-single-combo', 'Imported from the restaurant menu PDF.', 309.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='pm-veg-single-combo' LIMIT 1), 'Regular', 309.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='pizza-mania' LIMIT 1), 'PM Veg Double Combo', 'pm-veg-double-combo', 'Imported from the restaurant menu PDF.', 369.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='pm-veg-double-combo' LIMIT 1), 'Regular', 369.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='dessert' LIMIT 1), 'Hot Choco Lava Cake', 'hot-choco-lava-cake', 'Imported from the restaurant menu PDF.', 70.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='hot-choco-lava-cake' LIMIT 1), 'Regular', 70.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-delicious-side' LIMIT 1), 'French Fry (Salted)', 'french-fry-salted', 'Imported from the restaurant menu PDF.', 70.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='french-fry-salted' LIMIT 1), 'Regular', 70.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-delicious-side' LIMIT 1), 'French Fry (Peri-Peri)', 'french-fry-peri-peri', 'Imported from the restaurant menu PDF.', 80.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='french-fry-peri-peri' LIMIT 1), 'Regular', 80.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-delicious-side' LIMIT 1), 'Fiery French Fries', 'fiery-french-fries', 'Imported from the restaurant menu PDF.', 80.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='fiery-french-fries' LIMIT 1), 'Regular', 80.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-delicious-side' LIMIT 1), 'Potato Cheese Shot', 'potato-cheese-shot', 'Imported from the restaurant menu PDF.', 80.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='potato-cheese-shot' LIMIT 1), 'Regular', 80.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-delicious-side' LIMIT 1), 'Chilly Garlic Shot', 'chilly-garlic-shot', 'Imported from the restaurant menu PDF.', 85.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='chilly-garlic-shot' LIMIT 1), 'Regular', 85.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-delicious-side' LIMIT 1), 'Cheese Corn Nuggets', 'cheese-corn-nuggets', 'Imported from the restaurant menu PDF.', 100.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-corn-nuggets' LIMIT 1), 'Regular', 100.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-delicious-side' LIMIT 1), 'Taco Mexicana', 'taco-mexicana', 'Imported from the restaurant menu PDF.', 140.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='taco-mexicana' LIMIT 1), 'Regular', 140.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-delicious-side' LIMIT 1), 'Zingy Parcel', 'zingy-parcel', 'Imported from the restaurant menu PDF.', 90.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='zingy-parcel' LIMIT 1), 'Regular', 90.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-delicious-side' LIMIT 1), 'Veggie Fingers', 'veggie-fingers', 'Imported from the restaurant menu PDF.', 99.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='veggie-fingers' LIMIT 1), 'Regular', 99.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='veg-delicious-side' LIMIT 1), 'Spicy Cheese Pocket', 'spicy-cheese-pocket', 'Imported from the restaurant menu PDF.', 140.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='spicy-cheese-pocket' LIMIT 1), 'Regular', 140.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='delicious-pasta' LIMIT 1), 'Red Sauce Pasta', 'red-sauce-pasta', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='red-sauce-pasta' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='delicious-pasta' LIMIT 1), 'White Sauce Pasta', 'white-sauce-pasta', 'Imported from the restaurant menu PDF.', 110.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='white-sauce-pasta' LIMIT 1), 'Regular', 110.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='delicious-pasta' LIMIT 1), 'Jalapeno Sauce Pasta', 'jalapeno-sauce-pasta', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='jalapeno-sauce-pasta' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='delicious-pasta' LIMIT 1), 'Creamy Sauce Pasta', 'creamy-sauce-pasta', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='creamy-sauce-pasta' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='delicious-pasta' LIMIT 1), 'Tandoor Sauce Pasta', 'tandoor-sauce-pasta', 'Imported from the restaurant menu PDF.', 129.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='tandoor-sauce-pasta' LIMIT 1), 'Regular', 129.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='delicious-pasta' LIMIT 1), 'Mix Veg Pasta', 'mix-veg-pasta', 'Imported from the restaurant menu PDF.', 139.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='mix-veg-pasta' LIMIT 1), 'Regular', 139.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='bread-stick' LIMIT 1), 'Garlic Bread With Dip', 'garlic-bread-with-dip', 'Imported from the restaurant menu PDF.', 109.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='garlic-bread-with-dip' LIMIT 1), 'Regular', 109.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='bread-stick' LIMIT 1), 'Stuff Garlic Bread With Dip', 'stuff-garlic-bread-with-dip', 'Imported from the restaurant menu PDF.', 140.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='stuff-garlic-bread-with-dip' LIMIT 1), 'Regular', 140.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='bread-stick' LIMIT 1), 'Onion Cheese Stuff Bread With Dip', 'onion-cheese-stuff-bread-with-dip', 'Imported from the restaurant menu PDF.', 140.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='onion-cheese-stuff-bread-with-dip' LIMIT 1), 'Regular', 140.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='bread-stick' LIMIT 1), 'Paneer Tikka Stuff Bread With Dip', 'paneer-tikka-stuff-bread-with-dip', 'Imported from the restaurant menu PDF.', 169.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='paneer-tikka-stuff-bread-with-dip' LIMIT 1), 'Regular', 169.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='bread-stick' LIMIT 1), 'Garlic Bread Combo With Dip', 'garlic-bread-combo-with-dip', 'Imported from the restaurant menu PDF.', 169.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='garlic-bread-combo-with-dip' LIMIT 1), 'Regular', 169.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='bread-stick' LIMIT 1), 'Cheese Bite Hots Spicy', 'cheese-bite-hots-spicy', 'Imported from the restaurant menu PDF.', 139.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-bite-hots-spicy' LIMIT 1), 'Regular', 139.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='burger' LIMIT 1), 'Aloo Patty Burger', 'aloo-patty-burger', 'Available in Normal and Premium variants.', 59.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='aloo-patty-burger' LIMIT 1), 'Normal', 59.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='aloo-patty-burger' LIMIT 1), 'Premium', 79.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='burger' LIMIT 1), 'Veggie Burger', 'veggie-burger', 'Available in Normal and Premium variants.', 79.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='veggie-burger' LIMIT 1), 'Normal', 79.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='veggie-burger' LIMIT 1), 'Premium', 99.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='burger' LIMIT 1), 'Spicy Burger', 'spicy-burger', 'Available in Normal and Premium variants.', 79.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='spicy-burger' LIMIT 1), 'Normal', 79.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='spicy-burger' LIMIT 1), 'Premium', 99.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='burger' LIMIT 1), 'Tandoori Burger', 'tandoori-burger', 'Available in Normal and Premium variants.', 99.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='tandoori-burger' LIMIT 1), 'Normal', 99.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='tandoori-burger' LIMIT 1), 'Premium', 119.00, 2, 0, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='burger' LIMIT 1), 'Classic Cheesy Burger', 'classic-cheesy-burger', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='classic-cheesy-burger' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='dip' LIMIT 1), 'Hot Garlic Dip', 'hot-garlic-dip', 'Imported from the restaurant menu PDF.', 25.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='hot-garlic-dip' LIMIT 1), 'Regular', 25.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='dip' LIMIT 1), 'Cheese Dip', 'cheese-dip', 'Imported from the restaurant menu PDF.', 25.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='cheese-dip' LIMIT 1), 'Regular', 25.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='dip' LIMIT 1), 'Schezwan Dip', 'schezwan-dip', 'Imported from the restaurant menu PDF.', 25.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='schezwan-dip' LIMIT 1), 'Regular', 25.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='dip' LIMIT 1), 'Mint Mayo Dip', 'mint-mayo-dip', 'Imported from the restaurant menu PDF.', 25.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='mint-mayo-dip' LIMIT 1), 'Regular', 25.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='dip' LIMIT 1), 'Jalapeno Dip', 'jalapeno-dip', 'Imported from the restaurant menu PDF.', 25.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='jalapeno-dip' LIMIT 1), 'Regular', 25.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='meal-combo' LIMIT 1), 'Combo for 1', 'combo-for-1', 'Small Classic Veg + French Fries + Cold Drink 250ml', 249.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='combo-for-1' LIMIT 1), 'Regular', 249.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='meal-combo' LIMIT 1), 'Combo for 2', 'combo-for-2', 'Medium Classic Veg + Garlic Bread + Dip + 1 French Fries + Cold Drink 750ml', 479.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='combo-for-2' LIMIT 1), 'Regular', 479.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='meal-combo' LIMIT 1), 'Combo for 4', 'combo-for-4', 'Large Classic Veg + 2 Choco Lava + 2 French Fries', 649.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='combo-for-4' LIMIT 1), 'Regular', 649.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='cold-coffee' LIMIT 1), 'Classic Cold Coffee', 'classic-cold-coffee', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='classic-cold-coffee' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='cold-coffee' LIMIT 1), 'Hazelnut Cold Coffee', 'hazelnut-cold-coffee', 'Imported from the restaurant menu PDF.', 129.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='hazelnut-cold-coffee' LIMIT 1), 'Regular', 129.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='cold-coffee' LIMIT 1), 'Irish Cold Coffee', 'irish-cold-coffee', 'Imported from the restaurant menu PDF.', 129.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='irish-cold-coffee' LIMIT 1), 'Regular', 129.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='cold-coffee' LIMIT 1), 'Caramel Cold Coffee', 'caramel-cold-coffee', 'Imported from the restaurant menu PDF.', 129.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='caramel-cold-coffee' LIMIT 1), 'Regular', 129.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='iced-tea' LIMIT 1), 'Iced Tea Lemon', 'iced-tea-lemon', 'Imported from the restaurant menu PDF.', 99.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='iced-tea-lemon' LIMIT 1), 'Regular', 99.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='iced-tea' LIMIT 1), 'Iced Tea Peach', 'iced-tea-peach', 'Imported from the restaurant menu PDF.', 99.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='iced-tea-peach' LIMIT 1), 'Regular', 99.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='beverages' LIMIT 1), 'Mineral Water', 'mineral-water', 'MRP item from the restaurant menu PDF. Configure the exact sale price in Admin.', 0.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='mineral-water' LIMIT 1), 'Regular', 0.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='beverages' LIMIT 1), 'Pepsi', 'pepsi', 'MRP item from the restaurant menu PDF. Configure the exact sale price in Admin.', 0.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='pepsi' LIMIT 1), 'Regular', 0.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='beverages' LIMIT 1), 'Coke', 'coke', 'MRP item from the restaurant menu PDF. Configure the exact sale price in Admin.', 0.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='coke' LIMIT 1), 'Regular', 0.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='beverages' LIMIT 1), 'Dew', 'dew', 'MRP item from the restaurant menu PDF. Configure the exact sale price in Admin.', 0.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='dew' LIMIT 1), 'Regular', 0.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='beverages' LIMIT 1), '7up', '7up', 'MRP item from the restaurant menu PDF. Configure the exact sale price in Admin.', 0.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='7up' LIMIT 1), 'Regular', 0.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='mocktails' LIMIT 1), 'Virgin Mojito Mint', 'virgin-mojito-mint', 'Imported from the restaurant menu PDF.', 99.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='virgin-mojito-mint' LIMIT 1), 'Regular', 99.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='mocktails' LIMIT 1), 'Green Apple Mojito Mint', 'green-apple-mojito-mint', 'Imported from the restaurant menu PDF.', 99.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='green-apple-mojito-mint' LIMIT 1), 'Regular', 99.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='mocktails' LIMIT 1), 'Watermelon Mojito Mint', 'watermelon-mojito-mint', 'Imported from the restaurant menu PDF.', 99.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='watermelon-mojito-mint' LIMIT 1), 'Regular', 99.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='mocktails' LIMIT 1), 'Paan Mojito Mint', 'paan-mojito-mint', 'Imported from the restaurant menu PDF.', 99.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='paan-mojito-mint' LIMIT 1), 'Regular', 99.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='mocktails' LIMIT 1), 'Strawberry Mojito Mint', 'strawberry-mojito-mint', 'Imported from the restaurant menu PDF.', 99.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='strawberry-mojito-mint' LIMIT 1), 'Regular', 99.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='mocktails' LIMIT 1), 'Mango Mojito Mint', 'mango-mojito-mint', 'Imported from the restaurant menu PDF.', 99.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='mango-mojito-mint' LIMIT 1), 'Regular', 99.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='mocktails' LIMIT 1), 'Blackberry Mojito Mint', 'blackberry-mojito-mint', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='blackberry-mojito-mint' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='mocktails' LIMIT 1), 'Blue Lagoon', 'blue-lagoon', 'Imported from the restaurant menu PDF.', 99.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='blue-lagoon' LIMIT 1), 'Regular', 99.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='shakes' LIMIT 1), 'Chocolate Coffee Frappe', 'chocolate-coffee-frappe', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='chocolate-coffee-frappe' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='shakes' LIMIT 1), 'Berry Gummy Shake', 'berry-gummy-shake', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='berry-gummy-shake' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='shakes' LIMIT 1), 'Kesar Mango Shake', 'kesar-mango-shake', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='kesar-mango-shake' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='shakes' LIMIT 1), 'Pineapple Coconut Shake', 'pineapple-coconut-shake', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='pineapple-coconut-shake' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='shakes' LIMIT 1), 'Paan Pina Shake', 'paan-pina-shake', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='paan-pina-shake' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='shakes' LIMIT 1), 'Orange Paan Masti', 'orange-paan-masti', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='orange-paan-masti' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='shakes' LIMIT 1), 'Kesar Mango Masti', 'kesar-mango-masti', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='kesar-mango-masti' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='shakes' LIMIT 1), 'Paan & Pineapple Blast', 'paan-pineapple-blast', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='paan-pineapple-blast' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='shakes' LIMIT 1), 'Bubblegum Berry Blast', 'bubblegum-berry-blast', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='bubblegum-berry-blast' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_items (category_id, name, slug, description, price, stock, image_url, is_active) VALUES ((SELECT id FROM categories WHERE slug='shakes' LIMIT 1), 'Caribbean Colada', 'caribbean-colada', 'Imported from the restaurant menu PDF.', 119.00, 100, '', 1) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), name=VALUES(name), description=VALUES(description), price=VALUES(price), stock=GREATEST(stock, VALUES(stock)), is_active=VALUES(is_active);
INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_default, is_active) VALUES ((SELECT id FROM menu_items WHERE slug='caribbean-colada' LIMIT 1), 'Regular', 119.00, 1, 1, 1) ON DUPLICATE KEY UPDATE price=VALUES(price), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_active=1;
INSERT INTO menu_option_groups (name, slug, sort_order, is_active) VALUES ('Crust', 'crust', 1, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO menu_option_groups (name, slug, sort_order, is_active) VALUES ('Pizza Topping', 'pizza-topping', 2, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), sort_order=VALUES(sort_order), is_active=1;
INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES ((SELECT id FROM menu_option_groups WHERE slug='crust' LIMIT 1), 'Cheese Burst', 'cheese-burst', 59.00, 89.00, 119.00, NULL, 'pizza', 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1;
INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES ((SELECT id FROM menu_option_groups WHERE slug='crust' LIMIT 1), 'Thin Crust', 'thin-crust', 29.00, 49.00, 89.00, NULL, 'pizza', 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1;
INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES ((SELECT id FROM menu_option_groups WHERE slug='pizza-topping' LIMIT 1), 'Extra Cheese', 'extra-cheese', 40.00, 60.00, 80.00, NULL, 'pizza', 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1;
INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES ((SELECT id FROM menu_option_groups WHERE slug='pizza-topping' LIMIT 1), 'Onion', 'onion', 25.00, 35.00, 45.00, NULL, 'pizza', 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1;
INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES ((SELECT id FROM menu_option_groups WHERE slug='pizza-topping' LIMIT 1), 'Capsicum', 'capsicum', 25.00, 35.00, 45.00, NULL, 'pizza', 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1;
INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES ((SELECT id FROM menu_option_groups WHERE slug='pizza-topping' LIMIT 1), 'Tomato', 'tomato', 25.00, 35.00, 45.00, NULL, 'pizza', 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1;
INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES ((SELECT id FROM menu_option_groups WHERE slug='pizza-topping' LIMIT 1), 'Mushroom', 'mushroom', 25.00, 35.00, 45.00, NULL, 'pizza', 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1;
INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES ((SELECT id FROM menu_option_groups WHERE slug='pizza-topping' LIMIT 1), 'Corn', 'corn', 25.00, 35.00, 45.00, NULL, 'pizza', 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1;
INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES ((SELECT id FROM menu_option_groups WHERE slug='pizza-topping' LIMIT 1), 'Jalapeno', 'jalapeno', 25.00, 35.00, 45.00, NULL, 'pizza', 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1;
INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES ((SELECT id FROM menu_option_groups WHERE slug='pizza-topping' LIMIT 1), 'Red Pepper', 'red-pepper', 25.00, 35.00, 45.00, NULL, 'pizza', 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1;
INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES ((SELECT id FROM menu_option_groups WHERE slug='pizza-topping' LIMIT 1), 'Black Olive', 'black-olive', 25.00, 35.00, 45.00, NULL, 'pizza', 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1;
INSERT INTO menu_item_options (group_id, name, slug, small_price, medium_price, large_price, fixed_price, applies_to, is_active) VALUES ((SELECT id FROM menu_option_groups WHERE slug='pizza-topping' LIMIT 1), 'Paneer', 'paneer', 25.00, 35.00, 45.00, NULL, 'pizza', 1) ON DUPLICATE KEY UPDATE name=VALUES(name), small_price=VALUES(small_price), medium_price=VALUES(medium_price), large_price=VALUES(large_price), applies_to=VALUES(applies_to), is_active=1;
COMMIT;

-- Expected active seed counts after import: 17 active categories, 90 active menu items, 136 active variants, 12 active options.
