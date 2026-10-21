import assert from 'node:assert/strict';
import test from 'node:test';
import config from '../next.config.mjs';

test('browser response policy preserves integrations and gates production HSTS', async () => {
  const keys = ['NODE_ENV', 'NEXT_PUBLIC_SITE_ENV', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_API_BASE', 'NEXT_PUBLIC_IMAGE_ORIGINS', 'SECURITY_CSP_IMAGE_ORIGINS', 'SECURITY_CSP_MEDIA_ORIGINS', 'CONTEXT', 'VERCEL_ENV'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  const values = async () => Object.fromEntries((await config.headers())[0].headers.map(header => [header.key, header.value]));
  try {
    delete process.env.CONTEXT;
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_SITE_ENV = 'production';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://thepizzahouse.online';
    process.env.NEXT_PUBLIC_API_BASE = 'https://api.thepizzahouse.online';
    process.env.NEXT_PUBLIC_IMAGE_ORIGINS = 'https://images.fixture-cdn.com';
    process.env.SECURITY_CSP_IMAGE_ORIGINS = 'https://media.fixture-cdn.com';
    process.env.SECURITY_CSP_MEDIA_ORIGINS = 'https://audio.fixture-cdn.com';
    const headers = await values();
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000');
    const policy = headers['Content-Security-Policy-Report-Only'];
    assert.ok(policy.includes("frame-ancestors 'none'"));
    assert.ok(policy.includes('https://maps.googleapis.com') && policy.includes('https://checkout.razorpay.com'));
    assert.ok(policy.includes('https://www.googletagmanager.com') && policy.includes('https://region1.google-analytics.com'));
    assert.ok(policy.includes('https://api.thepizzahouse.online'));
    assert.ok(policy.includes('https://images.fixture-cdn.com') && policy.includes('https://media.fixture-cdn.com') && policy.includes('https://audio.fixture-cdn.com'));
    assert.ok(!policy.includes("'unsafe-eval'") && !policy.includes('ws://localhost'));
    assert.ok(!headers['Content-Security-Policy'], 'full resource policy remains report-only pending deployed integration inspection');
    for (const origin of ['http://thepizzahouse.online', 'https://localhost', 'https://127.0.0.1', 'https://api.example', 'https://preview.thepizzahouse.online']) {
      process.env.NEXT_PUBLIC_SITE_URL = origin;
      assert.ok(!(await values())['Strict-Transport-Security'], `HSTS excluded for ${origin}`);
    }
    process.env.NEXT_PUBLIC_SITE_URL = 'https://thepizzahouse.online';
    assert.deepEqual(await config.redirects(), [{ source: '/:path*', has: [{ type: 'host', value: 'www\\.thepizzahouse\\.online' }], destination: 'https://thepizzahouse.online/:path*', permanent: true }]);
    const routes = await config.headers();
    for (const path of ['/account/:path*', '/checkout/:path*', '/orders/:path*', '/staff/:path*']) assert.ok(routes.find(route => route.source === path)?.headers.some(header => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow'));
    process.env.NEXT_PUBLIC_SITE_ENV = 'staging';
    assert.deepEqual(await config.redirects(), [], 'Staging and local requests are never redirected to production');
    assert.ok(!(await values())['Strict-Transport-Security']);
    process.env.NODE_ENV = 'development';
    assert.ok((await values())['Content-Security-Policy-Report-Only'].includes("'unsafe-eval'"));
  } finally {
    keys.forEach(key => previous.get(key) === undefined ? delete process.env[key] : process.env[key] = previous.get(key));
  }
});
