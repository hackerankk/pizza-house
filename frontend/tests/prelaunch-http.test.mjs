import assert from 'node:assert/strict';

const origin = process.env.PIZZA_FRONTEND_TEST_URL || '';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/, 'Use a local test server only');
for (const path of ['/', '/privacy', '/login', '/account', '/checkout', '/staff', '/delivery', '/order-success', '/payment-failure', '/orders/1', '/orders/1/confirmation', '/secure-dashboard']) {
  const response = await fetch(`${origin}${path}`);
  const html = await response.text();
  assert.equal(response.status, 200, `${path} remains a valid route`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.ok(response.headers.get('content-security-policy-report-only')?.includes("object-src 'none'"));
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.match(html, /<title>[^<]+<\/title>/);
  if (!['/', '/privacy'].includes(path)) assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
}
for (const path of ['/not-a-real-launch-page', '/missing/nested/route', '/admin']) {
  const response = await fetch(`${origin}${path}`);
  assert.equal(response.status, 404, `${path} must send a real HTTP 404`);
  const html = await response.text();
  assert.match(html, /This page isn’t on the menu/);
  // A route-level notFound() may serialize the boundary into the React stream;
  // its interactive anchor is also checked in the actual browser.
  assert.match(html, /Go Home/);
  assert.match(html, /<title>Page not found \| The Pizza House<\/title>/);
  assert.doesNotMatch(html, /<title>Admin Portal<\/title>/, 'Unknown routes must not inherit the catch-all admin title');
}
for (const path of ['/favicon.ico', '/brand/icon.svg', '/brand/favicon-16.png', '/brand/favicon-32.png', '/brand/apple-touch-icon.png', '/brand/icon-192.png', '/brand/icon-512.png', '/brand/social-share.webp']) {
  const response = await fetch(`${origin}${path}`);
  assert.equal(response.status, 200, `${path} is public`);
  assert.match(response.headers.get('content-type'), /image\//);
  assert.ok((await response.arrayBuffer()).byteLength > 100);
}
const manifest = await fetch(`${origin}/manifest.webmanifest`).then(response => response.json());
assert.equal(manifest.name, 'The Pizza House');
assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
const robots = await fetch(`${origin}/robots.txt`).then(response => response.text());
const sitemap = await fetch(`${origin}/sitemap.xml`).then(response => response.text());
assert.match(sitemap, /<urlset/);
assert.doesNotMatch(sitemap, /localhost|\/account|\/checkout|\/staff|\/orders\//);
assert.doesNotMatch(robots, /Sitemap:.*localhost/);
for (const format of ['image/webp', 'image/avif']) {
  const response = await fetch(`${origin}/_next/image?url=${encodeURIComponent('/brand/social-share.webp')}&w=640&q=75`, { headers: { Accept: format } });
  assert.equal(response.status, 200, 'Framework image optimizer responds');
  assert.equal(response.headers.get('content-type'), format);
}
console.log('PASS: valid/private routes, actual branded 404 status, HTTP security headers, icon/manifest assets, crawler output, WebP/AVIF negotiation.');
