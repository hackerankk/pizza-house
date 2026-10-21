import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// No third-party request is made. Exercise the public integration with browser
// storage and script insertion doubles, including a separate module after reload.
const source = await readFile(new URL('../app/analytics.js', import.meta.url), 'utf8');
const storage = new Map();
const scripts = [];
const deletedCookies = [];
globalThis.window = {
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  location: { origin: 'https://pizza.example', hostname: 'pizza.example', protocol: 'https:', pathname: '/orders/42', search: '?access_token=private' }
};
globalThis.document = {
  get cookie() { return '_ga=existing; _ga_TEST=existing; necessary=session'; },
  set cookie(value) { deletedCookies.push(value); },
  getElementById: id => scripts.find(script => script.id === id && !script.removed),
  createElement: () => ({ remove() { this.removed = true; } }),
  head: { appendChild: script => scripts.push(script) }
};
const load = suffix => import(`data:text/javascript;base64,${Buffer.from(`${source}\n// ${suffix}`).toString('base64')}`);
const previousId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const previousAutomaticCollection = process.env.NEXT_PUBLIC_GA_AUTOMATIC_COLLECTION_DISABLED;
process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST12345';
process.env.NEXT_PUBLIC_GA_AUTOMATIC_COLLECTION_DISABLED = 'true';

try {
  const analytics = await load('first visit');
  analytics.applyAnalyticsConsent(null);
  assert.equal(scripts.length, 0, 'No script before a choice');
  assert.equal(analytics.trackEvent('purchase', { value: 599, currency: 'INR' }, { dedupeKey: 'order:42' }), false, 'Pre-consent purchase is dropped');
  assert.equal(storage.has('pizza_house_analytics_events_v1'), false, 'Dropped events leave no replay queue');

  analytics.writeConsent({ analytics: false, marketing: true });
  assert.equal(scripts.length, 0, 'Marketing choice alone loads no tracker');
  const choice = analytics.writeConsent({ analytics: true, marketing: false });
  assert.equal(choice.persisted, true);
  assert.equal(scripts.length, 1, 'Analytics script starts only after analytics opt-in');
  const config = Array.from(window.dataLayer.find(entry => entry[0] === 'config'))[2];
  assert.equal(config.send_page_view, false);
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.page_location, 'https://pizza.example/');
  assert.equal(config.page_referrer, '');
  assert.equal(config.page_title, 'The Pizza House');

  assert.equal(analytics.trackEvent('purchase', { value: 599.123, currency: 'INR', email: 'private@example.com', order_id: 42, access_token: 'private', items: [{ name: 'private' }] }, { dedupeKey: 'order:42' }), true);
  const event = Array.from(window.dataLayer.at(-1));
  assert.deepEqual(event, ['event', 'purchase', { value: 599.12, currency: 'INR', send_to: 'G-TEST12345' }], 'Only approved commerce totals reach the tag');
  assert.equal(analytics.trackEvent('purchase', {}, { dedupeKey: 'order:42' }), false, 'Repeat success callback is deduplicated');
  assert.equal(analytics.trackEvent('purchase', {}), false, 'Purchase requires a stable local duplicate key');
  assert.equal(analytics.trackEvent('arbitrary_event', { email: 'private' }), false, 'Unknown events are rejected');
  assert.deepEqual(analytics.analyticsPayload({ value: Infinity, currency: 'USD', item_count: '3', email: 'private' }), {}, 'Invalid totals and unapproved fields are dropped');

  analytics.writeConsent({ analytics: false, marketing: false });
  assert.equal(window['ga-disable-G-TEST12345'], true, 'Withdrawal disables the Google tag');
  assert.equal(scripts[0].removed, true, 'Withdrawal removes pending script');
  assert.equal(window.dataLayer.length, 0, 'Withdrawal clears pending measurement commands');
  assert.equal(analytics.trackEvent('login'), false, 'Future events stop immediately');
  assert.ok(deletedCookies.some(cookie => cookie.startsWith('_ga=;')));
  assert.ok(deletedCookies.every(cookie => !cookie.startsWith('necessary=')), 'Necessary cookies survive');

  const reloaded = await load('reloaded visit');
  reloaded.applyAnalyticsConsent(reloaded.readConsent());
  assert.equal(scripts.length, 1, 'Reload respects rejection');
  reloaded.writeConsent({ analytics: true });
  assert.equal(reloaded.trackEvent('purchase', {}, { dedupeKey: 'order:42' }), false, 'Purchase dedupe survives reload');
  const expired = { ...choice.consent, updatedAt: new Date(Date.now() - 181 * 86400000).toISOString() };
  assert.equal(analytics.normalizeConsent(expired), null, 'Expired choice requires renewed consent');
  assert.equal(analytics.normalizeConsent({ ...choice.consent, version: 99 }), null, 'Changed policy version requires renewed consent');

  process.env.NEXT_PUBLIC_GA_AUTOMATIC_COLLECTION_DISABLED = 'false';
  const unsafeConfiguration = await load('automatic collection not confirmed disabled');
  const countBefore = scripts.length;
  unsafeConfiguration.writeConsent({ analytics: true });
  assert.equal(scripts.length, countBefore, 'Unconfirmed automatic collection blocks the Google script');
  assert.equal(unsafeConfiguration.trackEvent('login'), false);
  process.env.NEXT_PUBLIC_GA_AUTOMATIC_COLLECTION_DISABLED = 'true';
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = '';
  const unconfigured = await load('missing configuration');
  unconfigured.writeConsent({ analytics: true });
  assert.equal(unconfigured.trackEvent('login'), false, 'Missing measurement ID never enables collection');
  console.log('PASS analytics: opt-in gating, withdrawal, strict payloads, safe location, expiry, missing config and persistent purchase dedupe');
} finally {
  if (previousId === undefined) delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  else process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = previousId;
  if (previousAutomaticCollection === undefined) delete process.env.NEXT_PUBLIC_GA_AUTOMATIC_COLLECTION_DISABLED;
  else process.env.NEXT_PUBLIC_GA_AUTOMATIC_COLLECTION_DISABLED = previousAutomaticCollection;
  delete globalThis.window;
  delete globalThis.document;
}
