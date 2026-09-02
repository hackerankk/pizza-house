'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Bike, CheckCircle2, CreditCard, FileText, Printer, Share2, Store } from 'lucide-react';
import { api, applyTheme, downloadInvoice, itemSelectionText, itemVariantText, openInvoice, orderAccessQuery, rememberGuestOrder, inr, whatsappOrderSummary } from '../lib';

function statusLabel(status) {
  return String(status || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function OrderSuccessContent() {
  const search = useSearchParams();
  const orderId = search.get('order_id');
  const guestAccessToken = search.get('access_token') || '';
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('/theme').then(t => applyTheme(t.theme)).catch(() => {});
    if (!orderId) {
      setMessage('Missing order reference.');
      return;
    }
    if (guestAccessToken) rememberGuestOrder(orderId, guestAccessToken);
    const accessQuery = orderAccessQuery(orderId, guestAccessToken);
    api(`/orders/${orderId}/track${accessQuery ? `?${accessQuery}` : ''}`).then(data => {
      setOrder(data.order);
      setItems(data.items || []);
      setPayments(data.payments || []);
    }).catch(err => setMessage(err.message));
  }, [orderId, guestAccessToken]);

  const payment = useMemo(() => payments.find(row => row.status === 'verified') || payments[payments.length - 1], [payments]);
  const takeaway = order?.order_type === 'takeaway';
  const accessQuery = order ? orderAccessQuery(order.id, guestAccessToken) : '';
  const invoicePath = order ? `/orders/${order.id}/invoice${accessQuery ? `?${accessQuery}` : ''}` : '';

  async function viewInvoice(download = false) {
    if (!order) return;
    try {
      if (download) {
        await downloadInvoice(invoicePath, `invoice-${order.order_number}.pdf`);
      } else {
        await openInvoice(invoicePath);
      }
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <main className="confirmation-page">
      <section className="container confirmation-card">
        {message ? <p className="notice error">{message}</p> : null}
        {!order ? <div className="empty-state">Loading order summary...</div> : (
          <>
            <div className="success-mark"><CheckCircle2 size={34} /></div>
            <span className="eyebrow">Order Confirmed</span>
            <h1>{order.order_number}</h1>
            <p>{takeaway ? 'Takeaway / Pickup' : 'Delivery'} order confirmed after server-side payment verification.</p>
            <div className="confirmation-grid">
              <div><span>Order ID</span><strong>{order.order_number}</strong></div>
              <div><span>Payment ID</span><strong>{order.razorpay_payment_id || payment?.razorpay_payment_id || 'Not available'}</strong></div>
              <div><span>Payment Status</span><strong><CreditCard size={18} /> {order.payment_status}</strong></div>
              <div><span>Order Status</span><strong>{statusLabel(order.status)}</strong></div>
              <div><span>Order Type</span><strong>{takeaway ? <><Store size={18} /> Takeaway</> : <><Bike size={18} /> Delivery</>}</strong></div>
              {order.estimated_ready_at ? <div><span>Estimated Ready</span><strong>{order.estimated_ready_at}</strong></div> : null}
            </div>

            <section className="panel confirmation-details">
              <h2>Order Summary</h2>
              <div className="summary-items">
                {items.map(item => (
                  <div className="line-item" key={item.id}>
                    <span>
                      <strong>{item.name_snapshot}</strong>
                      {itemVariantText(item) ? ` (${itemVariantText(item)})` : ''} x {item.quantity}{Number(item.free_quantity) > 0 ? ` + ${item.free_quantity} free` : ''}
                      {itemSelectionText(item) ? <small>{itemSelectionText(item)}</small> : null}
                      <small>Unit price: {inr(item.unit_price)}</small>
                    </span>
                    <strong>{inr(item.line_total)}</strong>
                  </div>
                ))}
              </div>
              <div className="totals">
                <div><span>Subtotal</span><strong>{inr(order.subtotal)}</strong></div>
                <div><span>Discount / Coupon</span><strong>-{inr(order.discount_amount)}</strong></div>
                {!takeaway ? <div><span>Delivery Charge</span><strong>{inr(order.delivery_charge)}</strong></div> : null}
                <div><span>Paid Now</span><strong>{inr(order.paid_amount)}</strong></div>
                <div><span>Remaining</span><strong>{inr(order.remaining_amount)}</strong></div>
                <div className="grand"><span>Total Order Amount</span><strong>{inr(order.total_amount)}</strong></div>
              </div>
            </section>

            <div className="action-row confirmation-actions">
              <button className="ghost" onClick={() => viewInvoice(false)}><FileText size={16} /> View Invoice</button>
              <button className="ghost" onClick={() => viewInvoice(true)}><Printer size={16} /> Download / Print</button>
              <a className="button ghost" href={whatsappOrderSummary(order, items)} target="_blank" rel="noreferrer"><Share2 size={16} /> Share on WhatsApp</a>
              <Link className="button" href={`/orders/${order.id}${orderAccessQuery(order.id, guestAccessToken) ? `?${orderAccessQuery(order.id, guestAccessToken)}` : ''}`}>Track Order</Link>
              <Link className="button ghost" href="/account">View Order</Link>
              <Link className="button ghost" href="/#menu">Back to Menu</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default function OrderSuccessPage() {
  return <Suspense fallback={<main className="confirmation-page"><section className="container confirmation-card">Loading order summary...</section></main>}><OrderSuccessContent /></Suspense>;
}
