'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { api, applyTheme, inr, orderAccessQuery, rememberGuestOrder } from '../lib';

function PaymentFailureContent() {
  const search = useSearchParams();
  const orderId = search.get('order_id');
  const guestAccessToken = search.get('access_token') || '';
  const [failure, setFailure] = useState(null);
  const [order, setOrder] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('/theme').then(t => applyTheme(t.theme)).catch(() => {});
    try {
      const saved = JSON.parse(sessionStorage.getItem('pizza_house_payment_failure') || 'null');
      if (saved && (!orderId || String(saved.order_id) === String(orderId))) setFailure(saved);
    } catch {
      setFailure(null);
    }
    if (orderId) {
      if (guestAccessToken) rememberGuestOrder(orderId, guestAccessToken);
      const accessQuery = orderAccessQuery(orderId, guestAccessToken);
      api(`/orders/${orderId}/track${accessQuery ? `?${accessQuery}` : ''}`).then(data => setOrder(data.order)).catch(err => setMessage(err.message));
    }
  }, [orderId, guestAccessToken]);

  const retryAccessQuery = orderId ? orderAccessQuery(orderId, guestAccessToken) : '';
  const retryHref = orderId ? `/checkout?retry_order_id=${encodeURIComponent(orderId)}${retryAccessQuery ? `&${retryAccessQuery}` : ''}` : '/checkout';
  const title = failure?.type === 'dismissed' ? 'Payment Cancelled' : 'Payment Failed';

  return (
    <main className="confirmation-page">
      <section className="container confirmation-card failure-card">
        <div className="failure-mark"><AlertCircle size={34} /></div>
        <span className="eyebrow">Payment not completed</span>
        <h1>{title}</h1>
        <p>Your order has not been marked paid. Retry payment from checkout or return to your cart.</p>
        {message ? <p className="notice error">{message}</p> : null}
        <div className="confirmation-grid">
          <div><span>Reason</span><strong>{failure?.reason || 'Payment was not completed.'}</strong></div>
          <div><span>Order Reference</span><strong>{order?.order_number || failure?.order_number || orderId || 'Not available'}</strong></div>
          <div><span>Payment Reference</span><strong>{failure?.razorpay_payment_id || failure?.razorpay_order_id || 'Not available'}</strong></div>
          <div><span>Amount</span><strong>{inr(failure?.amount ?? order?.total_amount ?? 0)}</strong></div>
        </div>
        <div className="action-row confirmation-actions">
          <Link className="button" href={retryHref}><RotateCcw size={16} /> Try Payment Again</Link>
          <Link className="button ghost" href="/#cart">Back to Cart</Link>
          <Link className="button ghost" href="/">Go to Home</Link>
        </div>
      </section>
    </main>
  );
}

export default function PaymentFailurePage() {
  return <Suspense fallback={<main className="confirmation-page"><section className="container confirmation-card">Loading payment status...</section></main>}><PaymentFailureContent /></Suspense>;
}
