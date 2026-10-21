'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { api, applyTheme, setToken } from '../lib';
import { Toast, useToastMessage } from '../components/ui';
import { LoadingState } from '../components/AsyncState';
import { trackEvent } from '../analytics';

function LoginContent() {
  const router = useRouter();
  const search = useSearchParams();
  const initialMode = search.get('mode') === 'register' ? 'register' : 'login';
  const returnTo = search.get('return_to') || '/account';
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [guestAllowed, setGuestAllowed] = useState(true);
  const [customerLoginEnabled, setCustomerLoginEnabled] = useState(true);
  const [message, setMessage, messageTone] = useToastMessage('error');
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    Promise.all([api('/theme'), api('/settings')]).then(([themeData, settingsData]) => {
      applyTheme(themeData.theme, settingsData.settings?.customer_default_theme || 'system');
      setGuestAllowed((settingsData.settings?.customer_login_required || '0') !== '1' && (settingsData.settings?.guest_checkout_enabled || '1') === '1');
      setCustomerLoginEnabled((settingsData.settings?.customer_login_enabled || '1') === '1');
    }).catch(() => {});
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (loading || submittingRef.current) return;
    if (!customerLoginEnabled) {
      setMessage('Customer login is currently disabled.');
      return;
    }
    submittingRef.current = true;
    const attemptId = crypto.randomUUID();
    setLoading(true);
    setMessage('');
    try {
      const data = await api(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: JSON.stringify(mode === 'login' ? { email: form.email, password: form.password } : form)
      });
      if (data.user?.role !== 'customer') {
        throw new Error('Please use a customer account on this page.');
      }
      setToken(data.token);
      trackEvent(mode === 'register' ? 'sign_up' : 'login', {}, { dedupeKey: `${mode}:${attemptId}` });
      const destination = new URL(returnTo, window.location.origin);
      router.push(returnTo.startsWith('/') && destination.origin === window.location.origin ? `${destination.pathname}${destination.search}${destination.hash}` : '/account');
    } catch (err) {
      setMessage(err.message);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="account-page">
      <section className="container auth-shell">
        <div>
          <Link href="/" className="brand mark"><span className="brand-icon">TP</span><span>The Pizza House</span></Link>
          <span className="eyebrow">Customer account</span>
          <h1>{mode === 'login' ? 'Login to your account' : 'Create your account'}</h1>
          <p>Your cart is saved on this device, so you can continue checkout after signing in.</p>
        </div>
        <form className="panel auth-card" onSubmit={submit}>
          {message ? <Toast tone={messageTone} onDismiss={() => setMessage('')}>{message}</Toast> : null}
          {customerLoginEnabled ? <div className="auth-tabs">
            <button type="button" className={mode === 'login' ? 'ghost active' : 'ghost'} onClick={() => setMode('login')}><LogIn size={16} /> Login</button>
            <button type="button" className={mode === 'register' ? 'ghost active' : 'ghost'} onClick={() => setMode('register')}><UserPlus size={16} /> Register</button>
          </div> : <p className="notice warning">Customer login and registration are currently disabled by the restaurant.</p>}
          {mode === 'register' ? (
            <>
              <label>Name<input autoComplete="name" maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
              <label>Phone<input type="tel" autoComplete="tel" maxLength={30} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required /></label>
            </>
          ) : null}
          <label>Email<input type="email" autoComplete="email" maxLength={180} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={8} maxLength={72} /></label>
          <button type="submit" disabled={loading || !customerLoginEnabled}>{loading ? <Loader2 className="spin" size={16} /> : mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}{mode === 'login' ? 'Login' : 'Register'}</button>
          {guestAllowed ? <Link className="small-note" href="/#menu">Continue as guest</Link> : null}
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="account-page"><section className="container auth-shell"><LoadingState label="Loading account access" /></section></main>}><LoginContent /></Suspense>;
}
