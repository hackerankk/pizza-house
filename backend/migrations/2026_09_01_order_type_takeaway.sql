SET @order_type_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'order_type'
);

SET @add_order_type_sql = IF(
  @order_type_exists = 0,
  'ALTER TABLE orders ADD COLUMN order_type ENUM(''delivery'',''takeaway'') NOT NULL DEFAULT ''delivery'' AFTER user_id',
  'SELECT ''orders.order_type already exists'' AS migration_note'
);

PREPARE add_order_type_stmt FROM @add_order_type_sql;
EXECUTE add_order_type_stmt;
DEALLOCATE PREPARE add_order_type_stmt;

ALTER TABLE orders
  MODIFY delivery_address TEXT NULL,
  MODIFY latitude DECIMAL(10,7) NULL,
  MODIFY longitude DECIMAL(10,7) NULL,
  MODIFY distance_km DECIMAL(8,2) NULL;
