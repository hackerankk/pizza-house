'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { api, applyTheme, inr, orderAccessQuery, rememberGuestOrder } from '../lib';
import { ErrorState, LoadingState } from '../components/AsyncState';
import { safeNoticeMessage, useToastMessage } from '../components/ui';

function PaymentFailureContent() {
  const search = useSearchParams();
  const orderId = search.get('order_id');
  const guestAccessToken = search.get('access_token') || '';
  const [failure, setFailure] = useState(null);
  const [order, setOrder] = useState(null);
  const [message, setMessage] = useToastMessage();
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage('');
    setOrder(null);
    setFailure(null);
    Promise.all([api('/theme'), api('/settings')]).then(([themeData, settingsData]) => applyTheme(themeData.theme, settingsData.settings?.customer_default_theme || 'system')).catch(() => {});
    try {
      const saved = JSON.parse(sessionStorage.getItem('pizza_house_payment_failure') || 'null');
      if (saved && (!orderId || String(saved.order_id) === String(orderId))) setFailure(saved);
    } catch {
      setFailure(null);
    }
    if (orderId) {
      if (guestAccessToken) rememberGuestOrder(orderId, guestAccessToken);
      const accessQuery = orderAccessQuery(orderId, guestAccessToken);
      api(`/orders/${orderId}/track${accessQuery ? `?${accessQuery}` : ''}`).then(data => { if (!cancelled) setOrder(data.order); })
        .catch(err => { if (!cancelled) setMessage(err.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else setLoading(false);
    return () => { cancelled = true; };
  }, [orderId, guestAccessToken, loadAttempt, setMessage]);

  const retryAccessQuery = orderId ? orderAccessQuery(orderId, guestAccessToken) : '';
  const retryHref = orderId ? `/checkout?retry_order_id=${encodeURIComponent(orderId)}${retryAccessQuery ? `&${retryAccessQuery}` : ''}` : '/checkout';
  const title = failure?.type === 'dismissed' ? 'Payment Cancelled' : 'Payment Failed';
  const paymentConfirmed = ['Paid', 'Partially Paid', 'COD'].includes(order?.payment_status);
  const trackingHref = order ? `/orders/${order.id}${retryAccessQuery ? `?${retryAccessQuery}` : ''}` : '/account';

  return (
    <main className="confirmation-page">
      <section className="container confirmation-card failure-card">
        <div className="failure-mark"><AlertCircle size={34} /></div>
        <span className="eyebrow">{paymentConfirmed ? 'Order status updated' : 'Payment not completed'}</span>
        <h1>{paymentConfirmed ? 'Your order is confirmed' : title}</h1>
        <p>{paymentConfirmed ? 'The latest order status confirms your order. View your order for the current payment details.' : 'Payment has not been confirmed on this page. Check your order status before retrying if your bank account was debited.'}</p>
        {message ? <ErrorState title="Order details could not be refreshed" message={message} onRetry={() => setLoadAttempt(attempt => attempt + 1)} /> : null}
        {loading ? <LoadingState label="Checking the saved payment and order details…" rows={4} /> : <div className="confirmation-grid">
          <div><span>{paymentConfirmed ? 'Payment status' : 'Reason'}</span><strong>{paymentConfirmed ? order.payment_status : safeNoticeMessage(failure?.reason) || 'Payment was not completed.'}</strong></div>
          <div><span>Order Reference</span><strong>{order?.order_number || failure?.order_number || orderId || 'Not available'}</strong></div>
          <div><span>Payment Reference</span><strong>{failure?.razorpay_payment_id || failure?.razorpay_order_id || 'Not available'}</strong></div>
          <div><span>Amount</span><strong>{failure?.amount != null || order?.total_amount != null ? inr(failure?.amount ?? order?.total_amount) : 'Not available'}</strong></div>
        </div>}
        <div className="action-row confirmation-actions">
          <Link className="button" href={paymentConfirmed ? trackingHref : retryHref}><RotateCcw size={16} /> {paymentConfirmed ? 'View confirmed order' : 'Try Payment Again'}</Link>
          <Link className="button ghost" href="/#cart">Back to Cart</Link>
          <Link className="button ghost" href="/">Go to Home</Link>
        </div>
      </section>
    </main>
  );
}

export default function PaymentFailurePage() {
  return <Suspense fallback={<main className="confirmation-page"><section className="container confirmation-card"><LoadingState label="Loading payment status…" rows={4} /></section></main>}><PaymentFailureContent /></Suspense>;
}
