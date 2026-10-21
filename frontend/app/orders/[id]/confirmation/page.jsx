'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Bike, CheckCircle2, CreditCard, Store } from 'lucide-react';
import { api, applyTheme, inr, orderAccessQuery, rememberGuestOrder } from '../../../lib';
import { ErrorState, LoadingState } from '../../../components/AsyncState';
import { useToastMessage } from '../../../components/ui';

function statusLabel(status) {
  return String(status || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function OrderConfirmationContent() {
  const params = useParams();
  const search = useSearchParams();
  const orderId = params?.id;
  const guestAccessToken = search.get('access_token') || '';
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [message, setMessage] = useToastMessage();
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage('');
    setOrder(null);
    setItems([]);
    api('/theme').then(t => applyTheme(t.theme)).catch(() => {});
    if (guestAccessToken) rememberGuestOrder(orderId, guestAccessToken);
    const accessQuery = orderAccessQuery(orderId, guestAccessToken);
    api(`/orders/${orderId}/track${accessQuery ? `?${accessQuery}` : ''}`).then(data => {
      if (cancelled) return;
      setOrder(data.order);
      setItems(data.items || []);
    }).catch(err => { if (!cancelled) setMessage(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId, guestAccessToken, loadAttempt, setMessage]);

  const takeaway = order?.order_type === 'takeaway';

  return (
    <main className="confirmation-page">
      <nav className="container" aria-label="Breadcrumb" style={{ paddingBottom: 20 }}>
        <ol style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
          <li><Link href="/">Home</Link></li>
          <li><span aria-hidden="true">/ </span><Link href="/account">Account</Link></li>
          <li><span aria-hidden="true">/ </span><Link href={`/orders/${orderId}${orderAccessQuery(orderId) ? `?${orderAccessQuery(orderId)}` : ''}`}>{order?.order_number || 'Order'}</Link></li>
          <li aria-current="page"><span aria-hidden="true">/ </span>Confirmation</li>
        </ol>
      </nav>
      <section className="container confirmation-card">
        {loading ? <LoadingState label="Loading your order confirmation…" rows={6} /> : !order ? <ErrorState title="Order confirmation is unavailable" message={message || 'We could not retrieve this order. Please try again or open your account.'} onRetry={() => setLoadAttempt(attempt => attempt + 1)}><Link className="button ghost" href="/account">View your orders</Link><Link className="button ghost" href="/#menu">Back to menu</Link></ErrorState> : (
          <>
            <div className="success-mark"><CheckCircle2 size={34} /></div>
            <span className="eyebrow">Order placed successfully</span>
            <h1>{order.order_number}</h1>
            <p>{takeaway ? 'Takeaway / Pickup' : 'Delivery'} order received. You can track every status update from your account.</p>
            <div className="confirmation-grid">
              <div><span>Order Type</span><strong>{takeaway ? <><Store size={18} /> Takeaway / Pickup</> : <><Bike size={18} /> Delivery</>}</strong></div>
              <div><span>Payment Status</span><strong><CreditCard size={18} /> {order.payment_status}</strong></div>
              <div><span>Order Status</span><strong>{statusLabel(order.status)}</strong></div>
              {order.estimated_ready_at ? <div><span>Estimated Ready</span><strong>{order.estimated_ready_at}</strong></div> : null}
              <div><span>Paid Amount</span><strong>{inr(order.paid_amount)}</strong></div>
              <div><span>Remaining Amount</span><strong>{inr(order.remaining_amount)}</strong></div>
            </div>
            <section className="panel confirmation-details">
              <h2>{takeaway ? 'Pickup details' : 'Delivery details'}</h2>
              {takeaway ? <p>Pickup from the restaurant after confirmation. Share your order number at the counter.</p> : <p>{order.delivery_address}</p>}
              <div className="summary-items">
                {items.map(item => <div className="line-item" key={item.id}><span>{item.name_snapshot} x {item.quantity}{Number(item.free_quantity) > 0 ? ` + ${item.free_quantity} free` : ''}</span><strong>{inr(item.line_total)}</strong></div>)}
              </div>
            </section>
            <div className="action-row confirmation-actions">
              <Link className="button" href={`/orders/${order.id}${orderAccessQuery(order.id) ? `?${orderAccessQuery(order.id)}` : ''}`}>Track Order</Link>
              <Link className="button ghost" href="/account">View Order</Link>
              <Link className="button ghost" href="/#menu">Back to Menu</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default function OrderConfirmationPage() {
  return <Suspense fallback={<main className="confirmation-page"><section className="container confirmation-card"><LoadingState label="Loading your order confirmation…" rows={6} /></section></main>}><OrderConfirmationContent /></Suspense>;
}
