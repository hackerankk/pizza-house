'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { CheckCircle2, Loader2, LogOut, MapPin, Navigation, Truck } from 'lucide-react';
import { api, applyTheme, clearToken, inr, setToken, token } from '../lib';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState';
import { Toast, useToastMessage } from '../components/ui';
import { reducedMotionPreferred } from '../motion';

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
  const [message, setMessage, messageTone] = useToastMessage();
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState('');
  const [tracking, setTracking] = useState(null);
  const [mapsKey, setMapsKey] = useState('');
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState('');
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [directionsError, setDirectionsError] = useState('');
  const [gpsState, setGpsState] = useState({
    permission: 'Checking',
    secureContext: true,
    active: false,
    error: '',
    lastBackendSync: ''
  });
  const watchRef = useRef(null);
  const lastSentRef = useRef(null);
  const permissionStatusRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const locationRequestRef = useRef(0);

  const activeOrder = useMemo(() => orders.find(order => order.id === activeOrderId) || orders.find(order => order.status === 'out_for_delivery') || orders[0], [orders, activeOrderId]);
  const hasMapsKey = Boolean(mapsKey);

  useEffect(() => {
    setSessionLoading(true);
    setSessionError(false);
    api('/theme').then(t => applyTheme(t.theme)).catch(() => {});
    api('/settings').then(data => setMapsKey(data.google_maps_api_key || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '')).catch(() => {
      setMapsKey(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '');
    });
    refreshGeoPermission();
    setGpsState(state => ({ ...state, secureContext: typeof window === 'undefined' ? true : window.isSecureContext }));
    if (token('delivery')) {
      api('/auth/me', { authScope: 'delivery' }).then(data => {
        if (data.user.role === 'delivery_boy') setUser(data.user);
        else setMessage('Please sign in with a delivery boy account.');
      }).catch(err => {
        if ([401, 403].includes(err.status)) clearToken('delivery');
        else setSessionError(true);
      }).finally(() => setSessionLoading(false));
    } else setSessionLoading(false);
    return () => {
      stopTracking();
      if (permissionStatusRef.current) permissionStatusRef.current.onchange = null;
      permissionStatusRef.current = null;
    };
  }, [sessionAttempt, setMessage]);

  async function refreshGeoPermission() {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      setGpsState(state => ({ ...state, permission: 'Prompt' }));
      return;
    }
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      const update = () => setGpsState(state => ({ ...state, permission: statusLabel(result.state) }));
      if (permissionStatusRef.current) permissionStatusRef.current.onchange = null;
      permissionStatusRef.current = result;
      update();
      result.onchange = update;
    } catch {
      setGpsState(state => ({ ...state, permission: 'Prompt' }));
    }
  }

  useEffect(() => {
    if (!user) return;
    loadOrders(true);
    const timer = setInterval(loadOrders, 10000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (!hasMapsKey || !mapsReady || !window.google?.maps || !activeOrder?.latitude || !activeOrder?.longitude) return;
    const target = document.getElementById('delivery-boy-map');
    if (!target) return;
    const destination = { lat: Number(activeOrder.latitude), lng: Number(activeOrder.longitude) };
    mapRef.current = new window.google.maps.Map(target, { center: destination, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
    new window.google.maps.Marker({ position: destination, map: mapRef.current, label: 'C', title: 'Customer' });
    return () => {
      if (mapRef.current) window.google.maps.event.clearInstanceListeners(mapRef.current);
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [activeOrder?.id, activeOrder?.latitude, activeOrder?.longitude, hasMapsKey, mapsReady]);

  useEffect(() => {
    if (tracking) updateDriverMarker(tracking);
  }, [tracking, mapsReady, activeOrder?.id]);

  async function deliveryLogin() {
    setLoading(true);
    setMessage('');
    try {
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify(login), authScope: 'delivery' });
      if (data.user.role !== 'delivery_boy') throw new Error('This account is not a delivery boy account.');
      setToken(data.token, 'delivery');
      setUser(data.user);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders(showLoading = false) {
    if (showLoading) setOrdersLoading(true);
    try {
      const data = await api('/delivery/orders');
      setOrders(data.orders || []);
      setOrdersError('');
    } catch (err) {
      setOrdersError(err.message);
    } finally {
      setOrdersLoading(false);
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
    if (reducedMotionPreferred()) mapRef.current.setCenter(point);
    else mapRef.current.panTo(point);
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
      setMessage('Requesting GPS permission. Keep this page open so live location can update.', 'info');
      setGpsState(state => ({ ...state, error: '', active: false }));
      stopTracking(false);
      const request = ++locationRequestRef.current;
      navigator.geolocation.getCurrentPosition(
        async pos => {
          if (request !== locationRequestRef.current) return;
          if (!isValidGpsPosition(pos)) {
            setGpsState(state => ({ ...state, active: false, error: 'GPS returned an incomplete location. Please try again.' }));
            return;
          }
          try {
            if (order.status !== 'out_for_delivery') {
              await api(`/delivery/orders/${order.id}/start`, { method: 'POST', body: JSON.stringify({}) });
            }
            if (request !== locationRequestRef.current) return;
            await sendLocation(order.id, pos, true);
            if (request !== locationRequestRef.current) return;
            setGpsState(state => ({ ...state, active: true, error: '' }));
            watchRef.current = navigator.geolocation.watchPosition(
              update => {
                if (request !== locationRequestRef.current) return;
                if (!isValidGpsPosition(update)) {
                  setGpsState(state => ({ ...state, error: 'GPS update did not include valid coordinates.' }));
                  return;
                }
                sendLocation(order.id, update);
              },
              error => {
                if (request !== locationRequestRef.current) return;
                setGpsState(state => ({ ...state, active: false, error: gpsErrorMessage(error) }));
              },
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
            loadOrders();
          } catch (err) {
            if (request !== locationRequestRef.current) return;
            setMessage(err.message);
            setGpsState(state => ({ ...state, active: false, error: err.message }));
          }
        },
        error => {
          if (request !== locationRequestRef.current) return;
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
      if (force) throw err;
    }
  }

  function stopTracking(resetState = true) {
    ++locationRequestRef.current;
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    lastSentRef.current = null;
    if (resetState) setGpsState(state => ({ ...state, active: false }));
  }

  async function markDelivered(order) {
    try {
      await api(`/delivery/orders/${order.id}/delivered`, { method: 'POST', body: JSON.stringify({}) });
      stopTracking();
      setTracking(null);
      setMessage('Order marked delivered.', 'success');
      loadOrders();
    } catch (err) {
      setMessage(err.message);
    }
  }

  function browserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('GPS is not available in this browser.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (!isValidGpsPosition(pos)) {
            reject(new Error('GPS returned an incomplete location. Please try again.'));
            return;
          }
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        error => reject(new Error(gpsErrorMessage(error))),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  async function getDirections(order) {
    setDirectionsError('');
    if (!order?.latitude || !order?.longitude) {
      setDirectionsError('Customer delivery coordinates are not available for this order.');
      return;
    }
    setDirectionsLoading(true);
    try {
      let origin = tracking ? { lat: Number(tracking.lat), lng: Number(tracking.lng) } : null;
      if (!origin) {
        try {
          origin = await browserLocation();
        } catch (gpsError) {
          if (order.driver_latitude && order.driver_longitude) {
            origin = { lat: Number(order.driver_latitude), lng: Number(order.driver_longitude) };
          } else {
            throw gpsError;
          }
        }
      }
      if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
        throw new Error('Rider location is unavailable. Enable live location and try again.');
      }
      const destination = { lat: Number(order.latitude), lng: Number(order.longitude) };
      if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
        throw new Error('Customer delivery coordinates are invalid.');
      }
      const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${origin.lat},${origin.lng}`)}&destination=${encodeURIComponent(`${destination.lat},${destination.lng}`)}&travelmode=driving`;
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
        window.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      setDirectionsError(err.message);
    } finally {
      setDirectionsLoading(false);
    }
  }

  function logout() {
    stopTracking();
    clearToken('delivery');
    setUser(null);
    setOrders([]);
    setOrdersError('');
    setOrdersLoading(true);
  }

  if (sessionLoading) return <main className="delivery-page"><section className="delivery-login-card"><h1>Delivery Dashboard</h1><LoadingState label="Checking your delivery session…" /></section></main>;
  if (sessionError) return <main className="delivery-page"><section className="delivery-login-card"><h1>Delivery Dashboard</h1><ErrorState title="Your session could not be checked" message="Please check your connection and try again." onRetry={() => setSessionAttempt(attempt => attempt + 1)} /></section></main>;

  if (!user) {
    return (
      <main className="delivery-page">
        <section className="delivery-login-card">
          <Truck size={34} />
          <h1>Delivery Dashboard</h1>
          {message ? <Toast tone={messageTone} onDismiss={() => setMessage('')}>{message}</Toast> : null}
          <input aria-label="Delivery account email" type="email" autoComplete="username" placeholder="Email" value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} />
          <input aria-label="Password" type="password" autoComplete="current-password" placeholder="Password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} />
          <button onClick={deliveryLogin} disabled={loading}>{loading ? <Loader2 className="spin" size={16} /> : null} Sign in</button>
          <Link className="small-note" href="/">Back to website</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="delivery-page">
      {hasMapsKey ? <Script src={`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}`} strategy="afterInteractive" onReady={() => { setMapsReady(true); setMapsError(''); }} onError={() => setMapsError('The map could not load. You can still open directions for an assigned delivery.')} /> : null}
      <section className="container delivery-header">
        <div><span className="eyebrow">Delivery partner</span><h1>Assigned orders</h1></div>
        <button className="ghost" onClick={logout}><LogOut size={16} /> Logout</button>
      </section>
      <section className="container delivery-grid">
        <div className="delivery-order-list">
          {message && message !== gpsState.error ? <Toast tone={messageTone} onDismiss={() => setMessage('')}>{message}</Toast> : null}
          {ordersLoading ? <LoadingState label="Loading assigned deliveries…" cards={2} rows={4} /> : null}
          {ordersError ? <ErrorState title="Assigned orders could not be refreshed" message={`${ordersError}${orders.length ? ' Your last available assignments are shown below.' : ''}`} onRetry={() => loadOrders(true)} retrying={ordersLoading} /> : null}
          {!ordersLoading && !ordersError && !orders.length ? <EmptyState title="No active deliveries" message="New assignments will appear here automatically. You can also check again now."><button className="ghost" onClick={() => loadOrders(true)}>Refresh assignments</button></EmptyState> : !ordersLoading ? orders.map(order => (
            <article className={activeOrder?.id === order.id ? 'delivery-order-card active' : 'delivery-order-card'} key={order.id} onClick={() => setActiveOrderId(order.id)}>
              <div className="summary-header"><h2><button className="ghost" aria-label={`Select delivery ${order.order_number}`} aria-pressed={activeOrder?.id === order.id} onClick={() => setActiveOrderId(order.id)}>{order.order_number}</button></h2><span className="badge success">{statusLabel(order.status)}</span></div>
              <p><strong>{order.customer_name}</strong> | {order.customer_phone}</p>
              <p>{order.delivery_address}</p>
              <p className="small-note">{order.items_summary}</p>
              <div className="confirmation-grid">
                <div><span>Total</span><strong>{inr(order.total_amount)}</strong></div>
                <div><span>Payment</span><strong>{order.payment_status}</strong></div>
              </div>
              <div className="action-row">
                {['ready', 'picked_up', 'out_for_delivery'].includes(order.status) ? <button className="gps-enable-button" onClick={event => { event.stopPropagation(); startDelivery(order); }}><Navigation size={16} /> 📍 Enable Live Location</button> : null}
                {order.latitude && order.longitude ? <button className="ghost" onClick={event => { event.stopPropagation(); getDirections(order); }} disabled={directionsLoading}><MapPin size={16} /> {directionsLoading ? 'Opening...' : 'Get Directions'}</button> : null}
                {order.status === 'out_for_delivery' ? <button className="ghost" onClick={event => { event.stopPropagation(); markDelivered(order); }}><CheckCircle2 size={16} /> Mark Delivered</button> : null}
              </div>
              {directionsError && activeOrder?.id === order.id ? <p className="notice error">{directionsError}</p> : null}
            </article>
          )) : null}
        </div>
        <aside className="delivery-map-panel">
          <h2>Live GPS</h2>
          {mapsError ? <p className="notice error" role="alert">{mapsError}</p> : null}
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
