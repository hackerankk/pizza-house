'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Home, LogOut, Plus, ShoppingBag, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, applyTheme, clearToken, inr } from '../lib';

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [address, setAddress] = useState({ label: 'Home', address_line: '', latitude: '', longitude: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/theme').then(t => applyTheme(t.theme)).catch(() => {});
    api('/auth/me')
      .then(async me => {
        if (me.user?.role !== 'customer') throw new Error('Please sign in with a customer account.');
        const [o, a] = await Promise.all([api('/account/orders'), api('/account/addresses')]);
        setUser(me.user);
        setOrders(o.orders);
        setAddresses(a.addresses);
      })
      .catch(err => setMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api('/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
    clearToken();
    router.push('/login');
  }

  async function saveAddress() {
    try {
      await api('/account/addresses', { method: 'POST', body: JSON.stringify(address) });
      const data = await api('/account/addresses');
      setAddresses(data.addresses);
      setAddress({ label: 'Home', address_line: '', latitude: '', longitude: '' });
      setMessage('Address saved.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function enablePush() {
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error('VAPID public key is not configured.');
      const registration = await navigator.serviceWorker.register('/push-sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
      await api('/notifications/subscribe', { method: 'POST', body: JSON.stringify(subscription) });
      setMessage('Browser notifications enabled.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <main className="account-page">
      <div className="container account-hero">
        <div>
          <span className="eyebrow">Customer account</span>
          <h1>Your orders and addresses</h1>
          <p>Track active orders, review payment status, and keep delivery locations ready for checkout.</p>
        </div>
        <div className="action-row">
          {user ? <button className="ghost light" onClick={logout}><LogOut size={16} /> Logout</button> : null}
          <Link className="button ghost light" href="/">Back to menu</Link>
        </div>
      </div>
      <div className="container">
        {message ? <p className="notice">{message}</p> : null}
        {loading ? <div className="empty-state">Loading account...</div> : null}
        {!loading && !user ? (
          <section className="panel tracking-error-card">
            <span className="eyebrow">Customer login</span>
            <h2>Sign in to view your account</h2>
            <p>Your cart stays saved while you login or register.</p>
            <div className="confirmation-actions">
              <Link className="button" href="/login?return_to=/account">Login / Register</Link>
              <Link className="button ghost" href="/#menu">Back to menu</Link>
            </div>
          </section>
        ) : null}
        {user ? <section className="account-layout">
          <div className="stack">
            <article className="profile-card">
              <div className="profile-avatar"><UserRound size={26} /></div>
              <div><span className="eyebrow">Profile</span><h2>{user?.name || 'Signed in customer'}</h2><p>{user?.email}</p></div>
            </article>
            <section className="panel">
              <div className="panel-heading"><h2>Order history</h2><p>{orders.length ? `${orders.length} orders found` : 'No orders yet'}</p></div>
              <div className="order-card-list">
                {orders.map(order => (
                  <article className="order-card" key={order.id}>
                    <div><strong>{order.order_number}</strong><p>{order.created_at}</p></div>
                    <span className="badge">{order.status}</span>
                    <div><span>Total</span><strong>{inr(order.total_amount)}</strong></div>
                    <div><span>Remaining</span><strong>{inr(order.remaining_amount)}</strong></div>
                    <Link className="button ghost" href={`/orders/${order.id}`}>View order</Link>
                  </article>
                ))}
                {!orders.length ? <div className="empty-state"><ShoppingBag size={28} /><strong>No orders yet</strong><p>Your first pizza order will appear here.</p></div> : null}
              </div>
            </section>
          </div>
          <aside className="stack">
            <section className="panel">
              <div className="panel-heading"><h2>Notifications</h2><p>Enable browser alerts for order status updates.</p></div>
              <button onClick={enablePush}><Bell size={16} /> Enable browser notifications</button>
            </section>
            <section className="panel">
              <div className="panel-heading"><h2>Saved addresses</h2><p>Use precise coordinates for delivery calculation.</p></div>
              <div className="address-list">
                {addresses.map(item => (
                  <article className="address-card" key={item.id}>
                    <Home size={18} />
                    <div><strong>{item.label}</strong><p>{item.address_line}</p><span>{item.latitude}, {item.longitude}</span></div>
                  </article>
                ))}
              </div>
              <div className="form-grid">
                <input placeholder="Label" value={address.label} onChange={e => setAddress({ ...address, label: e.target.value })} />
                <textarea placeholder="Address" value={address.address_line} onChange={e => setAddress({ ...address, address_line: e.target.value })} />
                <div className="form-grid two">
                  <input placeholder="Latitude" value={address.latitude} onChange={e => setAddress({ ...address, latitude: e.target.value })} />
                  <input placeholder="Longitude" value={address.longitude} onChange={e => setAddress({ ...address, longitude: e.target.value })} />
                </div>
              </div>
              <button onClick={saveAddress}><Plus size={16} /> Save address</button>
            </section>
          </aside>
        </section> : null}
      </div>
    </main>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
