import { AlertCircle, RefreshCw, ShoppingBag } from 'lucide-react';

const placeholderStyle = {
  display: 'block',
  height: 14,
  borderRadius: 6,
  background: 'color-mix(in srgb, var(--text-color), transparent 90%)'
};

export function LoadingState({ label = 'Loading…', rows = 3, cards = 1 }) {
  return (
    <div role="status" aria-live="polite" style={{ display: 'grid', gap: 16, minHeight: 180 }}>
      <span className="small-note">{label}</span>
      {Array.from({ length: cards }, (_, card) => (
        <div className="panel" key={card} aria-hidden="true" style={{ display: 'grid', gap: 18, minHeight: 130 }}>
          <span style={{ ...placeholderStyle, width: '45%', height: 22 }} />
          {Array.from({ length: rows }, (_, row) => <span key={row} style={{ ...placeholderStyle, width: row === rows - 1 ? '65%' : '100%' }} />)}
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ title = 'Unable to load this content', message = 'Please check your connection and try again.', onRetry, retrying = false, children }) {
  return (
    <section className="panel tracking-error-card" role="alert" style={{ minHeight: 200 }}>
      <AlertCircle size={28} aria-hidden="true" />
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="confirmation-actions">
        {onRetry ? <button onClick={onRetry} disabled={retrying}><RefreshCw size={16} aria-hidden="true" /> {retrying ? 'Retrying…' : 'Try again'}</button> : null}
        {children}
      </div>
    </section>
  );
}

export function EmptyState({ title, message, children }) {
  return (
    <div className="empty-state" role="status">
      <ShoppingBag size={28} aria-hidden="true" />
      <strong>{title}</strong>
      {message ? <p>{message}</p> : null}
      {children}
    </div>
  );
}
