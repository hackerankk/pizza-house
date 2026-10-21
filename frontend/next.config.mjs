import { isIP } from 'node:net';
import { imageRemotePatterns } from './image-config.mjs';
import { indexableSite, PRODUCTION_ORIGIN } from './site-config.mjs';

function configuredOrigin(value, { publicHttpsOnly = false } = {}) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (publicHttpsOnly && (url.protocol !== 'https:' || isIP(url.hostname.replace(/^\[|\]$/g, ''))
      || !url.hostname.includes('.') || /(^|\.)(localhost|test|invalid|example|local)$/i.test(url.hostname)
      || /your[-.]|deploy-preview|preview/i.test(url.hostname))) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function additionalOrigins(value) {
  return String(value || '').split(',').map(origin => configuredOrigin(origin.trim(), { publicHttpsOnly: true })).filter(Boolean);
}

function browserSecurityHeaders() {
  const apiOrigin = configuredOrigin(process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000');
  const maps = 'https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com';
  const razorpay = 'https://checkout.razorpay.com https://api.razorpay.com https://*.razorpay.com';
  // This first-party loader runs only after the site's analytics opt-in. Keep
  // its endpoints visible in report-only CSP so valid consented traffic does
  // not create noise while the production policy is being evaluated.
  const analyticsScript = 'https://www.googletagmanager.com';
  const analyticsCollection = 'https://www.google-analytics.com https://region1.google-analytics.com';
  const imageOrigins = [...additionalOrigins(process.env.SECURITY_CSP_IMAGE_ORIGINS), ...additionalOrigins(process.env.NEXT_PUBLIC_IMAGE_ORIGINS)].join(' ');
  const mediaOrigins = additionalOrigins(process.env.SECURITY_CSP_MEDIA_ORIGINS).join(' ');
  const development = process.env.NODE_ENV !== 'production';
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline' ${development ? "'unsafe-eval'" : ''} ${maps} ${razorpay} ${analyticsScript}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: https://images.unsplash.com ${apiOrigin} ${maps} ${analyticsCollection} ${imageOrigins}`,
    `connect-src 'self' ${apiOrigin} ${maps} ${razorpay} ${analyticsCollection} ${development ? 'ws://localhost:* ws://127.0.0.1:*' : ''}`,
    `frame-src 'self' ${razorpay} https://www.google.com https://maps.google.com`,
    `media-src 'self' blob: ${apiOrigin} ${mediaOrigins}`,
    "worker-src 'self' blob:",
  ].map(directive => directive.replace(/\s+/g, ' ').trim()).join('; ');
  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com")' },
    // Observe real integration/media traffic before moving to enforced CSP.
    // Next's bootstrap and the saved theme currently require inline scripts/styles.
    { key: 'Content-Security-Policy-Report-Only', value: policy },
  ];
  if (indexableSite()) {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' });
  }
  return headers;
}

const nextConfig = {
  agentRules: false,
  poweredByHeader: false,
  turbopack: {
    root: process.cwd()
  },
  images: {
    remotePatterns: imageRemotePatterns(),
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: browserSecurityHeaders() },
      ...['account', 'checkout', 'login', 'orders', 'staff', 'delivery', 'admin', 'order-success', 'payment-failure'].map(route => ({ source: `/${route}/:path*`, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] })),
    ];
  },
  async redirects() {
    if (!indexableSite()) return [];
    return [{ source: '/:path*', has: [{ type: 'host', value: 'www\\.thepizzahouse\\.online' }], destination: `${PRODUCTION_ORIGIN}/:path*`, permanent: true }];
  },
};

export default nextConfig;
