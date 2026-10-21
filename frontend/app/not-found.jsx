import Link from 'next/link';

export const metadata = {
  title: 'Page not found | The Pizza House',
  robots: { index: false, follow: false }
};

export default function NotFound() {
  return (
    <div className="shell">
      <header className="site-header">
        <div className="container header-inner">
          <Link href="/" className="brand mark" aria-label="The Pizza House home"><span className="brand-icon" aria-hidden="true">TP</span><span>The Pizza House</span></Link>
        </div>
      </header>
      <main className="container section" style={{ maxWidth: 720, flex: 1 }}>
        <section className="panel" style={{ padding: 'clamp(24px, 5vw, 56px)' }}>
          <span className="eyebrow">404 · Page not found</span>
          <h1 style={{ fontSize: 'clamp(32px, 6vw, 52px)' }}>This page isn’t on the menu.</h1>
          <p>The link may have changed, or the page may no longer exist. Your next order is just a click away.</p>
          <Link className="button" href="/">Go Home</Link>
          <nav aria-label="Helpful links" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 24 }}>
            <Link className="text-link" href="/#menu">Browse the menu</Link>
            <Link className="text-link" href="/privacy">Privacy and cookies</Link>
            <Link className="text-link" href="/account">My orders</Link>
          </nav>
        </section>
      </main>
    </div>
  );
}
