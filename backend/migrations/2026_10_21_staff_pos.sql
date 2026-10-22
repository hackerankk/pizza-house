-- Backward-compatible additions only. Existing orders/payments are not rewritten.
-- Run before deploying the PHP/frontend changes. No delivery charges or permissions are granted automatically.
CREATE TABLE IF NOT EXISTS staff_delivery_slabs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_order_amount DECIMAL(10,2) NULL,
  charge DECIMAL(10,2) NOT NULL,
  priority INT UNSIGNED NOT NULL DEFAULT 100,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_staff_delivery_active_amount (is_active,min_order_amount,max_order_amount,priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @staff_pos_sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='menu_item_options' AND COLUMN_NAME='category_ids')=0,'ALTER TABLE menu_item_options ADD COLUMN category_ids TEXT NULL','SELECT 1');
PREPARE staff_pos_stmt FROM @staff_pos_sql; EXECUTE staff_pos_stmt; DEALLOCATE PREPARE staff_pos_stmt;
SET @staff_pos_sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='menu_item_options' AND COLUMN_NAME='product_ids')=0,'ALTER TABLE menu_item_options ADD COLUMN product_ids TEXT NULL','SELECT 1');
PREPARE staff_pos_stmt FROM @staff_pos_sql; EXECUTE staff_pos_stmt; DEALLOCATE PREPARE staff_pos_stmt;
SET @staff_pos_sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='staff_delivery_slab_id')=0,'ALTER TABLE orders ADD COLUMN staff_delivery_slab_id BIGINT UNSIGNED NULL','SELECT 1');
PREPARE staff_pos_stmt FROM @staff_pos_sql; EXECUTE staff_pos_stmt; DEALLOCATE PREPARE staff_pos_stmt;
SET @staff_pos_sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='staff_delivery_snapshot')=0,'ALTER TABLE orders ADD COLUMN staff_delivery_snapshot TEXT NULL','SELECT 1');
PREPARE staff_pos_stmt FROM @staff_pos_sql; EXECUTE staff_pos_stmt; DEALLOCATE PREPARE staff_pos_stmt;

CREATE TABLE IF NOT EXISTS staff_order_adjustment_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  details LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_staff_adjustment_order (order_id,created_at),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
