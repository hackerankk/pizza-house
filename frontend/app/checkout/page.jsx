'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { Bike, CheckCircle2, CreditCard, Home, Loader2, LogIn, MapPin, Minus, Plus, ShoppingBag, Store, Trash2, UserRound } from 'lucide-react';
import { api, applyTheme, guestOrderToken, inr, orderAccessQuery, productImage, readCart, rememberGuestOrder, saveCart, token } from '../lib';

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState({});
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [cart, setCart] = useState([]);
  const [cartReady, setCartReady] = useState(false);
  const [orderType, setOrderType] = useState('delivery');
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [customerSession, setCustomerSession] = useState(null);
  const [delivery, setDelivery] = useState({ address: '', latitude: '', longitude: '' });
  const [addresses, setAddresses] = useState([]);
  const [couponCode, setCouponCode] = useState('');
  const [paymentMode, setPaymentMode] = useState('full');
  const [preview, setPreview] = useState(null);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [loading, setLoading] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(true);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  const [mapsError, setMapsError] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const autocompleteRef = useRef(null);
  const autocompleteInputRef = useRef(null);

  useEffect(() => {
    setCart(readCart());
    setCartReady(true);
    setCouponCode(localStorage.getItem('pizza_house_coupon') || '');
    Promise.all([api('/theme'), api('/settings')])
      .then(([themeData, settingsData]) => {
        applyTheme(themeData.theme || {});
        setSettings(settingsData.settings || {});
        setRazorpayKeyId(settingsData.razorpay_key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '');
      })
      .catch(err => notify(err.message, 'error'));
    if (token()) {
      api('/auth/me').then(data => {
        if (data.user?.role === 'customer') {
          setCustomerSession(data.user);
          setCustomer(c => ({ ...c, name: data.user.name || c.name, phone: data.user.phone || c.phone, email: data.user.email || c.email }));
          api('/account/addresses').then(addressData => setAddresses(addressData.addresses || [])).catch(() => {});
        }
      }).catch(() => {});
    }
    const retryOrderId = searchParams.get('retry_order_id');
    if (retryOrderId) {
      try {
        const saved = JSON.parse(sessionStorage.getItem('pizza_house_pending_payment') || 'null');
        if (saved?.order?.id && String(saved.order.id) === String(retryOrderId) && saved.razorpay_order) {
          setPendingPayment(saved);
          notify('Payment retry is ready. Your cart and Razorpay order reference were preserved.', 'info');
        }
      } catch {
        setPendingPayment(null);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (cartReady) saveCart(cart);
    setPreview(null);
    setPendingPayment(null);
  }, [cart, orderType, cartReady]);

  useEffect(() => {
    if (orderType === 'takeaway') {
      setPaymentMode('full');
      setPreview(null);
    }
  }, [orderType]);

  const hasGoogleMapsKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  const googleMapsReady = mapLoaded && hasGoogleMapsKey && typeof window !== 'undefined' && Boolean(window.google?.maps);

  function handleMapsLoaded() {
    if (!window.google?.maps) {
      setMapsError('Google Maps script loaded but window.google.maps is unavailable. Check Maps JavaScript API access for NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.');
      return;
    }
    setMapsError('');
    setMapLoaded(true);
  }

  const reverseGeocode = useCallback(async (lat, lng) => {
    if (!geocoderRef.current) return null;
    try {
      const result = await geocoderRef.current.geocode({ location: { lat, lng } });
      return result?.results?.[0]?.formatted_address || null;
    } catch {
      setLocationStatus('Could not convert this pin location into a readable address. You can still enter the address manually.');
      return null;
    }
  }, []);

  const syncMapMarker = useCallback((lat, lng, zoom = 17) => {
    if (!googleMapsReady || !mapRef.current || !markerRef.current) return;
    const position = { lat, lng };
    markerRef.current.setPosition(position);
    mapRef.current.panTo(position);
    mapRef.current.setZoom(zoom);
  }, [googleMapsReady]);

  const updateSelectedLocation = useCallback(async (lat, lng, address = null, options = {}) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setLocationLoading(true);
    setLocationStatus(options.status || 'Updating selected location...');
    syncMapMarker(lat, lng, options.zoom || 17);
    const readableAddress = address || await reverseGeocode(lat, lng);
    setDelivery(current => ({
      ...current,
      address: readableAddress || current.address,
      latitude: Number(lat).toFixed(7),
      longitude: Number(lng).toFixed(7)
    }));
    setPreview(null);
    setLocationConfirmed(false);
    setLocationStatus(readableAddress ? 'Location selected. Confirm it to continue checkout.' : 'Location selected. Add or confirm the address to continue.');
    setLocationLoading(false);
  }, [reverseGeocode, syncMapMarker]);

  useEffect(() => {
    if (orderType === 'delivery') return;
    mapRef.current = null;
    markerRef.current = null;
    geocoderRef.current = null;
    autocompleteRef.current = null;
  }, [orderType]);

  useEffect(() => {
    if (!googleMapsReady || orderType !== 'delivery' || !locationPickerOpen || mapRef.current) return;
    const target = document.getElementById('checkout-map');
    if (!target) return;
    if (!window.google?.maps?.Map || !window.google?.maps?.Marker || !window.google?.maps?.Geocoder) {
      setMapsError('Google Maps JavaScript API loaded, but required Maps classes are unavailable. Enable Maps JavaScript API and Geocoding API for this key.');
      return;
    }
    const start = {
      lat: Number(delivery.latitude) || Number(settings.restaurant_latitude) || 12.9715987,
      lng: Number(delivery.longitude) || Number(settings.restaurant_longitude) || 77.5945627
    };
    mapRef.current = new window.google.maps.Map(target, {
      center: start,
      zoom: Number(delivery.latitude) && Number(delivery.longitude) ? 17 : 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true
    });
    markerRef.current = new window.google.maps.Marker({
      position: start,
      map: mapRef.current,
      draggable: true,
      title: 'Drag to your exact delivery location'
    });
    geocoderRef.current = new window.google.maps.Geocoder();

    mapRef.current.addListener('click', event => updateSelectedLocation(event.latLng.lat(), event.latLng.lng()));
    markerRef.current.addListener('dragend', event => updateSelectedLocation(event.latLng.lat(), event.latLng.lng(), null, { status: 'Reading address from pin location...' }));
  }, [delivery.latitude, delivery.longitude, googleMapsReady, locationPickerOpen, orderType, settings.restaurant_latitude, settings.restaurant_longitude, updateSelectedLocation]);

  useEffect(() => {
    if (!googleMapsReady || !locationPickerOpen || !autocompleteInputRef.current || autocompleteRef.current) return;
    if (!window.google?.maps?.places?.Autocomplete) {
      setMapsError('Google Maps loaded, but Places search is unavailable. Enable Places API for NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.');
      return;
    }
    autocompleteRef.current = new window.google.maps.places.Autocomplete(autocompleteInputRef.current, {
      fields: ['formatted_address', 'geometry', 'name'],
      types: ['geocode']
    });
    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace();
      const location = place?.geometry?.location;
      if (!location) {
        setLocationStatus('Select a suggestion from the search list so the map can place the pin.');
        return;
      }
      updateSelectedLocation(location.lat(), location.lng(), place.formatted_address || place.name || null, { status: 'Location found from search.' });
    });
  }, [googleMapsReady, locationPickerOpen, updateSelectedLocation]);

  function notify(text, type = 'info') {
    setMessage(text);
    setMessageType(type);
  }

  const subtotal = cart.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = Number(preview?.total ?? subtotal);
  const advance = useMemo(() => {
    if (orderType === 'takeaway' || paymentMode === 'full') return total;
    if (paymentMode === 'cod') return 0;
    const value = Number(settings.partial_payment_value || 0);
    const amount = settings.partial_payment_type === 'fixed' ? value : total * (value / 100);
    return Math.min(Math.max(amount, 0), total);
  }, [orderType, paymentMode, settings.partial_payment_type, settings.partial_payment_value, total]);
  const remaining = Math.max(total - advance, 0);

  function cartPayload() {
    return cart.map(item => ({
      id: item.id,
      variant_id: item.variant_id || null,
      option_ids: item.option_ids || [],
      quantity: item.quantity
    }));
  }

  function qty(key, delta) {
    setCart(current => current.map(line => (line.key || line.id) === key ? { ...line, quantity: line.quantity + delta } : line).filter(line => line.quantity > 0));
  }

  function selectAddress(address) {
    setDelivery({ address: address.address_line, latitude: address.latitude, longitude: address.longitude });
    setPreview(null);
    setLocationConfirmed(true);
    setLocationPickerOpen(false);
    syncMapMarker(Number(address.latitude), Number(address.longitude));
  }

  async function saveAddress() {
    try {
      await api('/account/addresses', { method: 'POST', body: JSON.stringify({ label: 'Checkout', address_line: delivery.address, latitude: delivery.latitude, longitude: delivery.longitude }) });
      const saved = await api('/account/addresses');
      setAddresses(saved.addresses || []);
      notify('Address saved.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  async function validateCart() {
    if (orderType === 'delivery' && (!delivery.latitude || !delivery.longitude)) {
      throw new Error('Choose and confirm your delivery location before calculating delivery.');
    }
    const body = {
      order_type: orderType,
      items: cartPayload(),
      coupon_code: couponCode
    };
    if (orderType === 'delivery') {
      body.latitude = delivery.latitude;
      body.longitude = delivery.longitude;
    }
    const data = await api('/cart/validate', { method: 'POST', body: JSON.stringify(body) });
    setPreview(data);
    notify(data.discount > 0 ? 'Coupon applied and order total updated.' : 'Order total validated.', 'success');
    return data;
  }

  async function useDeviceLocation() {
    if (!navigator.geolocation) {
      notify('Geolocation is not available in this browser.', 'error');
      return;
    }
    setLocationLoading(true);
    setLocationStatus('Waiting for browser location permission...');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        await updateSelectedLocation(pos.coords.latitude, pos.coords.longitude, null, { status: 'Reading your current location...' });
        notify('Location detected. Confirm the pin to continue.', 'success');
      },
      () => {
        setLocationLoading(false);
        setLocationStatus('Location permission was denied. Search for your address or move the pin manually.');
        notify('Location permission was denied. Search or move the pin manually.', 'error');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  async function confirmLocation() {
    try {
      if (!delivery.latitude || !delivery.longitude) throw new Error('Choose a map pin or use your current location first.');
      if (!delivery.address.trim()) throw new Error('Add a readable delivery address before confirming.');
      setLocationConfirmed(true);
      setLocationPickerOpen(false);
      mapRef.current = null;
      markerRef.current = null;
      autocompleteRef.current = null;
      notify('Delivery location confirmed.', 'success');
      if (cart.length) await validateCart();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  function changeLocation() {
    mapRef.current = null;
    markerRef.current = null;
    autocompleteRef.current = null;
    setLocationPickerOpen(true);
    setLocationConfirmed(false);
    if (delivery.latitude && delivery.longitude) {
      syncMapMarker(Number(delivery.latitude), Number(delivery.longitude));
    }
  }

  async function placeOrder() {
    if (loading) return;
    setLoading(true);
    try {
      if (!cart.length) throw new Error('Cart is empty');
      const loginRequired = (settings.customer_login_required || '0') === '1';
      if (loginRequired && !customerSession) throw new Error('Please register or login before placing the order.');
      if (!customerSession) {
        if (!customer.name.trim()) throw new Error('Guest name is required.');
        if (!customer.phone.trim()) throw new Error('Guest phone is required.');
        if (customer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) throw new Error('Enter a valid guest email address.');
      }
      if (orderType === 'delivery') {
        if (!delivery.latitude || !delivery.longitude) throw new Error('Choose and confirm your delivery location before placing the order.');
        if (!delivery.address.trim()) throw new Error('Delivery address is required.');
      }
      if (pendingPayment?.razorpay_order && pendingPayment?.order?.id) {
        await launchRazorpay(pendingPayment);
        return;
      }
      if (!preview) await validateCart();
      const body = {
        order_type: orderType,
        items: cartPayload(),
        coupon_code: couponCode,
        payment_mode: orderType === 'takeaway' ? 'full' : paymentMode,
        idempotency_key: crypto.randomUUID()
      };
      if (orderType === 'delivery') {
        body.delivery_address = delivery.address;
        body.latitude = delivery.latitude;
        body.longitude = delivery.longitude;
      }
      if (!customerSession) {
        body.guest = {
          name: customer.name.trim(),
          phone: customer.phone.trim(),
          email: customer.email.trim()
        };
      }
      const data = await api('/orders', { method: 'POST', headers: { 'X-Idempotency-Key': body.idempotency_key }, body: JSON.stringify(body) });
      if (data.razorpay_order && data.pay_now > 0) {
        sessionStorage.setItem('pizza_house_pending_payment', JSON.stringify(data));
        setPendingPayment(data);
        await launchRazorpay(data);
      } else {
        finishOrder(data.order.id, data.guest_access_token);
      }
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function finishOrder(orderId, guestAccessToken = '') {
    const accessToken = guestAccessToken || guestOrderToken(orderId);
    if (accessToken) rememberGuestOrder(orderId, accessToken);
    setCart([]);
    saveCart([]);
    setPreview(null);
    sessionStorage.removeItem('pizza_house_pending_payment');
    sessionStorage.removeItem('pizza_house_payment_failure');
    const accessQuery = orderAccessQuery(orderId, accessToken);
    router.push(`/order-success?order_id=${encodeURIComponent(orderId)}${accessQuery ? `&${accessQuery}` : ''}`);
  }

  function failPayment(orderData, reason, details = {}) {
    const failure = {
      type: details.type || 'failed',
      reason,
      order_id: orderData?.order?.id || null,
      order_number: orderData?.order?.order_number || null,
      razorpay_order_id: details.razorpay_order_id || orderData?.razorpay_order?.id || orderData?.order?.razorpay_order_id || null,
      razorpay_payment_id: details.razorpay_payment_id || null,
      amount: Number(orderData?.pay_now || orderData?.razorpay_order?.amount / 100 || orderData?.order?.total_amount || 0),
      guest_access_token: orderData?.guest_access_token || guestOrderToken(orderData?.order?.id),
      created_at: new Date().toISOString()
    };
    sessionStorage.setItem('pizza_house_pending_payment', JSON.stringify(orderData));
    sessionStorage.setItem('pizza_house_payment_failure', JSON.stringify(failure));
    const accessQuery = failure.order_id ? orderAccessQuery(failure.order_id, failure.guest_access_token) : '';
    const query = failure.order_id ? `?order_id=${encodeURIComponent(failure.order_id)}${accessQuery ? `&${accessQuery}` : ''}` : '';
    router.push(`/payment-failure${query}`);
  }

  function launchRazorpay(orderData) {
    return new Promise((resolve, reject) => {
      if (!razorpayKeyId) return reject(new Error('Razorpay public key is not configured.'));
      if (!window.Razorpay) return reject(new Error('Razorpay checkout script is not loaded.'));
      let completed = false;
      const razorpay = new window.Razorpay({
        key: razorpayKeyId,
        amount: orderData.razorpay_order.amount,
        currency: 'INR',
        name: settings.restaurant_name || 'The Pizza House',
        order_id: orderData.razorpay_order.id,
        prefill: { name: customer.name, email: customer.email, contact: customer.phone },
        modal: {
          ondismiss: () => {
            if (completed) return;
            completed = true;
            failPayment(orderData, 'Razorpay checkout was closed before payment completion.', { type: 'dismissed' });
            reject(new Error('Payment cancelled.'));
          }
        },
        handler: async response => {
          try {
            const verified = await api('/payments/verify', { method: 'POST', body: JSON.stringify({ ...response, order_id: orderData.order.id, guest_access_token: orderData.guest_access_token || guestOrderToken(orderData.order.id) }) });
            completed = true;
            finishOrder(verified.order.id, orderData.guest_access_token);
            resolve();
          } catch (err) {
            completed = true;
            failPayment(orderData, err.message || 'Server-side payment verification failed.', { ...response, type: 'verification_failed' });
            reject(err);
          }
        }
      });
      razorpay.on('payment.failed', response => {
        if (completed) return;
        completed = true;
        failPayment(orderData, response?.error?.description || response?.error?.reason || 'Razorpay reported a payment failure.', {
          type: 'failed',
          razorpay_order_id: response?.error?.metadata?.order_id,
          razorpay_payment_id: response?.error?.metadata?.payment_id
        });
        reject(new Error(response?.error?.description || 'Payment failed.'));
      });
      razorpay.open();
    });
  }

  const customerLoginRequired = (settings.customer_login_required || '0') === '1';
  const cta = orderType === 'takeaway' ? 'Pay & Place Takeaway Order' : 'Pay & Place Order';

  return (
    <main className="checkout-page">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      {hasGoogleMapsKey ? <Script id="google-maps-checkout" src={`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)}&libraries=places`} strategy="afterInteractive" onLoad={handleMapsLoaded} onError={() => setMapsError('Google Maps JavaScript could not load. Verify NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in frontend/.env.local, restart Next.js, and ensure Maps JavaScript API is enabled for this key.')} /> : null}
      <header className="checkout-header">
        <div className="container header-inner">
          <Link href="/" className="brand mark"><span className="brand-icon">TP</span><span>The Pizza House</span></Link>
          <Link className="cart-pill" href="/#cart"><ShoppingBag size={18} /><span>{cartCount}</span></Link>
        </div>
      </header>

      <section className="container checkout-hero">
        <span className="eyebrow">Secure checkout</span>
        <h1>Complete your order</h1>
        <p>Select delivery or takeaway, confirm customer details, and pay through the server-verified Razorpay flow.</p>
      </section>

      <div className="container">{message ? <p className={`notice ${messageType}`}>{message}</p> : null}</div>

      <section className="container checkout-grid dedicated-checkout">
        <div className="checkout-flow">
          <section className="checkout-panel">
            <div className="section-kicker"><CheckCircle2 size={16} /> Order type</div>
            <div className="order-type-grid">
              <button className={orderType === 'delivery' ? 'order-type-card selected' : 'order-type-card'} onClick={() => setOrderType('delivery')}><Bike size={24} /><span>Delivery</span><small>Address, map pin, delivery slab</small></button>
              <button className={orderType === 'takeaway' ? 'order-type-card selected' : 'order-type-card'} onClick={() => setOrderType('takeaway')}><Store size={24} /><span>Takeaway</span><small>Pickup from restaurant, full payment only</small></button>
            </div>
          </section>

          <section className="checkout-panel">
            <div className="section-kicker"><Home size={16} /> Customer information</div>
            {customerSession ? (
              <div className="checkout-customer-card">
                <UserRound size={20} />
                <div>
                  <strong>Welcome, {customerSession.name}</strong>
                  <span>{customerSession.email}{customerSession.phone ? ` | ${customerSession.phone}` : ''}</span>
                </div>
              </div>
            ) : customerLoginRequired ? (
              <div className="checkout-login-required">
                <p className="notice warning">Admin has enabled customer login for checkout. Please login or register to continue.</p>
                <Link className="button" href="/login?return_to=/checkout"><LogIn size={16} /> Login / Register</Link>
              </div>
            ) : (
              <p className="small-note">Guest checkout is available. Add your contact details below, or <Link href="/login?return_to=/checkout">login to save the order to your account</Link>.</p>
            )}
            {!customerSession && !customerLoginRequired ? <div className="form-grid two">
              <input placeholder="Name" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
              <input placeholder="Mobile number" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} />
              <input placeholder="Email" value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })} />
            </div> : null}
          </section>

          {orderType === 'delivery' ? (
            <section className="checkout-panel">
              <div className="section-kicker"><MapPin size={16} /> Delivery details</div>
              {addresses.length ? <div className="saved-addresses">{addresses.map(address => <button className="address-chip" key={address.id} onClick={() => selectAddress(address)}>{address.label}<small>{address.address_line}</small></button>)}</div> : null}
              <textarea placeholder="Delivery address" value={delivery.address} onChange={e => { setDelivery({ ...delivery, address: e.target.value }); setLocationConfirmed(false); }} />
              {locationConfirmed && !locationPickerOpen ? (
                <div className="location-summary">
                  <div>
                    <strong><MapPin size={16} /> Selected delivery location</strong>
                    <p>{delivery.address}</p>
                    <small>Lat: {delivery.latitude} | Lng: {delivery.longitude}</small>
                  </div>
                  <button className="ghost" onClick={changeLocation}>Change Location</button>
                </div>
              ) : (
                <div className="location-picker">
                  <div className="location-picker-head">
                    <strong>Choose delivery location</strong>
                    <button className="ghost" onClick={useDeviceLocation} disabled={locationLoading}><MapPin size={16} /> Use my current location</button>
                  </div>
                  {hasGoogleMapsKey ? (
                    <>
                      <input ref={autocompleteInputRef} className="location-search" placeholder="Search your delivery location" />
                      <div id="checkout-map" className="map-panel" />
                    </>
                  ) : (
                    <div className="map-fallback">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured in frontend/.env.local. Restart the Next.js dev server after adding it.</div>
                  )}
                  {mapsError ? <p className="notice error">{mapsError}</p> : null}
                  {locationStatus ? <p className="location-status">{locationLoading ? <Loader2 className="spin" size={14} /> : null}{locationStatus}</p> : null}
                  <button className="full-width location-confirm" onClick={confirmLocation} disabled={locationLoading || !delivery.latitude || !delivery.longitude}>
                    {locationLoading ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />} Confirm Location
                  </button>
                </div>
              )}
              <div className="form-grid two">
                <input placeholder="Latitude" value={delivery.latitude} onChange={e => { setDelivery({ ...delivery, latitude: e.target.value }); setLocationConfirmed(false); setPreview(null); }} />
                <input placeholder="Longitude" value={delivery.longitude} onChange={e => { setDelivery({ ...delivery, longitude: e.target.value }); setLocationConfirmed(false); setPreview(null); }} />
              </div>
              <div className="action-row">
                <button className="ghost" onClick={saveAddress} disabled={!customerSession}>Save Address</button>
                <button className="ghost" onClick={() => validateCart().catch(err => notify(err.message, 'error'))} disabled={loading || !cart.length}>Calculate Delivery</button>
              </div>
            </section>
          ) : (
            <section className="checkout-panel pickup-panel">
              <div className="section-kicker"><Store size={16} /> Pickup information</div>
              <div className="pickup-card">
                <strong>{settings.restaurant_name || 'The Pizza House'}</strong>
                <p>{settings.restaurant_address || 'Restaurant pickup address is managed in admin settings.'}</p>
                <small>Pickup instructions: arrive after confirmation and share your order number at the counter.</small>
              </div>
              <p className="small-note">Takeaway orders require full payment. Delivery address, map, distance, and delivery charges are not used.</p>
            </section>
          )}

          <section className="checkout-panel">
            <div className="section-kicker"><CreditCard size={16} /> Payment</div>
            <input placeholder="Coupon code" value={couponCode} onChange={e => { const code = e.target.value.toUpperCase(); setCouponCode(code); localStorage.setItem('pizza_house_coupon', code); setPreview(null); }} />
            {orderType === 'delivery' ? (
              <div className="payment-options">
                <label className={paymentMode === 'full' ? 'payment-card selected' : 'payment-card'}><input type="radio" name="payment_mode" checked={paymentMode === 'full'} onChange={() => setPaymentMode('full')} /><span>Full payment</span></label>
                {(settings.partial_payment_enabled || '0') === '1' ? <label className={paymentMode === 'partial' ? 'payment-card selected' : 'payment-card'}><input type="radio" name="payment_mode" checked={paymentMode === 'partial'} onChange={() => setPaymentMode('partial')} /><span>Partial payment</span></label> : null}
                {(settings.cod_enabled || '0') === '1' ? <label className={paymentMode === 'cod' ? 'payment-card selected' : 'payment-card'}><input type="radio" name="payment_mode" checked={paymentMode === 'cod'} onChange={() => setPaymentMode('cod')} /><span>COD / Pay later</span></label> : null}
              </div>
            ) : (
              <div className="payment-card selected full-width"><CreditCard size={18} /><span>Razorpay full payment only</span></div>
            )}
            {paymentMode === 'partial' && orderType === 'delivery' ? (
              <div className="payment-breakdown">
                <div><span>Total Amount</span><strong>{inr(total)}</strong></div>
                <div><span>Advance Payment</span><strong>{inr(advance)}</strong></div>
                <div><span>Remaining Amount</span><strong>{inr(remaining)}</strong></div>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="order-summary checkout-sticky">
          <div className="summary-header"><h2>Order summary</h2><span className="badge">{orderType === 'delivery' ? 'Delivery' : 'Takeaway'}</span></div>
          {!cart.length ? <div className="empty-state"><ShoppingBag size={26} /><strong>Your cart is empty</strong><Link href="/#menu">Back to menu</Link></div> : null}
          <div className="summary-items">
            {cart.map((line, index) => <div className="summary-item" key={line.key || line.id}><img src={productImage(line, index)} alt={line.name} /><div><strong>{line.name}</strong>{line.variant_name ? <p>{line.variant_name}{line.options?.length ? ` | ${line.options.map(option => option.name).join(', ')}` : ''}</p> : null}<p>{inr(line.price)} x {line.quantity}</p><div className="quantity-control"><button onClick={() => qty(line.key || line.id, -1)}><Minus size={14} /></button><strong>{line.quantity}</strong><button onClick={() => qty(line.key || line.id, 1)}><Plus size={14} /></button></div></div><button className="icon-button" onClick={() => qty(line.key || line.id, -line.quantity)} aria-label={`Remove ${line.name}`}><Trash2 size={16} /></button></div>)}
          </div>
          <div className="totals">
            <div><span>Subtotal</span><strong>{inr(preview?.subtotal ?? subtotal)}</strong></div>
            <div><span>Coupon Discount</span><strong>-{inr(preview?.discount ?? 0)}</strong></div>
            <div><span>BOGO / Free Items</span><strong>{preview?.lines?.reduce((sum, line) => sum + Number(line.free_quantity || 0), 0) || 0} free</strong></div>
            {orderType === 'delivery' ? <div><span>Delivery Charge</span><strong>{inr(preview?.delivery?.delivery_charge ?? 0)}</strong></div> : null}
            {orderType === 'delivery' && preview?.delivery ? <div><span>Distance</span><strong>{preview.delivery.distance_km} km</strong></div> : null}
            <div className="grand"><span>Total</span><strong>{inr(total)}</strong></div>
            <div><span>Paid Now</span><strong>{inr(paymentMode === 'cod' ? 0 : advance)}</strong></div>
            <div><span>Remaining</span><strong>{inr(paymentMode === 'cod' ? total : remaining)}</strong></div>
          </div>
          <button className="full-width mobile-sticky-cta" onClick={placeOrder} disabled={loading || !cart.length}>{loading ? <Loader2 className="spin" size={16} /> : <CreditCard size={16} />}{loading ? 'Processing payment...' : cta}</button>
          <p className="small-note">Prices, stock, coupon, BOGO, delivery, payment mode, and Razorpay verification are enforced by the PHP backend.</p>
        </aside>
      </section>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<main className="checkout-page"><section className="container checkout-hero">Loading checkout...</section></main>}>
      <CheckoutContent />
    </Suspense>
  );
}
