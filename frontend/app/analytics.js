'use client';

export const CONSENT_STORAGE_KEY = 'pizza_house_privacy_preferences';
export const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000;
const DEDUPE_STORAGE_KEY = 'pizza_house_analytics_events_v1';
const SCRIPT_ID = 'pizza-house-consented-analytics';
const allowedEvents = new Set(['sign_up', 'login', 'add_to_cart', 'begin_checkout', 'purchase']);
let activeConsent = null;
let configuredId = '';
let initialized = false;
const memoryDedupe = new Set();

export function normalizeConsent(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.version !== CONSENT_VERSION || value.necessary !== true
    || typeof value.analytics !== 'boolean' || typeof value.marketing !== 'boolean'
    || typeof value.updatedAt !== 'string') return null;
  const timestamp = Date.parse(value.updatedAt);
  if (!Number.isFinite(timestamp) || timestamp > now + 60000 || now - timestamp > CONSENT_MAX_AGE) return null;
  return { version: CONSENT_VERSION, necessary: true, analytics: value.analytics, marketing: value.marketing, updatedAt: value.updatedAt };
}

export function readConsent() {
  if (typeof window === 'undefined') return null;
  try { return normalizeConsent(JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) || 'null')); }
  catch { return null; }
}

export function writeConsent(preferences) {
  const consent = {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: preferences.analytics === true,
    marketing: preferences.marketing === true,
    updatedAt: new Date().toISOString()
  };
  let persisted = false;
  try { window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent)); persisted = true; }
  catch { /* The choice still applies to this visit when browser storage is unavailable. */ }
  applyAnalyticsConsent(consent);
  return { consent, persisted };
}

export function analyticsConfigured() {
  // Dashboard-controlled enhanced measurement can bypass event allowlists. The
  // operator must disable it before explicitly enabling this integration.
  return /^G-[A-Z0-9]{5,20}$/.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '')
    && process.env.NEXT_PUBLIC_GA_AUTOMATIC_COLLECTION_DISABLED === 'true';
}

function removeAnalyticsCookies() {
  const names = document.cookie.split(';').map(cookie => cookie.trim().split('=')[0]).filter(name => /^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name));
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`];
  const labels = host.split('.');
  for (let index = 1; index < labels.length - 1; index += 1) domains.push(`.${labels.slice(index).join('.')}`);
  names.forEach(name => domains.forEach(domain => {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}${window.location.protocol === 'https:' ? '; Secure' : ''}`;
  }));
}

export function applyAnalyticsConsent(value) {
  if (typeof window === 'undefined') return;
  activeConsent = normalizeConsent(value);
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';
  const enabled = activeConsent?.analytics === true && analyticsConfigured();
  if (measurementId) window[`ga-disable-${measurementId}`] = !enabled;
  if (!enabled) {
    if (configuredId) window[`ga-disable-${configuredId}`] = true;
    document.getElementById(SCRIPT_ID)?.remove();
    if (initialized) {
      // Clearing queued commands also prevents a pending script load from replaying events.
      window.dataLayer = [];
      window.gtag = () => {};
    }
    initialized = false;
    configuredId = '';
    removeAnalyticsCookies();
    return;
  }
  if (initialized && configuredId === measurementId) return;
  configuredId = measurementId;
  initialized = true;
  window.dataLayer = [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  // Basic consent mode: no Google script or network request exists before opt-in.
  // Advertising remains denied even if the unused marketing preference is selected.
  window.gtag('consent', 'default', {
    analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
  });
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_update: false,
    cookie_flags: window.location.protocol === 'https:' ? 'SameSite=Lax;Secure' : 'SameSite=Lax',
    // Queries, hashes, private order routes and page titles are never event metadata.
    page_location: `${window.location.origin}/`,
    page_referrer: '',
    page_title: 'The Pizza House'
  });
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.onerror = () => {
    if (configuredId !== measurementId) return;
    window[`ga-disable-${measurementId}`] = true;
    initialized = false;
    window.dataLayer = [];
    script.remove();
  };
  document.head.appendChild(script);
}

export function analyticsPayload(value = {}) {
  const payload = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return payload;
  if (typeof value.value === 'number' && Number.isFinite(value.value) && value.value >= 0 && value.value <= 100000000) payload.value = Math.round(value.value * 100) / 100;
  if (value.currency === 'INR') payload.currency = 'INR';
  if (Number.isInteger(value.item_count) && value.item_count >= 1 && value.item_count <= 10000) payload.item_count = value.item_count;
  return payload;
}

function dedupeHash(value) {
  // This is a local duplicate marker, not a transmitted order/customer identifier.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

function rememberEvent(key) {
  if (memoryDedupe.has(key)) return false;
  try {
    const stored = JSON.parse(window.localStorage.getItem(DEDUPE_STORAGE_KEY) || '[]');
    const keys = Array.isArray(stored) ? stored.filter(value => typeof value === 'string').slice(-199) : [];
    if (keys.includes(key)) { memoryDedupe.add(key); return false; }
    window.localStorage.setItem(DEDUPE_STORAGE_KEY, JSON.stringify([...keys, key]));
  } catch { /* Memory still prevents duplicates within this visit. */ }
  memoryDedupe.add(key);
  return true;
}

export function trackEvent(name, value = {}, options = {}) {
  if (typeof window === 'undefined' || !allowedEvents.has(name) || !normalizeConsent(activeConsent)?.analytics
    || !initialized || !configuredId || window[`ga-disable-${configuredId}`] || typeof window.gtag !== 'function') return false;
  // A purchase must be emitted only after the API confirms success, with a stable
  // local key. Keys, customer details, products, addresses and payment IDs never leave here.
  const dedupeKey = typeof options.dedupeKey === 'string' ? options.dedupeKey.slice(0, 1024) : '';
  if (name === 'purchase' && !dedupeKey) return false;
  if (dedupeKey && !rememberEvent(`${name}:${dedupeHash(dedupeKey)}`)) return false;
  window.gtag('event', name, { ...analyticsPayload(value), send_to: configuredId });
  return true;
}
