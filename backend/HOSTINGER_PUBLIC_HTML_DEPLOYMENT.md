# Hostinger public_html Backend Deployment

Use this layout when Hostinger points the website document root to `public_html`.

```text
domains/your-domain.com/
  .env
  schema.sql
  composer.json
  composer.lock
  vendor/
  src/
    security.php
    security_headers.php
    uploads.php
    invoice_mail.php
    staff_pos.php
    staff_bogo.php
  storage/
    uploads/
  scripts/
    check_database.php
    create_admin.php
    process_notifications.php
    seed_actual_menu.php
  migrations/
    2026_09_01_order_type_takeaway.sql
    2026_10_20_request_security.sql
  public_html/
    .htaccess
    .user.ini
    index.php
    uploads/
      .htaccess
      products/
      categories/
      promotions/
      notifications/
```

Only these files/folders go inside `public_html`:

```text
backend/public/.htaccess -> public_html/.htaccess
backend/public/.user.ini -> public_html/.user.ini
backend/public/index.php -> public_html/index.php
backend/public/uploads/.htaccess -> public_html/uploads/.htaccess
backend/public/uploads/products/ -> public_html/uploads/products/
backend/public/uploads/categories/ -> public_html/uploads/categories/
backend/public/uploads/promotions/ -> public_html/uploads/promotions/
backend/public/uploads/notifications/ -> public_html/uploads/notifications/
```

Everything else stays outside `public_html`:

```text
backend/.env -> domains/your-domain.com/.env
backend/schema.sql -> domains/your-domain.com/schema.sql
backend/composer.json -> domains/your-domain.com/composer.json
backend/composer.lock -> domains/your-domain.com/composer.lock
backend/vendor/ -> domains/your-domain.com/vendor/
backend/src/ -> domains/your-domain.com/src/
backend/scripts/ -> domains/your-domain.com/scripts/
backend/migrations/ -> domains/your-domain.com/migrations/
```

Do not upload `.env.example`, `.env.production.example`, SQL imports, scripts, migrations, Composer files, `src`, `storage`, or `vendor` into `public_html`. The API requires `src/` alongside `public_html`; uploading only `index.php` will fail.

New uploads are stored in `domains/your-domain.com/storage/uploads/` and served through the API with fixed media types and a sandbox policy. Keep this directory outside `public_html` and writable by the PHP user. The default path works with the layout above; set `UPLOAD_STORAGE_PATH` only when using another absolute path outside the document root. Preserve existing media and its upload-directory `.htaccess` files when updating. PHP must provide GD with JPEG, PNG and WebP support, Fileinfo and PDO MySQL.

`default.php` is Hostinger's placeholder file. Remove it or replace it with `index.php`; it is not needed after this API is deployed.

For this project, the production `.env` must be next to `public_html`, not inside it:

```text
domains/your-domain.com/
  .env
  public_html/
    index.php
```

The backend reads that file with:

```php
load_env(dirname(__DIR__) . '/.env');
```

When `index.php` is inside `public_html`, `dirname(__DIR__)` is the parent folder of `public_html`.

Required Hostinger MySQL values:

```text
APP_ENV=production
APP_URL=https://your-api-domain.com
FRONTEND_URL=https://your-frontend-domain.com
DB_HOST=your-hostinger-mysql-host
DB_PORT=3306
DB_NAME=your-hostinger-database-name
DB_USER=your-hostinger-database-user
DB_PASS=your-hostinger-database-password
```

Use the actual HTTPS API and frontend origins. Configure a private random `RATE_LIMIT_SECRET` of at least 32 characters and retain the configurable limits in `.env.production.example`. Leave `RATE_LIMIT_TRUSTED_PROXIES` empty for direct hosting; set only the exact IPs of reverse proxies you control. Never trust arbitrary forwarded headers.

Before switching the application to the updated code, back up the database and apply `backend/migrations/2026_10_20_request_security.sql` to existing installations using Hostinger's database console or an authorized migration process. It creates the shared rate-limit counter table without modifying existing application rows. Fresh installations using the current `schema.sql` already include this table. Apply any earlier required migrations in order; do not reimport the full schema over an existing database.

Invoice email uses PHP's hosting `mail()` transport. Set `MAIL_FROM_EMAIL` to an actual sender authorized by your hosting account and configure the host's mail transport and sender-domain SPF/DKIM records; review DMARC alignment. `SMTP_FROM_EMAIL` is an existing fallback sender variable, not an SMTP connection setting. No SMTP client or SMTP credentials are configured by this application. Without a valid sender and working transport, invoice email is unavailable. A transport acceptance is not a delivery receipt; test real delivery with an authorized recipient before launch.

After uploading, verify:

```text
https://your-api-domain.com/health
https://your-api-domain.com/health/db
https://your-api-domain.com/menu
```

`/health` should return JSON with `ok: true`. `/health/db` and `/menu` require correct Hostinger MySQL values in `.env`.

Inspect actual HTTPS responses for HSTS, `nosniff`, framing protection, referrer and permissions policies. Test a new media upload and its public `/uploads/...` URL: it must be served by PHP from private storage with the correct media type and sandbox CSP. Confirm Hostinger honors `.htaccess` and `.user.ini`; do not expose configuration files or diagnostic scripts publicly.

## Verified deployment: 22 October 2026

The live API was synchronized with the frontend after Hostinger's custom files/database backup at 09:19. Both request-security and staff-POS additive migrations were applied to the existing production database. Existing config.php credentials, accounts, orders and media were retained.

For future updates:
1. Commit/push reviewed frontend changes and confirm the frontend hosting build succeeds.
2. Back up Hostinger files and the database actually configured in config.php.
3. Apply new additive migrations only. For this release both migrations/2026_10_20_request_security.sql and migrations/2026_10_21_staff_pos.sql are required. Never import schema.sql over an existing database.
4. Copy all six backend/src files to src beside public_html. Preserve private .env and config.php; never upload local credentials.
5. Copy backend/public/index.php to public_html last, plus the reviewed .htaccess/.user.ini and upload protections. Preserve existing media files. GitHub pushes alone do not deploy this PHP API.
6. Check /health and /menu, Staff login, Medium-to-Medium and Medium-to-Small free choices, delivery address entry, and Admin Toppings / Add-Ons.

The new .env contains production origins and a server-only random rate-limit key; it is not committed. Upload protection uses LiteSpeed-compatible handler removal and executable-file denial. The earlier default-handler/negative-allowlist configuration blocked valid existing media on this host; the deployed replacement returns HTTP 200 for an existing PNG.

Verified: PHP lint; 149 BOGO assertions; staff POS and request-security regressions; live health 200; menu 72 products/19 categories; unauthenticated staff-policy request 401; existing Staff/Admin sessions; both free-size choices preserve the paid total; toppings load. No test order or payment was submitted. BOGO-management permission remains Admin-controlled and was not granted automatically. Missing original product photos remain unavailable; frontend default images are used. External email/payment credentials were not invented or altered.