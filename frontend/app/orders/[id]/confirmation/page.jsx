'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bike, CheckCircle2, CreditCard, Store } from 'lucide-react';
import { api, applyTheme, inr } from '../../../lib';

function statusLabel(status) {
  return String(status || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function OrderConfirmationPage({ params }) {
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('/theme').then(t => applyTheme(t.theme)).catch(() => {});
    api(`/orders/${params.id}/track`).then(data => {
      setOrder(data.order);
      setItems(data.items || []);
    }).catch(err => setMessage(err.message));
  }, [params.id]);

  const takeaway = order?.order_type === 'takeaway';

  return (
    <main className="confirmation-page">
      <section className="container confirmation-card">
        {message ? <p className="notice error">{message}</p> : null}
        {!order ? <div className="empty-state">Loading order confirmation...</div> : (
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
              <Link className="button" href={`/orders/${order.id}`}>Track Order</Link>
              <Link className="button ghost" href="/account">View Order</Link>
              <Link className="button ghost" href="/#menu">Back to Menu</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
