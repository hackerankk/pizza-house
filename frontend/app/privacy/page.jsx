import Link from 'next/link';
import { publicMetadata, serializeJsonLd, siteOrigin } from '../seo';

export const metadata = publicMetadata('Privacy and Cookie Settings | The Pizza House', 'Learn how The Pizza House uses essential browser storage and optional analytics, and manage your cookie preferences.', '/privacy');

export default function PrivacyPage() {
  const origin = siteOrigin();
  const breadcrumbs = origin ? { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` }, { '@type': 'ListItem', position: 2, name: 'Privacy and cookies', item: `${origin}/privacy` }] } : null;
  return (
    <main className="container section" style={{ maxWidth: 860 }}>
      {breadcrumbs ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbs) }} /> : null}
      <Link className="brand mark" href="/"><span className="brand-icon" aria-hidden="true">TP</span><span>The Pizza House</span></Link>
      <nav aria-label="Breadcrumb" style={{ margin: '24px 0' }}><ol style={{ display: 'flex', flexWrap: 'wrap', gap: 12, listStyle: 'none', padding: 0 }}><li><Link href="/">Home</Link></li><li aria-hidden="true">/</li><li aria-current="page">Privacy and cookies</li></ol></nav>
      <h1 style={{ fontSize: 'clamp(32px, 6vw, 52px)' }}>Privacy and cookies</h1>
      <section className="panel stack">
        <div><h2>Essential site functions</h2><p>The site uses browser storage to keep your cart, sign-in session, theme preference and cookie choices. Guest order access is saved on your device so you can return to your order. These functions remain available when optional tracking is declined.</p></div>
        <div><h2>Optional analytics</h2><p>If analytics is configured and you choose to allow it, the site measures successful actions such as registration and checkout. Event details are limited to amounts, currency and item counts. Names, email addresses, phone numbers, order numbers, payment details and passwords are excluded. Actions before consent are not sent later.</p></div>
        <div><h2>Your choices</h2><p>Use the Cookie settings button available on every page to accept, decline or change optional categories. Analytics and marketing are off until you choose otherwise. Withdrawing consent stops future optional measurement and clears analytics cookies accessible to this site. It cannot undo information already received by a service.</p></div>
        <div><h2>Ordering services</h2><p>Payments, maps, location features and order notifications may use the restaurant’s configured service providers when you use those features. Payment credentials are handled by the payment provider. Location access requires your browser’s permission.</p></div>
        <div><h2>Shared devices</h2><p>Sign out after using a shared device. Clearing site data also removes saved carts, preferences and locally saved guest order access.</p></div>
        <p className="small-note">This page describes the implemented site features. The operator should review its service providers, data retention and privacy obligations before launch.</p>
        <Link className="button" href="/#menu">Browse the menu</Link>
      </section>
    </main>
  );
}
