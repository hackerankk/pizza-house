'use client';

import Link from 'next/link';

export default function ErrorPage({ reset }) {
  return (
    <main className="container section" style={{ maxWidth: 720 }}>
      <section className="panel" role="alert">
        <span className="eyebrow">The Pizza House</span>
        <h1 style={{ fontSize: 36 }}>Something went wrong</h1>
        <p>We couldn’t load this page. Please try again in a moment.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={reset}>Try again</button>
          <Link className="button ghost" href="/">Go Home</Link>
        </div>
      </section>
    </main>
  );
}
