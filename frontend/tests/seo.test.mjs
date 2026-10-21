import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { imageRemotePatterns, isOptimizableImage } from '../image-config.mjs';
import { PRODUCTION_ORIGIN } from '../site-config.mjs';

// Fixtures never change the site's .env files or contact external services.
const seoSource = (await readFile(new URL('../app/seo.js', import.meta.url), 'utf8')).replace("'../site-config.mjs'", JSON.stringify(new URL('../site-config.mjs', import.meta.url).href));
const seoModuleUrl = `data:text/javascript;base64,${Buffer.from(seoSource).toString('base64')}`;
const { siteOrigin, indexableSite, publicMetadata, privateMetadata, websiteSchema, serializeJsonLd } = await import(seoModuleUrl);
const fixture = { NEXT_PUBLIC_SITE_URL: 'https://thepizzahouse.online', NEXT_PUBLIC_SITE_ENV: 'production' };

assert.equal(siteOrigin(fixture), 'https://thepizzahouse.online');
assert.equal(siteOrigin({ NEXT_PUBLIC_SITE_URL: 'https://THEPIZZAHOUSE.online/' }), 'https://thepizzahouse.online');
for (const value of [ 'http://example.com', 'https://localhost', 'https://shop.localhost', 'https://127.0.0.1', 'https://[::1]', 'https://thepizzahouse.online:444', 'https://user:secret@example.com', 'https://thepizzahouse.online/path', 'https://thepizzahouse.online/?tracking=1', 'https://thepizzahouse.online/#menu', 'https://shop.test', 'https://staging.example.com', 'https://dev.shop.example.com', 'https://qa.example.com', 'https://test.example.com', 'https://preview.example.com', 'https://deploy-preview-23--shop.netlify.app', 'https://shop-git-feature.vercel.app', 'https://your-domain.com']) {
  assert.equal(siteOrigin({ NEXT_PUBLIC_SITE_URL: value }), null, `Reject unsafe/non-production origin: ${value}`);
}
assert.equal(siteOrigin({}), PRODUCTION_ORIGIN, 'The confirmed production domain replaces the legacy localhost fallback');
assert.equal(siteOrigin({ NEXT_PUBLIC_SITE_URL: 'https://shop.netlify.app' }), null, 'Unconfirmed hosts are not published as canonical origins');
assert.equal(indexableSite({ NODE_ENV: 'production' }), true, 'Production build uses the confirmed domain without missing configuration');
assert.equal(indexableSite({ NODE_ENV: 'development' }), false);
assert.equal(indexableSite({ NODE_ENV: 'production', NEXT_PUBLIC_SITE_ENV: 'staging' }), false);
assert.equal(indexableSite(fixture), true);
for (const environment of [{}, { ...fixture, NEXT_PUBLIC_SITE_ENV: 'staging' }, { ...fixture, NEXT_PUBLIC_SITE_ENV: '' }, { ...fixture, VERCEL_ENV: 'preview' }, { ...fixture, CONTEXT: 'deploy-preview' }, { ...fixture, CONTEXT: 'branch-deploy' }]) {
  assert.equal(indexableSite(environment), false, 'Indexing requires explicit production configuration');
}

for (const path of ['/', '/privacy']) {
  const result = publicMetadata(`Page ${path}`, 'Public page description.', path, fixture);
  assert.equal(result.alternates.canonical, `https://thepizzahouse.online${path}`);
  assert.equal(result.openGraph.url, result.alternates.canonical);
  assert.equal(result.openGraph.title, result.title);
  assert.equal(result.openGraph.description, result.description);
  assert.equal(result.openGraph.siteName, 'The Pizza House');
  assert.equal(result.openGraph.locale, 'en_IN');
  assert.equal(result.openGraph.images[0].url, 'https://thepizzahouse.online/brand/social-share.webp');
  assert.deepEqual([result.openGraph.images[0].width, result.openGraph.images[0].height], [1200, 630]);
  assert.deepEqual(result.twitter.images, [result.openGraph.images[0].url]);
  assert.equal(result.robots.index, true);
}
const unconfigured = publicMetadata('Page', 'Description', '/', { NEXT_PUBLIC_SITE_URL: 'https://staging.thepizzahouse.online' });
assert.equal(unconfigured.robots.index, false);
assert.equal(unconfigured.alternates, undefined, 'No invented canonical without production origin');
assert.equal(unconfigured.openGraph.url, undefined);
assert.equal(unconfigured.openGraph.images, undefined, 'No localhost or preview social image');
const privatePage = privateMetadata('Your Account', 'Manage your account.');
assert.deepEqual(privatePage.robots, { index: false, follow: false });
assert.equal(privatePage.alternates.canonical, null, 'Private pages never inherit a public canonical');

assert.equal(websiteSchema({ NEXT_PUBLIC_SITE_URL: 'https://staging.thepizzahouse.online' }), null, 'Unconfirmed host cannot appear in structured data');
const schema = websiteSchema(fixture);
assert.equal(schema['@context'], 'https://schema.org');
assert.deepEqual(schema['@graph'].map(entry => entry['@type']), ['WebSite', 'WebPage']);
assert.ok(schema['@graph'].every(entry => entry.url === 'https://thepizzahouse.online/'));
assert.equal(schema['@graph'][1].isPartOf['@id'], schema['@graph'][0]['@id']);
const hostileContent = { name: '</script><script>alert("test")</script>', nested: { value: 'Pizza < sides & drinks' } };
const serialized = serializeJsonLd(hostileContent);
assert.ok(!serialized.includes('<'), 'JSON-LD cannot terminate its script element');
assert.deepEqual(JSON.parse(serialized), hostileContent, 'Escaping preserves original structured data values');
assert.deepEqual(JSON.parse(serializeJsonLd(schema)), schema);

const keys = ['NODE_ENV', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_SITE_ENV', 'VERCEL_ENV', 'CONTEXT', 'NEXT_PUBLIC_API_BASE', 'NEXT_PUBLIC_IMAGE_ORIGINS'];
const previous = new Map(keys.map(key => [key, process.env[key]]));
const loadRoute = async file => {
  const source = (await readFile(new URL(file, import.meta.url), 'utf8')).replace("from './seo'", `from '${seoModuleUrl}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default;
};
try {
  for (const key of keys) delete process.env[key];
  const sitemap = await loadRoute('../app/sitemap.js');
  const robots = await loadRoute('../app/robots.js');
  assert.deepEqual(sitemap(), [], 'Unconfigured and staging builds publish no sitemap URLs');
  assert.deepEqual(robots(), { rules: [{ userAgent: '*', disallow: '/' }] });
  Object.assign(process.env, fixture);
  assert.deepEqual(sitemap().map(entry => entry.url), ['https://thepizzahouse.online/', 'https://thepizzahouse.online/privacy'], 'Sitemap contains only canonical indexable public pages');
  assert.equal(robots().sitemap, 'https://thepizzahouse.online/sitemap.xml');
  assert.equal(robots().rules[0].allow, '/');
  assert.ok(!robots().rules[0].disallow.includes('/'), 'Production does not accidentally block all crawlers');
  for (const path of ['/account', '/checkout', '/login', '/orders/', '/staff', '/delivery', '/admin']) assert.ok(robots().rules[0].disallow.includes(path));
  process.env.VERCEL_ENV = 'preview';
  assert.deepEqual(sitemap(), []);
  assert.equal(robots().rules[0].disallow, '/', 'Preview environment cannot enable crawling');

  process.env.NEXT_PUBLIC_API_BASE = 'https://api.example.com/v1';
  process.env.NEXT_PUBLIC_IMAGE_ORIGINS = 'https://cdn.example.com,https://user:secret@invalid.example.com,http://insecure.example.com';
  assert.equal(isOptimizableImage('/brand/icon-192.png'), true);
  assert.equal(isOptimizableImage('https://images.unsplash.com/photo-example'), true);
  assert.equal(isOptimizableImage('https://api.example.com/uploads/image.webp'), true);
  assert.equal(isOptimizableImage('https://cdn.example.com/image.webp'), true);
  assert.equal(isOptimizableImage('http://localhost:8000/uploads/example.png'), false, 'Local API media loads directly rather than bypassing private IP protection');
  for (const value of ['//cdn.example.com/image.webp', 'https://arbitrary.example.com/photo.webp', 'https://cdn.example.com.evil.example/photo.webp', 'https://user:secret@cdn.example.com/image.webp', 'http://cdn.example.com/image.webp', 'data:image/png;base64,test', null]) assert.equal(isOptimizableImage(value), false, `Untrusted origin is not proxied: ${value}`);
  assert.ok(!imageRemotePatterns().some(pattern => pattern.hostname.includes('*')), 'Remote optimization uses exact configured hosts');
} finally {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

for (const [name, size] of [['favicon-16.png', 16], ['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  const content = await readFile(new URL(`../public/brand/${name}`, import.meta.url));
  assert.equal(content.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} has PNG content`);
  assert.deepEqual([content.readUInt32BE(16), content.readUInt32BE(20)], [size, size], `${name} has the declared dimensions`);
}
const favicon = await readFile(new URL('../app/favicon.ico', import.meta.url));
assert.equal(favicon.readUInt16LE(0), 0);
assert.equal(favicon.readUInt16LE(2), 1, 'Browser favicon is an ICO file');
assert.ok(favicon.readUInt16LE(4) >= 1);
const social = await readFile(new URL('../public/brand/social-share.webp', import.meta.url));
assert.equal(social.subarray(0, 4).toString(), 'RIFF');
assert.equal(social.subarray(8, 12).toString(), 'WEBP');
let socialDimensions;
for (let offset = 12; offset + 8 <= social.length;) {
  const type = social.subarray(offset, offset + 4).toString();
  const length = social.readUInt32LE(offset + 4);
  const data = offset + 8;
  if (type === 'VP8X') socialDimensions = [1 + social.readUIntLE(data + 4, 3), 1 + social.readUIntLE(data + 7, 3)];
  if (type === 'VP8 ') socialDimensions = [social.readUInt16LE(data + 6) & 0x3fff, social.readUInt16LE(data + 8) & 0x3fff];
  if (type === 'VP8L') {
    const bits = social.readUInt32LE(data + 1);
    socialDimensions = [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)];
  }
  offset += 8 + length + (length % 2);
}
assert.deepEqual(socialDimensions, [1200, 630], 'Social image content matches Open Graph dimensions');
assert.ok(social.length < 100_000, 'Default sharing image remains lightweight');
console.log('PASS SEO/assets: production origin gating, canonical/OG consistency, private noindex, safe JSON-LD roundtrip, sitemap privacy, robots environments, exact image origins and actual icon/social dimensions');
