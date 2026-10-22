-- Shared atomic counters; hashed identities only. No existing application data changes.
CREATE TABLE IF NOT EXISTS request_rate_limits (
  bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  window_started BIGINT UNSIGNED NOT NULL,
  failures INT UNSIGNED NOT NULL DEFAULT 0,
  last_failure BIGINT UNSIGNED NOT NULL DEFAULT 0,
  next_allowed BIGINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at BIGINT UNSIGNED NOT NULL,
  INDEX idx_rate_limits_expiry (expires_at)
) ENGINE=InnoDB;
