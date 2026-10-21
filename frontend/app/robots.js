import { indexableSite, siteOrigin } from './seo';

export default function robots() {
  if (!indexableSite()) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/account', '/checkout', '/login', '/orders/', '/staff', '/delivery', '/admin', '/order-success', '/payment-failure'] }],
    sitemap: `${siteOrigin()}/sitemap.xml`
  };
}
