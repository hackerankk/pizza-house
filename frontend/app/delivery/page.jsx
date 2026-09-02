'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { CheckCircle2, Loader2, LogOut, MapPin, Navigation, Truck } from 'lucide-react';
import { api, applyTheme, clearToken, inr, setToken, token } from '../lib';

function statusLabel(status) {
  return String(status || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const r = 6371000;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function DeliveryDashboardPage() {
  const [login, setLogin] = useState({ email: '', password: '' });
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState(null);
  const [gpsState, setGpsState] = useState({
    permission: 'Checking',
    secureContext: true,
    active: false,
    error: '',
    lastBackendSync: ''
  });
  const watchRef = useRef(null);
  const lastSentRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  const activeOrder = useMemo(() => orders.find(order => order.id === activeOrderId) || orders.find(order => order.status === 'out_for_delivery') || orders[0], [orders, activeOrderId]);
  const hasMapsKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  useEffect(() => {
    api('/theme').then(t => applyTheme(t.theme)).catch(() => {});
    refreshGeoPermission();
    setGpsState(state => ({ ...state, secureContext: typeof window === 'undefined' ? true : window.isSecureContext }));
    if (token()) {
      api('/auth/me').then(data => {
        if (data.user.role === 'delivery_boy') setUser(data.user);
        else setMessage('Please sign in with a delivery boy account.');
      }).catch(() => clearToken());
    }
    return stopTracking;
  }, []);

  async function refreshGeoPermission() {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      setGpsState(state => ({ ...state, permission: 'Prompt' }));
      return;
    }
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      const update = () => setGpsState(state => ({ ...state, permission: statusLabel(result.state) }));
      update();
      result.onchange = update;
    } catch {
      setGpsState(state => ({ ...state, permission: 'Prompt' }));
    }
  }

  useEffect(() => {
    if (!user) return;
    loadOrders();
    const timer = setInterval(loadOrders, 10000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (!hasMapsKey || !window.google?.maps || !activeOrder?.latitude || !activeOrder?.longitude) return;
    const target = document.getElementById('delivery-boy-map');
    if (!target) return;
    const destination = { lat: Number(activeOrder.latitude), lng: Number(activeOrder.longitude) };
    mapRef.current = new window.google.maps.Map(target, { center: destination, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
    new window.google.maps.Marker({ position: destination, map: mapRef.current, label: 'C', title: 'Customer' });
    if (tracking) updateDriverMarker(tracking);
  }, [activeOrder?.id, activeOrder?.latitude, activeOrder?.longitude, hasMapsKey, tracking]);

  async function deliveryLogin() {
    setLoading(true);
    setMessage('');
    try {
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify(login) });
      if (data.user.role !== 'delivery_boy') throw new Error('This account is not a delivery boy account.');
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders() {
    try {
      const data = await api('/delivery/orders');
      setOrders(data.orders || []);
    } catch (err) {
      setMessage(err.message);
    }
  }

  function updateDriverMarker(position) {
    if (!mapRef.current || !window.google?.maps) return;
    const point = { lat: position.lat, lng: position.lng };
    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({ position: point, map: mapRef.current, label: 'D', title: 'Your live location' });
    } else {
      markerRef.current.setPosition(point);
    }
    mapRef.current.panTo(point);
  }

  function gpsErrorMessage(error) {
    if (error?.code === 1) return 'Location permission denied. Please allow location access.';
    if (error?.code === 2) return 'Unable to detect location. Please enable GPS/Location services.';
    if (error?.code === 3) return 'Location request timed out. Please try again.';
    return 'Unable to access GPS location. Please try again.';
  }

  function isValidGpsPosition(pos) {
    return Number.isFinite(pos?.coords?.latitude)
      && Number.isFinite(pos?.coords?.longitude)
      && Number.isFinite(pos?.coords?.accuracy);
  }

  async function startDelivery(order) {
    console.log('GPS REQUEST STARTED');
    if (!navigator.geolocation) {
      setMessage('GPS is not available in this browser.');
      return;
    }
    if (!window.isSecureContext) {
      setGpsState(state => ({ ...state, secureContext: false, active: false, error: 'Location needs HTTPS or localhost. Open this page on a secure URL to enable GPS.' }));
      return;
    }
    try {
      setActiveOrderId(order.id);
      setMessage('Requesting GPS permission. Keep this page open so live location can update.');
      setGpsState(state => ({ ...state, error: '', active: false }));
      stopTracking(false);
      navigator.geolocation.getCurrentPosition(
        async pos => {
          console.log('GPS SUCCESS', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
          if (!isValidGpsPosition(pos)) {
            setGpsState(state => ({ ...state, active: false, error: 'GPS returned an incomplete location. Please try again.' }));
            return;
          }
          try {
            if (order.status !== 'out_for_delivery') {
              await api(`/delivery/orders/${order.id}/start`, { method: 'POST', body: JSON.stringify({}) });
            }
            await sendLocation(order.id, pos, true);
            setGpsState(state => ({ ...state, active: true, error: '' }));
            watchRef.current = navigator.geolocation.watchPosition(
              update => {
                console.log('GPS UPDATE', {
                  latitude: update.coords.latitude,
                  longitude: update.coords.longitude,
                  accuracy: update.coords.accuracy
                });
                if (!isValidGpsPosition(update)) {
                  setGpsState(state => ({ ...state, error: 'GPS update did not include valid coordinates.' }));
                  return;
                }
                sendLocation(order.id, update);
              },
              error => {
                console.log('GPS ERROR', error);
                setGpsState(state => ({ ...state, active: false, error: gpsErrorMessage(error) }));
              },
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
            loadOrders();
          } catch (err) {
            setMessage(err.message);
            setGpsState(state => ({ ...state, active: false, error: err.message }));
          }
        },
        error => {
          console.log('GPS ERROR', error);
          setGpsState(state => ({ ...state, active: false, error: gpsErrorMessage(error) }));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function sendLocation(orderId, pos, force = false) {
    const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const accuracy = pos.coords.accuracy;
    const displayTime = new Date().toLocaleTimeString();
    setTracking({ ...point, accuracy, time: displayTime });
    updateDriverMarker(point);
    if (!force) {
      const last = lastSentRef.current;
      if (last && Date.now() - last.time < 5000) return;
      if (last && distanceMeters(last, point) < 15 && Date.now() - last.time < 15000) return;
    }
    lastSentRef.current = { ...point, time: Date.now() };
    try {
      const result = await api(`/delivery/orders/${orderId}/location`, { method: 'POST', body: JSON.stringify({ latitude: point.lat, longitude: point.lng, accuracy, timestamp: new Date().toISOString() }) });
      setGpsState(state => ({ ...state, lastBackendSync: result.recorded_at || displayTime, error: '' }));
    } catch (err) {
      setMessage(err.message);
      setGpsState(state => ({ ...state, error: err.message }));
    }
  }

  function stopTracking(resetState = true) {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    lastSentRef.current = null;
    if (resetState) setGpsState(state => ({ ...state, active: false }));
  }

  async function markDelivered(order) {
    try {
      await api(`/delivery/orders/${order.id}/delivered`, { method: 'POST', body: JSON.stringify({}) });
      stopTracking();
      setTracking(null);
      setMessage('Order marked delivered.');
      loadOrders();
    } catch (err) {
      setMessage(err.message);
    }
  }

  function logout() {
    stopTracking();
    clearToken();
    setUser(null);
    setOrders([]);
  }

  if (!user) {
    return (
      <main className="delivery-page">
        <section className="delivery-login-card">
          <Truck size={34} />
          <h1>Delivery Dashboard</h1>
          {message ? <p className="notice error">{message}</p> : null}
          <input placeholder="Email" value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} />
          <input type="password" placeholder="Password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} />
          <button onClick={deliveryLogin} disabled={loading}>{loading ? <Loader2 className="spin" size={16} /> : null} Sign in</button>
          <Link className="small-note" href="/">Back to website</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="delivery-page">
      {hasMapsKey ? <Script src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`} strategy="afterInteractive" /> : null}
      <section className="container delivery-header">
        <div><span className="eyebrow">Delivery partner</span><h1>Assigned orders</h1></div>
        <button className="ghost" onClick={logout}><LogOut size={16} /> Logout</button>
      </section>
      <section className="container delivery-grid">
        <div className="delivery-order-list">
          {message ? <p className="notice error">{message}</p> : null}
          {!orders.length ? <div className="empty-state">No active assigned deliveries.</div> : orders.map(order => (
            <article className={activeOrder?.id === order.id ? 'delivery-order-card active' : 'delivery-order-card'} key={order.id} onClick={() => setActiveOrderId(order.id)}>
              <div className="summary-header"><h2>{order.order_number}</h2><span className="badge success">{statusLabel(order.status)}</span></div>
              <p><strong>{order.customer_name}</strong> | {order.customer_phone}</p>
              <p>{order.delivery_address}</p>
              <p className="small-note">{order.items_summary}</p>
              <div className="confirmation-grid">
                <div><span>Total</span><strong>{inr(order.total_amount)}</strong></div>
                <div><span>Payment</span><strong>{order.payment_status}</strong></div>
              </div>
              <div className="action-row">
                {['ready', 'picked_up', 'out_for_delivery'].includes(order.status) ? <button className="gps-enable-button" onClick={event => { event.stopPropagation(); startDelivery(order); }}><Navigation size={16} /> 📍 Enable Live Location</button> : null}
                {order.latitude && order.longitude ? <a className="button ghost" href={`https://www.google.com/maps/dir/?api=1&destination=${order.latitude},${order.longitude}`} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}><MapPin size={16} /> Open Navigation</a> : null}
                {order.status === 'out_for_delivery' ? <button className="ghost" onClick={event => { event.stopPropagation(); markDelivered(order); }}><CheckCircle2 size={16} /> Mark Delivered</button> : null}
              </div>
            </article>
          ))}
        </div>
        <aside className="delivery-map-panel">
          <h2>Live GPS</h2>
          <div className="gps-status-card">
            <div><span>Permission</span><strong>{gpsState.permission}</strong></div>
            <div><span>Secure context</span><strong>{gpsState.secureContext ? 'Yes' : 'No'}</strong></div>
            {tracking ? (
              <>
                <div className="gps-active">🟢 GPS Location Active</div>
                <div><span>Latitude</span><strong>{Number(tracking.lat).toFixed(6)}</strong></div>
                <div><span>Longitude</span><strong>{Number(tracking.lng).toFixed(6)}</strong></div>
                <div><span>Accuracy</span><strong>{Math.round(tracking.accuracy || 0)} m</strong></div>
                <div><span>Last GPS update</span><strong>{tracking.time || 'just now'}</strong></div>
                {gpsState.lastBackendSync ? <div><span>Last backend sync</span><strong>{gpsState.lastBackendSync}</strong></div> : null}
              </>
            ) : null}
            {gpsState.error ? <p className="notice error">{gpsState.error}</p> : null}
          </div>
          {hasMapsKey && activeOrder ? <div id="delivery-boy-map" className="map-panel delivery-live-map" /> : <div className="map-fallback">Google Maps key not configured or no active order selected.</div>}
          {tracking ? <p className="small-note">Last sent {tracking.time} | Accuracy {Math.round(tracking.accuracy || 0)}m</p> : <p className="small-note">Start a delivery to share live GPS updates.</p>}
        </aside>
      </section>
    </main>
  );
}
