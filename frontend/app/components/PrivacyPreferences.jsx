'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Cookie, ShieldCheck, X } from 'lucide-react';
import { CONSENT_STORAGE_KEY, applyAnalyticsConsent, readConsent, writeConsent } from '../analytics';
import { activateDialogFocus } from './useDialogFocus';

const PrivacyContext = createContext(null);

export function usePrivacyPreferences() {
  return useContext(PrivacyContext);
}

export function CookieSettingsButton({ className = 'ghost', children = 'Cookie settings' }) {
  const privacy = usePrivacyPreferences();
  return <button type="button" className={className} onClick={() => privacy?.openPreferences()}><Cookie size={16} aria-hidden="true" />{children}</button>;
}

export function PrivacyPreferencesProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ analytics: false, marketing: false });
  const [notice, setNotice] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    const existing = readConsent();
    applyAnalyticsConsent(existing);
    setConsent(existing);
    setReady(true);
    const synchronize = event => {
      if (event.key && event.key !== CONSENT_STORAGE_KEY) return;
      const current = readConsent();
      applyAnalyticsConsent(current);
      setConsent(current);
    };
    window.addEventListener('storage', synchronize);
    return () => window.removeEventListener('storage', synchronize);
  }, []);

  const openPreferences = useCallback(() => {
    setDraft({ analytics: consent?.analytics === true, marketing: consent?.marketing === true });
    setOpen(true);
  }, [consent]);

  useEffect(() => {
    if (!open || !dialogRef.current) return undefined;
    const dialog = dialogRef.current;
    const restoreFocus = activateDialogFocus(dialog, () => setOpen(false));
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector('button')?.focus();
    return () => {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      restoreFocus();
    };
  }, [open]);

  function choose(preferences) {
    const result = writeConsent(preferences);
    setConsent(result.consent);
    setOpen(false);
    setNotice(result.persisted ? 'Your privacy preferences have been saved.' : 'Your choice applies to this visit. Browser storage is unavailable.');
  }

  return (
    <PrivacyContext.Provider value={{ consent, openPreferences }}>
      {children}
      {ready && !consent ? (
        <section className="privacy-banner" aria-labelledby="privacy-banner-title">
          <div><strong id="privacy-banner-title">Your privacy choices</strong><p>We use necessary storage for your cart, sign-in and preferences. Optional analytics helps us understand successful orders. Marketing is off by default. <Link href="/privacy">Read our privacy notice</Link>.</p></div>
          <div className="privacy-actions">
            <button type="button" onClick={() => choose({ analytics: false, marketing: false })}>Necessary only</button>
            <button type="button" className="ghost" onClick={openPreferences}>Manage preferences</button>
            <button type="button" onClick={() => choose({ analytics: true, marketing: true })}>Accept optional</button>
          </div>
        </section>
      ) : null}
      {ready && consent ? <div className="privacy-control"><CookieSettingsButton />{notice ? <span className="sr-only" role="status">{notice}</span> : null}</div> : null}
      <dialog ref={dialogRef} tabIndex={-1} className="privacy-dialog" aria-labelledby="privacy-title" aria-describedby="privacy-description" onCancel={event => { event.preventDefault(); setOpen(false); }} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
        <section className="privacy-panel">
          <header className="privacy-heading"><h2 id="privacy-title"><ShieldCheck size={24} aria-hidden="true" />Privacy preferences</h2><button type="button" className="icon-button" aria-label="Close privacy preferences" onClick={() => setOpen(false)}><X size={20} aria-hidden="true" /></button></header>
          <p id="privacy-description">Choose which optional technologies may run. You can change or withdraw consent at any time using Cookie settings. Your cart and ordering remain available with necessary storage only.</p>
          <div className="privacy-category"><div><strong>Necessary</strong><p>Cart, authentication, security, theme and these privacy choices.</p></div><span>Always on</span></div>
          <label className="privacy-category" htmlFor="privacy-analytics"><div><strong>Analytics</strong><p>Optional Google Analytics for successful sign-ins, cart actions and orders. No customer details or payment references are included in these events.</p></div><input id="privacy-analytics" type="checkbox" checked={draft.analytics} onChange={event => setDraft(current => ({ ...current, analytics: event.target.checked }))} /></label>
          <label className="privacy-category" htmlFor="privacy-marketing"><div><strong>Marketing</strong><p>Permission for optional marketing technologies. No marketing tracker is currently configured.</p></div><input id="privacy-marketing" type="checkbox" checked={draft.marketing} onChange={event => setDraft(current => ({ ...current, marketing: event.target.checked }))} /></label>
          <p className="small-note">Preferences expire after 180 days and will be requested again if our consent version changes. <Link href="/privacy">Privacy notice</Link></p>
          <div className="privacy-actions"><button type="button" className="ghost" onClick={() => choose({ analytics: false, marketing: false })}>Withdraw optional consent</button><button type="button" onClick={() => choose(draft)}>Save preferences</button></div>
        </section>
      </dialog>
      <style jsx>{`
        .privacy-banner { position: fixed; z-index: 130; inset: auto 12px 12px; max-width: 1120px; margin: auto; display: grid; gap: 14px; padding: 20px; border: 1px solid var(--border-color); border-radius: var(--card-border-radius); background: var(--card-color); color: var(--text-color); box-shadow: var(--shadow); max-height: min(60dvh, 480px); overflow: auto; padding-bottom: max(20px, env(safe-area-inset-bottom)); }
        .privacy-banner p { margin: 6px 0 0; font-size: 14px; line-height: 1.5; }
        .privacy-banner :global(a), .privacy-panel :global(a) { text-decoration: underline; text-underline-offset: 3px; }
        .privacy-actions { display: flex; flex-wrap: wrap; gap: 10px; }
        .privacy-actions button { min-height: 44px; flex: 1 1 160px; }
        .privacy-control { position: fixed; z-index: 45; bottom: max(12px, env(safe-area-inset-bottom)); left: 12px; }
        .privacy-control :global(button) { min-height: 44px; background: var(--card-color); color: var(--text-color); box-shadow: var(--soft-shadow); font-size: 12px; }
        .privacy-dialog { padding: 0; width: min(640px, calc(100% - 24px)); max-width: 640px; max-height: calc(100dvh - 32px); border: 1px solid var(--border-color); border-radius: var(--card-border-radius); background: var(--card-color); color: var(--text-color); box-shadow: var(--shadow); }
        .privacy-dialog::backdrop { background: rgba(0,0,0,.6); }
        .privacy-panel { padding: 22px; }
        .privacy-heading { display: flex; justify-content: space-between; align-items: start; gap: 12px; }
        .privacy-heading h2 { display: flex; align-items: center; gap: 8px; font-size: 23px; line-height: 1.3; }
        .privacy-heading button { flex-shrink: 0; }
        .privacy-panel p { font-size: 14px; line-height: 1.5; }
        .privacy-category { display: flex; align-items: center; justify-content: space-between; gap: 18px; border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin: 12px 0; }
        .privacy-category p { margin: 5px 0 0; }
        .privacy-category > span { white-space: nowrap; font-size: 13px; font-weight: 700; }
        .privacy-category input { flex-shrink: 0; width: 24px; height: 24px; accent-color: var(--primary-color); }
        @media (max-width: 900px) { .privacy-control { bottom: calc(90px + env(safe-area-inset-bottom)); } }
        @media (max-width: 480px) { .privacy-panel { padding: 16px; } .privacy-banner { padding: 16px; } .privacy-actions button { flex-basis: 100%; } }
      `}</style>
    </PrivacyContext.Provider>
  );
}
