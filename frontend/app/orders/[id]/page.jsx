'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { CheckCircle2, Clock, CreditCard, FileText, PackageCheck, Pizza, Printer, Share2, Truck } from 'lucide-react';
import { api, applyTheme, downloadInvoice, inr, itemSelectionText, itemVariantText, openInvoice, orderAccessQuery, rememberGuestOrder, whatsappOrderSummary } from '../../lib';

const statuses = [
  ['received', Clock],
  ['accepted', CheckCircle2],
  ['preparing', Pizza],
  ['ready', PackageCheck],
  ['picked_up', PackageCheck],
  ['out_for_delivery', Truck],
  ['delivered', PackageCheck],
  ['cancelled', Clock]
];

const pickupStatuses = [
  ['received', Clock],
  ['accepted', CheckCircle2],
  ['preparing', Pizza],
  ['ready', PackageCheck],
  ['picked_up', PackageCheck],
  ['cancelled', Clock]
];

function statusLabel(status) {
  return String(status || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function OrderTrackingContent() {
  const params = useParams();
  const search = useSearchParams();
  const orderId = params?.id;
  const guestAccessToken = search.get('access_token') || '';
  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState([]);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [settings, setSettings] = useState({});
  const [deliveryBoy, setDeliveryBoy] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [viewer, setViewer] = useState(null);
  const mapRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const directionsRef = useRef(null);
  const lastRouteRef = useRef({ time: 0, lat: null, lng: null });

  const hasMapsKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  useEffect(() => {
    api('/theme').then(t => applyTheme(t.theme)).catch(() => {});
    api('/settings').then(data => setSettings(data.settings || {})).catch(() => {});
    api('/auth/me').then(data => setViewer(data.user || null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!orderId) return;
    if (guestAccessToken) rememberGuestOrder(orderId, guestAccessToken);
    let stopped = false;
    let timer = null;
    const schedule = status => {
      if (stopped || ['delivered', 'cancelled'].includes(status)) return;
      timer = setTimeout(load, document.hidden ? 20000 : 5000);
    };
    const accessQuery = orderAccessQuery(orderId, guestAccessToken);
    const load = () => api(`/orders/${orderId}/track${accessQuery ? `?${accessQuery}` : ''}`).then(data => {
      if (stopped) return;
      setOrder(data.order);
      setHistory(data.history);
      setItems(data.items || []);
      setPayments(data.payments || []);
      setDeliveryBoy(data.delivery_boy || null);
      setDriverLocation(data.driver_location || null);
      setMessage('');
      setLoading(false);
      schedule(data.order?.status);
    }).catch(err => {
      if (!stopped) {
        setMessage(err.message);
        setLoading(false);
        if (!['Order not found', 'Unauthorized', 'Account is inactive'].includes(err.message)) schedule(null);
      }
    });
    load();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, guestAccessToken]);

  useEffect(() => {
    const liveTrackingActive = order?.order_type === 'delivery' && ['picked_up', 'out_for_delivery'].includes(order?.status);
    if (!hasMapsKey || !mapLoaded || !window.google?.maps || !liveTrackingActive || !driverLocation || !order.latitude || !order.longitude) return;
    const restaurant = { lat: Number(settings.restaurant_latitude || 12.9715987), lng: Number(settings.restaurant_longitude || 77.5945627) };
    const customer = { lat: Number(order.latitude), lng: Number(order.longitude) };
    const driver = { lat: Number(driverLocation.latitude), lng: Number(driverLocation.longitude) };
    const target = document.getElementById('customer-live-map');
    if (!target) return;
    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(target, { center: driver, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      new window.google.maps.Marker({ map: mapRef.current, position: restaurant, label: 'R', title: 'Restaurant' });
      new window.google.maps.Marker({ map: mapRef.current, position: customer, label: 'C', title: 'Delivery address' });
      directionsRef.current = new window.google.maps.DirectionsRenderer({ map: mapRef.current, suppressMarkers: true, preserveViewport: true });
    }
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new window.google.maps.Marker({ map: mapRef.current, position: driver, label: 'D', title: 'Delivery partner' });
    } else {
      driverMarkerRef.current.setPosition(driver);
    }
    mapRef.current.panTo(driver);

    const moved = lastRouteRef.current.lat === null || Math.hypot(driver.lat - lastRouteRef.current.lat, driver.lng - lastRouteRef.current.lng) > 0.001;
    const elapsed = Date.now() - lastRouteRef.current.time > 30000;
    if (moved || elapsed) {
      lastRouteRef.current = { time: Date.now(), lat: driver.lat, lng: driver.lng };
      const service = new window.google.maps.DirectionsService();
      service.route({ origin: driver, destination: customer, travelMode: window.google.maps.TravelMode.DRIVING }, (result, status) => {
        if (status === 'OK' && result?.routes?.[0]?.legs?.[0]) {
          directionsRef.current?.setDirections(result);
          const leg = result.routes[0].legs[0];
          setRouteInfo({ distance: leg.distance?.text, duration: leg.duration?.text });
        }
      });
    }
  }, [driverLocation, hasMapsKey, mapLoaded, order, settings.restaurant_latitude, settings.restaurant_longitude]);

  const liveTrackingActive = order?.order_type === 'delivery' && ['picked_up', 'out_for_delivery'].includes(order?.status);
  const riderName = deliveryBoy?.name || driverLocation?.delivery_boy_name || 'Delivery partner';
  const riderPhone = deliveryBoy?.phone || driverLocation?.delivery_boy_phone || '';
  const statusList = order?.order_type === 'takeaway' ? pickupStatuses : statuses;
  const currentStatusIndex = statusList.findIndex(([status]) => status === order?.status);
  const historyStatuses = new Set(history.map(item => item.new_status));
  const notFoundDetail = viewer && viewer.role !== 'customer'
    ? `You are signed in as ${statusLabel(viewer.role)}. Please sign in with the customer account that placed this order.`
    : 'This order was not found for the current customer session, or it may belong to another customer account.';
  const invoiceAccessQuery = order ? orderAccessQuery(order.id, guestAccessToken) : '';
  const invoicePath = order ? `/orders/${order.id}/invoice${invoiceAccessQuery ? `?${invoiceAccessQuery}` : ''}` : '';

  async function viewInvoice(download = false) {
    if (!order) return;
    try {
      if (download) await downloadInvoice(invoicePath, `invoice-${order.order_number}.pdf`);
      else await openInvoice(invoicePath);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <main className="tracking-page">
      {hasMapsKey ? <Script src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`} strategy="afterInteractive" onLoad={() => setMapLoaded(true)} /> : null}
      <div className="container account-hero">
        <div>
          <span className="eyebrow">Live tracking</span>
          <h1>{order ? order.order_number : 'Order status'}</h1>
          <p>Follow preparation, {order?.order_type === 'takeaway' ? 'pickup' : 'delivery'}, and payment status without refreshing.</p>
        </div>
        <Link className="button ghost light" href={guestAccessToken ? '/#menu' : '/account'}>{guestAccessToken ? 'Back to menu' : 'Back to account'}</Link>
      </div>
      <div className="container">
        {message && order ? <p className="notice error">{message}</p> : null}
        {order ? (
          <section className="tracking-layout">
            <div className="stack">
              <section className="panel">
                <div className="panel-heading"><h2>Current status</h2><span className="badge success">{statusLabel(order.status)}</span></div>
                {liveTrackingActive ? (
                  <div className="live-delivery-panel">
                    <div>
                      <span className="eyebrow">Your delivery is on the way</span>
                      <h2>{riderName}</h2>
                      <p>{routeInfo ? `Approximately ${routeInfo.distance} away | ETA ${routeInfo.duration}` : 'Waiting for live route details...'}</p>
                      {driverLocation?.recorded_at ? <small>Last updated {driverLocation.recorded_at}</small> : <small>Waiting for delivery partner GPS...</small>}
                      {riderPhone ? <p><a className="button ghost" href={`tel:${riderPhone}`}>Call rider</a></p> : null}
                    </div>
                    {hasMapsKey ? <div id="customer-live-map" className="map-panel live-tracking-map" /> : <div className="map-fallback">Google Maps key not configured.</div>}
                  </div>
                ) : null}
                {order.estimated_ready_at && ['accepted', 'preparing', 'ready'].includes(order.status) ? (
                  <div className="ready-time-card">
                    <Clock size={20} />
                    <div><span>Estimated ready time</span><strong>{order.estimated_ready_at}</strong></div>
                  </div>
                ) : null}
                <div className="status-track">
                  {statusList.map(([status, Icon], index) => {
                    const complete = order.status !== 'cancelled' && currentStatusIndex >= 0 && index < currentStatusIndex;
                    const active = status === order.status;
                    const historical = historyStatuses.has(status);
                    const className = ['status-step', complete || historical ? 'complete' : '', active ? 'active' : '', active && status === 'cancelled' ? 'cancelled' : ''].filter(Boolean).join(' ');
                    return <div className={className} key={status}><Icon size={20} /><span>{statusLabel(status)}</span></div>;
                  })}
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading"><h2>Items</h2></div>
                {items.map(item => (
                  <div className="line-item" key={item.id}>
                    <span>
                      <strong>{item.name_snapshot}</strong>{itemVariantText(item) ? ` (${itemVariantText(item)})` : ''} x {item.quantity}{Number(item.free_quantity) > 0 ? ` + ${item.free_quantity} free` : ''}
                      {itemSelectionText(item) ? <small>{itemSelectionText(item)}</small> : null}
                      <small>Unit price: {inr(item.unit_price)}</small>
                    </span>
                    <strong>{inr(item.line_total)}</strong>
                  </div>
                ))}
              </section>
              <section className="panel">
                <div className="panel-heading"><h2>Status history</h2></div>
                <div className="timeline">{history.map(item => <p key={item.id}><span>{item.created_at}</span>{statusLabel(item.new_status)}</p>)}</div>
              </section>
            </div>
            <aside className="order-summary">
              <div className="summary-header"><h2>Payment</h2><CreditCard size={20} /></div>
              <div className="totals">
                <div><span>Order Type</span><strong>{order.order_type === 'takeaway' ? 'Takeaway / Pickup' : 'Delivery'}</strong></div>
                <div><span>Order Status</span><strong>{statusLabel(order.status)}</strong></div>
                <div><span>{order.order_type === 'takeaway' ? 'Pickup Status' : 'Delivery Status'}</span><strong>{statusLabel(order.status)}</strong></div>
                <div><span>Total</span><strong>{inr(order.total_amount)}</strong></div>
                <div><span>Paid</span><strong>{inr(order.paid_amount)}</strong></div>
                <div><span>Remaining</span><strong>{inr(order.remaining_amount)}</strong></div>
                <div className="grand"><span>Status</span><strong>{order.payment_status}</strong></div>
              </div>
              <h3>Payment history</h3>
              {payments.map(payment => <p className="small-note" key={payment.id}>{payment.created_at}: {inr(payment.amount)} | {payment.status}</p>)}
              <div className="action-row confirmation-actions">
                <button className="ghost" onClick={() => viewInvoice(false)}><FileText size={16} /> View Invoice</button>
                <button className="ghost" onClick={() => viewInvoice(true)}><Printer size={16} /> Download / Print</button>
                <a className="button ghost" href={whatsappOrderSummary(order, items)} target="_blank" rel="noreferrer"><Share2 size={16} /> Share Order on WhatsApp</a>
              </div>
            </aside>
          </section>
        ) : loading ? (
          <div className="empty-state">Loading order...</div>
        ) : (
          <section className="panel tracking-error-card">
            <span className="eyebrow">Order tracking</span>
            <h2>{message || 'Unable to load order'}</h2>
            <p>{message === 'Order not found' ? notFoundDetail : 'Please sign in with the customer account used for this order and try again.'}</p>
            <div className="confirmation-actions">
              <Link className="button" href="/account">Go to account</Link>
              <Link className="button ghost" href="/#menu">Back to menu</Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default function OrderTrackingPage() {
  return (
    <Suspense fallback={<main className="tracking-page"><div className="container account-hero">Loading order...</div></main>}>
      <OrderTrackingContent />
    </Suspense>
  );
}
