# The Pizza House

Production-ready restaurant ordering website built from `Restaurant_Ordering_Website_Updated_Specification.docx`.

## Stack

- Frontend: Next.js / React, deployed on Vercel
- Backend: PHP 8.2+ with PDO, deployed on Hostinger
- Database: MySQL / MariaDB on Hostinger
- Payments: Razorpay
- Maps: Google Maps JavaScript API, with server-side Haversine delivery validation
- Notifications: WhatsApp Cloud API and Web Push

## Required Environment Variables

Backend values go in `backend/.env` on Hostinger. Use `backend/.env.production.example` as the template.

| Variable | Purpose |
|---|---|
| `APP_ENV` | Use `production` on Hostinger |
| `APP_URL` | Public PHP API URL, for example `https://api.your-domain.com` |
| `FRONTEND_URL` | Public Vercel URL allowed by CORS |
| `DB_HOST` | Hostinger MySQL hostname |
| `DB_PORT` | Usually `3306` |
| `DB_NAME` | Hostinger database name |
| `DB_USER` | Hostinger database user |
| `DB_PASS` | Hostinger database password |
| `JWT_SECRET` | Long random secret for auth token hardening |
| `RAZORPAY_KEY_ID` | Razorpay live or test key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay secret, backend only |
| `GOOGLE_MAPS_API_KEY` | Google Maps key for backend/admin reference |
| `WHATSAPP_TOKEN` | WhatsApp Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud API phone number ID |
| `OWNER_WHATSAPP_NUMBER` | Restaurant owner WhatsApp number with country code and no plus sign |
| `VAPID_PUBLIC_KEY` | Web Push public key |
| `VAPID_PRIVATE_KEY` | Web Push private key |
| `VAPID_SUBJECT` | Contact subject, for example `mailto:owner@your-domain.com` |

Frontend values go in Vercel or Netlify project environment variables. Use `frontend/.env.production.example` as the template.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_BASE` | Public PHP backend URL |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay public key ID |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps browser API key |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push public key |

Do not put `RAZORPAY_KEY_SECRET`, database credentials, WhatsApp token, or VAPID private key in any frontend `NEXT_PUBLIC_*` variable.

## Local Setup

1. Create a MySQL database.

```sql
CREATE DATABASE pizza_house CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Copy backend env and fill local DB values.

```bash
cp backend/.env.example backend/.env
```

3. Import schema and seed defaults.

```bash
mysql -u root -p pizza_house < backend/schema.sql
```

4. Seed the source-of-truth restaurant menu. This command is idempotent and can be rerun after import; it preserves orders/payments/users and deactivates only the old starter menu entries.

```bash
php backend/scripts/seed_actual_menu.php
```

5. Install backend dependencies.

```bash
cd backend
composer install
cd ..
```

6. Verify database/schema.

```bash
php backend/scripts/check_database.php
```

7. Create the first admin account.

```bash
php backend/scripts/create_admin.php admin@example.com StrongPassword "Admin"
```

8. Start the PHP API.

```bash
php -S localhost:8000 -t backend/public
```

9. Install and run the frontend.

```bash
cp frontend/.env.example frontend/.env.local
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Hostinger MySQL Deployment

1. In Hostinger hPanel, create a MySQL database and database user.
2. Assign the user to the database with full privileges.
3. Open phpMyAdmin for that database.
4. Import `backend/schema.sql`.
5. Run `php backend/scripts/seed_actual_menu.php` over SSH to load the restaurant's actual menu, pizza sizes, burger variants, crust options, and toppings. If SSH is unavailable, run it locally against the Hostinger database credentials after temporarily allowing your IP in Hostinger's remote MySQL settings.
6. Confirm these tables exist: `users`, `auth_tokens`, `categories`, `menu_items`, `menu_item_variants`, `menu_option_groups`, `menu_item_options`, `addresses`, `coupons`, `coupon_redemptions`, `offers`, `delivery_slabs`, `settings`, `theme_settings`, `orders`, `order_items`, `payments`, `notifications`, `push_subscriptions`, `order_status_history`.
7. For an existing database imported before takeaway support, run `backend/migrations/2026_09_01_order_type_takeaway.sql` once in phpMyAdmin.
8. Put the exact Hostinger DB hostname, DB name, DB user, and DB password into `backend/.env`.
9. Run `php backend/scripts/check_database.php` over SSH if available.

## PHP Backend Deployment On Hostinger

Preferred layout:

```text
home/
  your-user/
    pizza-backend/
      .env
      composer.json
      composer.lock
      schema.sql
      scripts/
      vendor/
      public/
        .htaccess
        index.php
```

1. Upload the full `backend` directory to a non-public directory such as `pizza-backend`.
2. Point a Hostinger subdomain such as `api.your-domain.com` to `pizza-backend/public`.
3. If Hostinger cannot point the document root there, upload only `backend/public` contents to the public API directory and keep `.env`, `vendor`, `scripts`, and `schema.sql` one level above `public`.
4. Make sure `backend/public/.htaccess` is uploaded. It routes `/menu`, `/orders`, `/admin/*`, and other pretty API paths to `index.php`.
5. Create `backend/.env` from `backend/.env.production.example`.
6. Install backend dependencies on Hostinger:

```bash
cd /path/to/pizza-backend
composer install --no-dev --optimize-autoloader
```

7. If Composer is not available on your Hostinger plan, upload the local `backend/vendor/` folder along with `composer.lock`.
8. Create the first admin user:

```bash
php scripts/create_admin.php admin@your-domain.com "StrongProductionPassword" "Admin"
```

9. Test the backend:

```bash
curl https://api.your-domain.com/health
curl https://api.your-domain.com/health/db
```

`/health` should return `ok: true`. `/health/db` should return `database: connected`.

10. Configure a Hostinger cron job for notifications:

```bash
php /path/to/pizza-backend/scripts/process_notifications.php
```

A 1-minute or 5-minute interval is reasonable.

## Vercel Frontend Deployment

1. Push or upload the project to a Git provider connected to Vercel.
2. Create a new Vercel project.
3. Set the Vercel root directory to `frontend`.
4. Install command: `npm install`.
5. Build command: `npm run build`.
6. Output directory: leave as Vercel default for Next.js.
7. Add all frontend environment variables from `frontend/.env.production.example`.
8. Set `NEXT_PUBLIC_API_BASE` to the Hostinger backend URL, for example `https://api.your-domain.com`.
9. Deploy.
10. After Vercel gives the production URL, update Hostinger `FRONTEND_URL` to that exact URL.

## Netlify Frontend Deployment

This repository includes `netlify.toml` for the monorepo layout. It tells Netlify to build the Next.js app from `frontend`.

1. Push or upload the project to a Git provider connected to Netlify.
2. Create a new Netlify site from that repository.
3. Netlify should read `netlify.toml` automatically. If entering settings manually, use:

```text
Base directory: frontend
Build command: npm run build
Publish directory: frontend/.next
Node version: 20
```

4. Keep the Netlify Next.js runtime plugin enabled from `netlify.toml`:

```text
@netlify/plugin-nextjs
```

This is required so Netlify serves App Router pages through the Next runtime instead of treating `.next` as a plain static folder.
5. Add all frontend environment variables from `frontend/.env.production.example`.
6. Set `NEXT_PUBLIC_API_BASE` to the public Hostinger PHP backend URL, for example `https://api.your-domain.com`.
7. Deploy the site.
8. After Netlify gives the production URL, update Hostinger `FRONTEND_URL` to that exact Netlify URL.

## Razorpay Setup

1. Create or open a Razorpay account.
2. Generate API keys in the Razorpay Dashboard.
3. Add the key ID to backend `.env` as `RAZORPAY_KEY_ID`.
4. Add the key ID to Vercel/Netlify as `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
5. Add the key secret only to backend `.env` as `RAZORPAY_KEY_SECRET`.
6. Do not expose `RAZORPAY_KEY_SECRET` in Vercel or browser code.
7. Test full payment and partial payment in Razorpay test mode first.
8. The backend verifies the Razorpay signature, remote payment status, Razorpay order ID, and amount before updating the order.

## Google Maps Setup

1. In Google Cloud Console, enable Maps JavaScript API, Places API, and Geocoding API.
2. Create a browser API key.
3. Restrict the key to the frontend domain, such as the Vercel or Netlify production domain.
4. Add it to Vercel/Netlify as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
5. Optionally add the same key to backend `.env` as `GOOGLE_MAPS_API_KEY` for operational reference.
6. The checkout location picker uses Maps JavaScript for the map, Places for address search, and Geocoding for reverse geocoding the selected pin.
7. Delivery charges are always verified server-side using restaurant coordinates and configured delivery slabs.

## WhatsApp Cloud API Setup

1. Create or open a Meta developer app with WhatsApp enabled.
2. Configure a WhatsApp Business phone number.
3. Copy the permanent access token into backend `.env` as `WHATSAPP_TOKEN`.
4. Copy the phone number ID into backend `.env` as `WHATSAPP_PHONE_NUMBER_ID`.
5. Set `OWNER_WHATSAPP_NUMBER` with country code and no plus sign, for example `919999999999`.
6. Run the Hostinger cron job for `scripts/process_notifications.php`.
7. Order placement and status changes create queued WhatsApp notifications.

## Web Push Setup

1. Generate a VAPID key pair.
2. Add public/private values to backend `.env` as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
3. Add the public key to Vercel/Netlify as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
4. Set `VAPID_SUBJECT` to a valid contact, for example `mailto:owner@your-domain.com`.
5. Run `composer install --no-dev --optimize-autoloader` on Hostinger so `minishlink/web-push` is available.
6. Run the notification cron job.

## Production Verification

Run before launch:

```bash
php -l backend/public/index.php
php -l backend/scripts/create_admin.php
php -l backend/scripts/check_database.php
php -l backend/scripts/process_notifications.php
cd backend && composer validate --strict && composer audit
cd ../frontend && npm audit --audit-level=high && npm run build
```

Then verify deployed endpoints:

```bash
curl https://api.your-domain.com/health
curl https://api.your-domain.com/health/db
```

Customer launch checks:

- Register and log in.
- Browse/search menu.
- Add products and change quantities.
- Proceed from cart to the dedicated `/checkout` page.
- Place delivery checkout orders with address, map/GPS coordinates, and delivery charge.
- Place takeaway checkout orders with full Razorpay payment only.
- Apply valid and invalid coupons.
- Confirm BOGO free quantities.
- Pin/use location and verify delivery charge.
- Place COD order.
- Place Razorpay full-payment order.
- Place Razorpay partial-payment order.
- Confirm takeaway plus partial payment is rejected server-side.
- Track order status.

Admin launch checks:

- Log in as admin.
- Create/edit/delete category.
- Create/edit/delete product and stock.
- Create/edit/delete coupon.
- Create/edit/delete BOGO offer.
- Create/edit/delete delivery slab.
- Update payment settings to percentage partial payment.
- Update payment settings to fixed partial payment.
- Update theme settings, save, refresh customer frontend, and confirm the theme persists.
- Update order status and confirm notification records are queued.

## Security Notes

- Server-side order creation recalculates item prices, BOGO offers, coupons, stock, order type, delivery distance, payable amount, paid amount, and remaining amount.
- Takeaway orders store `order_type='takeaway'`, do not require address/map fields, use zero delivery charge, and reject partial/COD submissions.
- Razorpay success is verified on the backend with signature, remote payment status, order ID, and amount checks.
- Online payments fail closed when Razorpay credentials are missing.
- Razorpay secret key is only read by PHP backend code.
- Order/payment creation uses idempotency keys and unique Razorpay IDs to reduce duplicate processing.
- Passwords are stored with `password_hash`.
- SQL access uses prepared statements for request-derived values.
- Theme and admin setting writes are validated server-side.

## Files To Deploy

Hostinger backend:

- Upload `backend/public/.htaccess`
- Upload `backend/public/index.php`
- Upload `backend/scripts/create_admin.php`
- Upload `backend/scripts/check_database.php`
- Upload `backend/scripts/process_notifications.php`
- Upload `backend/scripts/seed_actual_menu.php`
- Upload `backend/schema.sql`
- Upload `backend/migrations/2026_09_01_order_type_takeaway.sql` for existing databases that were imported before takeaway support.
- Upload `backend/composer.json`
- Upload `backend/composer.lock`
- Create `backend/.env` from `backend/.env.production.example`
- Upload `backend/vendor/` only if Composer cannot run on Hostinger; otherwise run Composer on the server

Vercel frontend:

- Deploy the `frontend` directory as the Vercel project root.
- Required source files are `frontend/app`, `frontend/public`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/next.config.mjs`.
- Do not upload `frontend/.env.local`, `frontend/.next`, or `frontend/node_modules` to Vercel.

Netlify frontend:

- Deploy this repository with `netlify.toml` at the repository root.
- Netlify builds from `frontend`, publishes `frontend/.next`, and uses `@netlify/plugin-nextjs` for App Router routing.
- Required source files are `netlify.toml`, `frontend/app`, `frontend/public`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/next.config.mjs`.
- Do not upload or commit `frontend/.env.local`, `frontend/.next`, or `frontend/node_modules`.
