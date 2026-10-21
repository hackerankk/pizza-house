import { indexableSite, siteOrigin } from '../site-config.mjs';
export { indexableSite, siteOrigin };

export function publicMetadata(title, description, path = '/', environment = process.env) {
  const origin = siteOrigin(environment);
  const url = origin ? new URL(path, origin).href : null;
  const image = origin ? `${origin}/brand/social-share.webp` : null;
  return {
    title,
    description,
    robots: { index: indexableSite(environment), follow: true },
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      title, description, type: 'website', siteName: 'The Pizza House', locale: 'en_IN',
      ...(url ? { url } : {}),
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: 'The Pizza House — online ordering' }] } : {})
    },
    twitter: { card: 'summary_large_image', title, description, ...(image ? { images: [image] } : {}) }
  };
}

export function privateMetadata(title, description) {
  return { title: `${title} | The Pizza House`, description, robots: { index: false, follow: false }, alternates: { canonical: null } };
}

export function websiteSchema(environment = process.env) {
  const origin = siteOrigin(environment);
  if (!origin) return null;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${origin}/#website`, url: `${origin}/`, name: 'The Pizza House', inLanguage: 'en-IN' },
      { '@type': 'WebPage', '@id': `${origin}/#webpage`, url: `${origin}/`, name: 'The Pizza House | Order Pizza Online', isPartOf: { '@id': `${origin}/#website` }, inLanguage: 'en-IN' }
    ]
  };
}

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
