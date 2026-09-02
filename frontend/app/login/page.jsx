'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { api, applyTheme, setToken } from '../lib';

function LoginContent() {
  const router = useRouter();
  const search = useSearchParams();
  const initialMode = search.get('mode') === 'register' ? 'register' : 'login';
  const returnTo = search.get('return_to') || '/account';
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [guestAllowed, setGuestAllowed] = useState(true);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api('/theme').then(t => applyTheme(t.theme)).catch(() => {});
    api('/settings').then(data => setGuestAllowed((data.settings?.customer_login_required || '0') !== '1')).catch(() => {});
  }, []);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const data = await api(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      if (data.user?.role !== 'customer') {
        throw new Error('Please use a customer account on this page.');
      }
      setToken(data.token);
      router.push(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/account');
    } catch (err) {
      setMessage(err.message);
    } finally {
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
          {message ? <p className="notice error">{message}</p> : null}
          <div className="auth-tabs">
            <button type="button" className={mode === 'login' ? 'ghost active' : 'ghost'} onClick={() => setMode('login')}><LogIn size={16} /> Login</button>
            <button type="button" className={mode === 'register' ? 'ghost active' : 'ghost'} onClick={() => setMode('register')}><UserPlus size={16} /> Register</button>
          </div>
          {mode === 'register' ? (
            <>
              <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
              <label>Phone<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required /></label>
            </>
          ) : null}
          <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Password<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={8} /></label>
          <button type="submit" disabled={loading}>{loading ? <Loader2 className="spin" size={16} /> : mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}{mode === 'login' ? 'Login' : 'Register'}</button>
          {guestAllowed ? <Link className="small-note" href="/#menu">Continue as guest</Link> : null}
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="account-page"><section className="container auth-shell">Loading...</section></main>}><LoginContent /></Suspense>;
}
