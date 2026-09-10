# Hostinger public_html Backend Deployment

Use this layout when Hostinger points the website document root to `public_html`.

```text
domains/your-domain.com/
  .env
  schema.sql
  composer.json
  composer.lock
  vendor/
  scripts/
    check_database.php
    create_admin.php
    process_notifications.php
    seed_actual_menu.php
  migrations/
    2026_09_01_order_type_takeaway.sql
  public_html/
    .htaccess
    index.php
    uploads/
      .htaccess
      products/
      categories/
      promotions/
```

Only these files/folders go inside `public_html`:

```text
backend/public/.htaccess -> public_html/.htaccess
backend/public/index.php -> public_html/index.php
backend/public/uploads/.htaccess -> public_html/uploads/.htaccess
backend/public/uploads/products/ -> public_html/uploads/products/
backend/public/uploads/categories/ -> public_html/uploads/categories/
backend/public/uploads/promotions/ -> public_html/uploads/promotions/
```

Everything else stays outside `public_html`:

```text
backend/.env -> domains/your-domain.com/.env
backend/schema.sql -> domains/your-domain.com/schema.sql
backend/composer.json -> domains/your-domain.com/composer.json
backend/composer.lock -> domains/your-domain.com/composer.lock
backend/vendor/ -> domains/your-domain.com/vendor/
backend/scripts/ -> domains/your-domain.com/scripts/
backend/migrations/ -> domains/your-domain.com/migrations/
```

Do not upload `.env.example`, `.env.production.example`, SQL imports, scripts, migrations, Composer files, or `vendor` into `public_html`.

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
DB_HOST=srv1829.hstgr.io
DB_PORT=3306
DB_NAME=u759431161_pizzaa
DB_USER=u759431161_pizzaa
DB_PASS=your-hostinger-database-password
```

After uploading, verify:

```text
https://your-api-domain.com/health
https://your-api-domain.com/health/db
https://your-api-domain.com/menu
```

`/health` should return JSON with `ok: true`. `/health/db` and `/menu` require correct Hostinger MySQL values in `.env`.
