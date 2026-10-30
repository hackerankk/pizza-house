'use client';

import { publicPickupAddress } from '../customer-copy.mjs';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import LocationSearch from '../components/LocationSearch';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState';
import { trackEvent } from '../analytics';
import { Toast, useToastMessage } from '../components/ui';
import OptimizedImage from '../components/OptimizedImage';
import { reducedMotionPreferred } from '../motion';
import { Bike, CheckCircle2, CreditCard, Home, Loader2, LogIn, MapPin, Minus, Plus, ShoppingBag, Store, Trash2, UserRound } from 'lucide-react';
import { api, applyTheme, guestOrderToken, inr, orderAccessQuery, productImage, readCart, rememberGuestOrder, saveCart, storedThemeMode, setThemeMode, token } from '../lib';

function cartLineKey(line = {}) {
  return String(line.key || line.id || '');
}

function bogoGroupKey(line = {}) {
  return String(line.bogoGroupId || line.bogo_group_id || line.bogo_parent_key || line.bogoParentKey || (line.is_bogo_free ? '' : `bogo:${cartLineKey(line)}`));
}

function ensurePaidBogoGroup(line = {}) {
  if (line.is_bogo_free) return line;
  const groupId = bogoGroupKey(line);
  return { ...line, bogoGroupId: groupId, bogo_group_id: groupId, bogoRole: 'paid', bogo_role: 'paid' };
}

function ensureFreeBogoGroup(line = {}, parentGroupId) {
  const groupId = String(parentGroupId || bogoGroupKey(line));
  return { ...line, bogoGroupId: groupId, bogo_group_id: groupId, bogoRole: 'free', bogo_role: 'free', bogo_parent_key: groupId };
}

function reconcileBogoCart(lines = []) {
  const normalized = lines.map(line => line.is_bogo_free ? { ...line } : ensurePaidBogoGroup(line));
  const paidByGroup = new Map();
  const paidKeyToGroup = new Map();
  normalized.forEach(line => {
    if (line.is_bogo_free) return;
    const groupId = bogoGroupKey(line);
    paidByGroup.set(groupId, line);
    paidKeyToGroup.set(cartLineKey(line), groupId);
  });

  const usedFreeQty = new Map();
  const reconciled = [];
  normalized.forEach(line => {
    if (!line.is_bogo_free) {
      reconciled.push(line);
      return;
    }
    const requestedParent = bogoGroupKey(line);
    const groupId = paidByGroup.has(requestedParent) ? requestedParent : paidKeyToGroup.get(requestedParent);
    const paidLine = groupId ? paidByGroup.get(groupId) : null;
    if (!paidLine) return;
    const alreadyUsed = usedFreeQty.get(groupId) || 0;
    const remaining = Math.max(Math.floor(Number(paidLine.quantity || 0) / Number(line.bogo_buy_qty || 1)) * Number(line.bogo_get_qty || 1) - alreadyUsed, 0);
    if (remaining <= 0) return;
    const quantity = Math.min(Number(line.quantity || 1), remaining);
    usedFreeQty.set(groupId, alreadyUsed + quantity);
    reconciled.push(ensureFreeBogoGroup({ ...line, quantity }, groupId));
  });
  return reconciled;
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState({});
  const [themeMode, setThemeModeState] = useState('system');
  const [storeStatus, setStoreStatus] = useState(null);
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [googleMapsKey, setGoogleMapsKey] = useState('');
  const [cart, setCart] = useState([]);
  const [cartReady, setCartReady] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const [settingsAttempt, setSettingsAttempt] = useState(0);
  const [orderType, setOrderType] = useState('delivery');
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [customerSession, setCustomerSession] = useState(null);
  const [delivery, setDelivery] = useState({ address: '', latitude: '', longitude: '' });
  const [addresses, setAddresses] = useState([]);
  const [couponCode, setCouponCode] = useState('');
  const [paymentMode, setPaymentMode] = useState('full');
  const [preview, setPreview] = useState(null);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [message, setMessage, messageType] = useToastMessage('info');
  const [loading, setLoading] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(true);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  const [mapsError, setMapsError] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const locationRequestRef = useRef(0);
  const quoteRequestRef = useRef(0);
  const checkoutAnalyticsRef = useRef('');
  const restoredPaymentRef = useRef(null);
  const placingOrderRef = useRef(false);
  const orderAttemptRef = useRef('');

  useEffect(() => {
    setCart(reconcileBogoCart(readCart()));
    setCartReady(true);
    setCouponCode(localStorage.getItem('pizza_house_coupon') || '');
    setThemeModeState(storedThemeMode() || 'system');
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
    restoredPaymentRef.current = null;
    if (retryOrderId) {
      try {
        const saved = JSON.parse(sessionStorage.getItem('pizza_house_pending_payment') || 'null');
        if (saved?.order?.id && String(saved.order.id) === String(retryOrderId) && saved.razorpay_order) {
          restoredPaymentRef.current = saved;
          if (['delivery', 'takeaway'].includes(saved.order.order_type)) setOrderType(saved.order.order_type);
        }
      } catch {
        setPendingPayment(null);
      }
    }
  }, [searchParams, setMessage]);

  useEffect(() => {
    let cancelled = false;
    setSettingsReady(false);
    setSettingsError(false);
    Promise.all([api('/theme'), api('/settings'), api('/store/status')])
      .then(([themeData, settingsData, storeData]) => {
        if (cancelled) return;
        applyTheme(themeData.theme || {}, settingsData.settings?.customer_default_theme || 'system');
        setSettings(settingsData.settings || {});
        setStoreStatus(storeData.store || null);
        setRazorpayKeyId(settingsData.razorpay_key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '');
        setGoogleMapsKey(settingsData.google_maps_enabled === '0' ? '' : (settingsData.google_maps_api_key || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''));
      })
      .catch(() => { if (!cancelled) setSettingsError(true); })
      .finally(() => { if (!cancelled) setSettingsReady(true); });
    return () => { cancelled = true; };
  }, [settingsAttempt]);

  useEffect(() => {
    if (cartReady) saveCart(cart);
    setPreview(null);
    setPendingPayment(null);
    orderAttemptRef.current = '';
  }, [cart, orderType, cartReady]);

  // Restore only after the initial cart update has cleared stale payment state.
  // Later cart changes invalidate the saved payment instead of restoring it again.
  useEffect(() => {
    if (!cartReady || !restoredPaymentRef.current) return;
    setPendingPayment(restoredPaymentRef.current);
    restoredPaymentRef.current = null;
    setMessage('Payment retry is ready. Your original order reference was preserved.', 'info');
  }, [cartReady, searchParams, setMessage]);

  useEffect(() => {
    orderAttemptRef.current = '';
  }, [couponCode, delivery.address, delivery.latitude, delivery.longitude, paymentMode, customer.name, customer.phone, customer.email]);

  useEffect(() => {
    if (orderType === 'takeaway') {
      setPaymentMode('full');
      setPreview(null);
    }
  }, [orderType]);

  useEffect(() => {
    if ((settings.delivery_enabled || '1') !== '1' && (settings.takeaway_enabled || '1') === '1') setOrderType('takeaway');
    if ((settings.takeaway_enabled || '1') !== '1' && (settings.delivery_enabled || '1') === '1') setOrderType('delivery');
    if (!razorpayKeyId && paymentMode !== 'cod' && (settings.cod_enabled || '0') === '1') setPaymentMode('cod');
  }, [settings, razorpayKeyId, paymentMode]);

  const hasGoogleMapsKey = Boolean(googleMapsKey);
  const googleMapsReady = mapLoaded && hasGoogleMapsKey && typeof window !== 'undefined' && Boolean(window.google?.maps);

  function handleMapsLoaded() {
    if (!window.google?.maps) {
      setMapsError('The map could not be opened. Use your current location or enter delivery coordinates below.');
      return;
    }
    setMapsError('');
    setMapLoaded(true);
  }

  const reverseGeocode = useCallback(async (lat, lng) => {
    if (!geocoderRef.current) return null;
    try {
      const result = await Promise.race([
        geocoderRef.current.geocode({ location: { lat, lng } }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Geocoding timed out')), 8000))
      ]);
      return result?.results?.[0]?.formatted_address || null;
    } catch {
      return null;
    }
  }, []);

  const syncMapMarker = useCallback((lat, lng, zoom = 17) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    if (!googleMapsReady || !mapRef.current || !markerRef.current) return;
    const position = { lat, lng };
    markerRef.current.setPosition(position);
    if (reducedMotionPreferred()) mapRef.current.setCenter(position);
    else mapRef.current.panTo(position);
    mapRef.current.setZoom(zoom);
  }, [googleMapsReady]);

  const updateSelectedLocation = useCallback(async (lat, lng, address = null, options = {}) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    const request = ++locationRequestRef.current;
    setLocationLoading(true);
    setLocationStatus(options.status || 'Updating selected location...');
    syncMapMarker(lat, lng, options.zoom || 17);
    setDelivery({ address: address || '', latitude: lat.toFixed(7), longitude: lng.toFixed(7) });
    setLocationConfirmed(false);
    setPreview(null);
    const readableAddress = address || await reverseGeocode(lat, lng);
    if (request !== locationRequestRef.current) return;
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
    return () => {
      ++locationRequestRef.current;
      if (window.google?.maps?.event) {
        [mapRef.current, markerRef.current].filter(Boolean).forEach(instance => window.google.maps.event.clearInstanceListeners(instance));
      }
      markerRef.current?.setMap(null);
      mapRef.current = null;
      markerRef.current = null;
      geocoderRef.current = null;
      setLocationLoading(false);
    };
  }, [locationPickerOpen, orderType]);

  useEffect(() => {
    const previous = window.gm_authFailure;
    window.gm_authFailure = () => setMapsError('The map is currently unavailable. Use your current location or enter delivery coordinates below.');
    return () => { window.gm_authFailure = previous; };
  }, []);

  useEffect(() => {
    if (!googleMapsReady || orderType !== 'delivery' || !locationPickerOpen || mapRef.current) return;
    const target = document.getElementById('checkout-map');
    if (!target) return;
    if (!window.google?.maps?.Map || !window.google?.maps?.Marker || !window.google?.maps?.Geocoder) {
      setMapsError('The map could not be opened. Use your current location or enter delivery coordinates below.');
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
    if (delivery.latitude !== '' && delivery.longitude !== '') syncMapMarker(Number(delivery.latitude), Number(delivery.longitude));
  }, [delivery.latitude, delivery.longitude, syncMapMarker]);

  useEffect(() => {
    const request = ++quoteRequestRef.current;
    setPreview(null);
    if (!cartReady || !cart.length || (orderType === 'delivery' && (delivery.latitude === '' || delivery.longitude === ''))) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await api('/cart/validate', { method: 'POST', signal: controller.signal, body: JSON.stringify({ order_type: orderType, items: cartPayload(), coupon_code: couponCode, ...(orderType === 'delivery' ? { latitude: delivery.latitude, longitude: delivery.longitude } : {}) }) });
        if (request === quoteRequestRef.current) { setPreview(data); setMessage(''); }
      } catch (err) {
        if (err.name !== 'AbortError' && request === quoteRequestRef.current) notify(err.message, 'error');
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  // cartPayload reads only the cart represented by these dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, cartReady, couponCode, delivery.latitude, delivery.longitude, orderType]);

  function notify(text, type = 'info') {
    setMessage(text, type);
  }

  function changeThemeMode(mode) {
    setThemeModeState(mode);
    setThemeMode(mode);
  }

  const subtotal = cart.filter(line => !line.is_bogo_free).reduce((sum, line) => sum + Number(line.price) * line.quantity, 0);
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
    return reconcileBogoCart(cart).map(item => {
      const groupId = bogoGroupKey(item);
      return {
        id: item.id,
        variant_id: item.variant_id || null,
        option_ids: item.option_ids || [],
        option_selections: (item.options?.length ? item.options : (item.option_ids || []).map(id => ({ id }))).map(option => ({ id: Number(option.id), quantity: 1 })),
        quantity: item.quantity,
        client_key: item.is_bogo_free ? (item.key || '') : groupId,
        is_bogo_free: Boolean(item.is_bogo_free),
        bogo_group_id: groupId,
        bogo_parent_key: item.is_bogo_free ? groupId : ''
      };
    });
  }

  function qty(key, delta) {
    setPreview(null);
    setCart(current => {
      const target = current.find(line => (line.key || line.id) === key);
      if (!target) return current;
      const targetGroup = bogoGroupKey(target);
      const next = !target.is_bogo_free && target.quantity + delta <= 0
        ? current.filter(line => bogoGroupKey(line) !== targetGroup)
        : current
          .map(line => (line.key || line.id) === key ? { ...line, quantity: line.quantity + delta } : line)
          .filter(line => line.quantity > 0);
      return reconcileBogoCart(next);
    });
  }

  function selectAddress(address) {
    ++locationRequestRef.current;
    setLocationLoading(false);
    setDelivery({ address: address.address_line, latitude: address.latitude, longitude: address.longitude });
    setPreview(null);
    setLocationConfirmed(true);
    setLocationPickerOpen(false);
    syncMapMarker(Number(address.latitude), Number(address.longitude));
  }

  function editDeliveryField(field, value) {
    ++locationRequestRef.current;
    ++quoteRequestRef.current;
    setLocationLoading(false);
    setDelivery(current => ({ ...current, [field]: value }));
    setLocationConfirmed(false);
    setPreview(null);
  }

  async function saveAddress() {
    if (savingAddress) return;
    setSavingAddress(true);
    try {
      await api('/account/addresses', { method: 'POST', body: JSON.stringify({ label: 'Checkout', address_line: delivery.address, latitude: delivery.latitude, longitude: delivery.longitude }) });
      const saved = await api('/account/addresses');
      setAddresses(saved.addresses || []);
      notify('Address saved.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSavingAddress(false);
    }
  }

  async function validateCart() {
    const request = ++quoteRequestRef.current;
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
    if (request === quoteRequestRef.current) setPreview(data);
    notify(data.discount > 0 ? 'Coupon applied and order total updated.' : 'Order total validated.', 'success');
    return data;
  }

  async function useDeviceLocation() {
    if (!navigator.geolocation) {
      notify('Geolocation is not available in this browser.', 'error');
      return;
    }
    setLocationLoading(true);
    const request = ++locationRequestRef.current;
    setLocationStatus('Waiting for browser location permission...');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        if (request !== locationRequestRef.current) return;
        await updateSelectedLocation(pos.coords.latitude, pos.coords.longitude, null, { status: 'Reading your current location...' });
        notify('Location detected. Confirm the pin to continue.', 'success');
      },
      () => {
        if (request !== locationRequestRef.current) return;
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
      notify('Delivery location confirmed.', 'success');
      if (cart.length) await validateCart();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  function changeLocation() {
    setLocationPickerOpen(true);
    setLocationConfirmed(false);
    if (delivery.latitude && delivery.longitude) {
      syncMapMarker(Number(delivery.latitude), Number(delivery.longitude));
    }
  }

  function trackCheckoutIntent(value) {
    if (!checkoutAnalyticsRef.current) checkoutAnalyticsRef.current = crypto.randomUUID();
    trackEvent('begin_checkout', { value: Number(value), currency: 'INR' }, { dedupeKey: `checkout:${checkoutAnalyticsRef.current}` });
  }

  async function placeOrder() {
    if (placingOrderRef.current) return;
    placingOrderRef.current = true;
    setLoading(true);
    try {
      if (!cart.length && !pendingPayment) throw new Error('Cart is empty');
      const currentStatus = await api('/store/status');
      setStoreStatus(currentStatus.store || null);
      if (currentStatus.store && !currentStatus.store.is_open) throw new Error(currentStatus.store.message || 'Ordering is currently closed.');
      const loginRequired = (settings.customer_login_required || '0') === '1';
      if ((orderType === 'delivery' && (settings.delivery_enabled || '1') !== '1') || (orderType === 'takeaway' && (settings.takeaway_enabled || '1') !== '1')) {
        throw new Error(`${orderType === 'delivery' ? 'Delivery' : 'Takeaway'} is currently unavailable.`);
      }
      if ((loginRequired || (settings.guest_checkout_enabled || '1') !== '1') && !customerSession) throw new Error('Please register or login before placing the order.');
      if (pendingPayment?.razorpay_order && pendingPayment?.order?.id) {
        const pendingId = pendingPayment.order.id;
        const accessQuery = orderAccessQuery(pendingId, pendingPayment.guest_access_token);
        const savedOrder = await api(`/orders/${pendingId}/track${accessQuery ? `?${accessQuery}` : ''}`);
        if (savedOrder.order?.status === 'cancelled') throw new Error('This order was cancelled. Please return to your cart to place a new order.');
        if (['Paid', 'Partially Paid', 'COD'].includes(savedOrder.order?.payment_status)) {
          finishOrder(savedOrder.order.id, pendingPayment.guest_access_token, savedOrder.order.total_amount);
          return;
        }
        trackCheckoutIntent(savedOrder.order.total_amount ?? total);
        await launchRazorpay(pendingPayment);
        return;
      }
      if (!customerSession) {
        if (!customer.name.trim()) throw new Error('Guest name is required.');
        if (!customer.phone.trim()) throw new Error('Guest phone is required.');
        if (customer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) throw new Error('Enter a valid guest email address.');
      }
      if (paymentMode !== 'cod' && !razorpayKeyId) throw new Error('Online payment is currently unavailable.');
      if (orderType === 'delivery') {
        if (!delivery.latitude || !delivery.longitude) throw new Error('Choose and confirm your delivery location before placing the order.');
        if (!delivery.address.trim()) throw new Error('Delivery address is required.');
      }
      const validatedCart = preview || await validateCart();
      trackCheckoutIntent(validatedCart.total ?? total);
      const body = {
        order_type: orderType,
        items: cartPayload(),
        coupon_code: couponCode,
        payment_mode: orderType === 'takeaway' ? 'full' : paymentMode,
        idempotency_key: orderAttemptRef.current || (orderAttemptRef.current = crypto.randomUUID())
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
      } else if ((data.pay_now !== undefined && Number(data.pay_now) === 0) || ['Paid', 'Partially Paid', 'COD'].includes(data.order?.payment_status)) {
        finishOrder(data.order.id, data.guest_access_token, data.order.total_amount);
      } else {
        throw new Error('This order already exists, but its payment is still pending. Check its status from your account before trying another payment.');
      }
    } catch (err) {
      if (err.data?.code === 'STORE_CLOSED') setStoreStatus(err.data.store || null);
      notify(err.message, 'error');
    } finally {
      placingOrderRef.current = false;
      setLoading(false);
    }
  }

  function finishOrder(orderId, guestAccessToken = '', verifiedTotal = total) {
    const accessToken = guestAccessToken || guestOrderToken(orderId);
    if (accessToken) rememberGuestOrder(orderId, accessToken);
    trackEvent('purchase', { value: Number(verifiedTotal), currency: 'INR' }, { dedupeKey: `order:${orderId}` });
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
      if (!razorpayKeyId) return reject(new Error('Online payment is currently unavailable. Please try again later.'));
      if (!window.Razorpay) return reject(new Error('The payment window could not load. Check your connection and try again.'));
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
          if (completed) return;
          completed = true;
          try {
            const verified = await api('/payments/verify', { method: 'POST', body: JSON.stringify({ ...response, order_id: orderData.order.id, guest_access_token: orderData.guest_access_token || guestOrderToken(orderData.order.id) }) });
            finishOrder(verified.order.id, orderData.guest_access_token, verified.order.total_amount);
            resolve();
          } catch (err) {
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
  const guestCheckoutEnabled = (settings.guest_checkout_enabled || '1') === '1';
  const deliveryEnabled = (settings.delivery_enabled || '1') === '1';
  const takeawayEnabled = (settings.takeaway_enabled || '1') === '1';
  const customerThemeEnabled = (settings.customer_theme_enabled || '1') === '1';
  const customerDarkModeEnabled = (settings.customer_dark_mode_enabled || '1') === '1';
  const razorpayEnabled = Boolean(razorpayKeyId);
  const mapsFeatureEnabled = Boolean(googleMapsKey);
  const cta = orderType === 'takeaway' ? 'Pay & Place Takeaway Order' : 'Pay & Place Order';
  const selectedOrderTypeDisabled = (orderType === 'delivery' && !deliveryEnabled) || (orderType === 'takeaway' && !takeawayEnabled);
  const selectedPaymentDisabled = paymentMode !== 'cod' && !razorpayEnabled;

  if (!cartReady || !settingsReady) return <CheckoutLoading />;
  if (settingsError) return (
    <main className="checkout-page">
      <section className="container checkout-hero"><span className="eyebrow">Secure checkout</span><h1>Complete your order</h1></section>
      <div className="container"><ErrorState title="Checkout could not load" message="We could not check the current ordering and payment options. Your cart is saved. Please try again." onRetry={() => setSettingsAttempt(attempt => attempt + 1)}><Link className="button ghost" href="/#menu">Back to menu</Link></ErrorState></div>
    </main>
  );

  return (
    <main className="checkout-page">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      {hasGoogleMapsKey ? <Script id="google-maps-checkout" src={`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsKey)}&libraries=places`} strategy="afterInteractive" onReady={handleMapsLoaded} onError={() => setMapsError('The map could not load. Check your connection, use your current location, or enter coordinates below.')} /> : null}
      <header className="checkout-header">
        <div className="container header-inner">
          <Link href="/" className="brand mark"><span className="brand-icon">TP</span><span>The Pizza House</span></Link>
          <div className="header-actions">
            {storeStatus ? <span className={storeStatus.is_open ? 'store-status-pill open' : 'store-status-pill closed'}>{storeStatus.is_open ? 'Open - Orders Available' : 'Closed - Orders Unavailable'}</span> : null}
            {customerThemeEnabled ? <select className="theme-mode-select" aria-label="Theme mode" value={themeMode} onChange={e => changeThemeMode(e.target.value)}><option value="light">Light</option>{customerDarkModeEnabled ? <option value="dark">Dark</option> : null}<option value="system">System</option></select> : null}
          <Link className="cart-pill" href="/#cart"><ShoppingBag size={18} /><span>{cartCount}</span></Link>
          </div>
        </div>
      </header>

      <section className="container checkout-hero">
        <span className="eyebrow">Secure checkout</span>
        <h1>Complete your order</h1>
        <p>Choose delivery or takeaway, check your details, and complete your order securely.</p>
      </section>

      <div className="container">{message ? <Toast tone={messageType} onDismiss={() => setMessage('')}>{message}</Toast> : null}</div>
      <div className="container">{storeStatus && !storeStatus.is_open ? <p className="notice warning">Ordering is currently closed. {storeStatus.next_opening ? `Next opening: ${storeStatus.next_opening.day} ${storeStatus.next_opening.open}-${storeStatus.next_opening.close}` : 'Please check back later.'}</p> : null}</div>

      <section className="container checkout-grid dedicated-checkout">
        <div className="checkout-flow">
          <section className="checkout-panel">
            <div className="section-kicker"><CheckCircle2 size={16} /> Order type</div>
            <div className="order-type-grid">
              <button className={orderType === 'delivery' ? 'order-type-card selected' : 'order-type-card'} onClick={() => setOrderType('delivery')} disabled={!deliveryEnabled}><Bike size={24} /><span>Delivery</span><small>{deliveryEnabled ? 'Address, map pin, delivery slab' : 'Currently unavailable'}</small></button>
              <button className={orderType === 'takeaway' ? 'order-type-card selected' : 'order-type-card'} onClick={() => setOrderType('takeaway')} disabled={!takeawayEnabled}><Store size={24} /><span>Takeaway</span><small>{takeawayEnabled ? 'Pickup from restaurant, full payment only' : 'Currently unavailable'}</small></button>
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
            ) : customerLoginRequired || !guestCheckoutEnabled ? (
              <div className="checkout-login-required">
                <p className="notice warning">Customer login is required before checkout. Please login or register to continue.</p>
                <Link className="button" href="/login?return_to=/checkout"><LogIn size={16} /> Login / Register</Link>
              </div>
            ) : (
              <p className="small-note">Guest checkout is available. Add your contact details below, or <Link href="/login?return_to=/checkout">login to save the order to your account</Link>.</p>
            )}
            {!customerSession && !customerLoginRequired && guestCheckoutEnabled ? <div className="form-grid two">
              <input aria-label="Your name" autoComplete="name" maxLength={120} placeholder="Name" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
              <input aria-label="Mobile number" type="tel" autoComplete="tel" maxLength={30} placeholder="Mobile number" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} />
              <input type="email" autoComplete="email" maxLength={180} placeholder="Email (Optional)" aria-label="Email (Optional)" value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })} />
            </div> : null}
          </section>

          {orderType === 'delivery' ? (
            <section className="checkout-panel">
              <div className="section-kicker"><MapPin size={16} /> Delivery details</div>
              {addresses.length ? <div className="saved-addresses">{addresses.map(address => <button className="address-chip" key={address.id} onClick={() => selectAddress(address)}>{address.label}<small>{address.address_line}</small></button>)}</div> : null}
              <textarea aria-label="Delivery address" autoComplete="street-address" maxLength={4000} placeholder="Delivery address" value={delivery.address} onChange={e => editDeliveryField('address', e.target.value)} />
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
                  {hasGoogleMapsKey && mapsFeatureEnabled ? (
                    <>
                      <LocationSearch ready={googleMapsReady} onStart={() => { setLocationLoading(true); setLocationConfirmed(false); return ++locationRequestRef.current; }} onSelect={(request, lat, lng, address) => { if (request === locationRequestRef.current) updateSelectedLocation(lat, lng, address); }} onEnd={request => { if (request === locationRequestRef.current) setLocationLoading(false); }} />
                      <div id="checkout-map" className="map-panel" />
                    </>
                  ) : (
                    <div className="map-fallback">The map is currently unavailable. Use your current location or enter delivery coordinates below.</div>
                  )}
                  {mapsError ? <p className="notice error">{mapsError}</p> : null}
                  {locationStatus ? <p className="location-status">{locationLoading ? <Loader2 className="spin" size={14} /> : null}{locationStatus}</p> : null}
                  <button className="full-width location-confirm" onClick={confirmLocation} disabled={locationLoading || !delivery.latitude || !delivery.longitude}>
                    {locationLoading ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />} Confirm Location
                  </button>
                </div>
              )}
              <div className="form-grid two">
                <input aria-label="Delivery latitude" inputMode="decimal" placeholder="Latitude" value={delivery.latitude} onChange={e => editDeliveryField('latitude', e.target.value)} />
                <input aria-label="Delivery longitude" inputMode="decimal" placeholder="Longitude" value={delivery.longitude} onChange={e => editDeliveryField('longitude', e.target.value)} />
              </div>
              <div className="action-row">
                <button className="ghost" onClick={saveAddress} disabled={!customerSession || savingAddress}>{savingAddress ? 'Saving address…' : 'Save Address'}</button>
                <button className="ghost" onClick={() => validateCart().catch(err => notify(err.message, 'error'))} disabled={loading || !cart.length}>Calculate Delivery</button>
              </div>
            </section>
          ) : (
            <section className="checkout-panel pickup-panel">
              <div className="section-kicker"><Store size={16} /> Pickup information</div>
              <div className="pickup-card">
                <strong>{settings.restaurant_name || 'The Pizza House'}</strong>
                <p>{publicPickupAddress(settings.restaurant_address) || 'Please confirm the pickup address with the restaurant before ordering.'}</p>
                <small>Pickup instructions: arrive after confirmation and share your order number at the counter.</small>
              </div>
              <p className="small-note">Takeaway orders require full payment. Delivery address, map, distance, and delivery charges are not used.</p>
            </section>
          )}

          <section className="checkout-panel">
            <div className="section-kicker"><CreditCard size={16} /> Payment</div>
            <input aria-label="Coupon code" maxLength={40} placeholder="Coupon code" value={couponCode} onChange={e => { const code = e.target.value.toUpperCase(); setCouponCode(code); localStorage.setItem('pizza_house_coupon', code); setPreview(null); setPendingPayment(null); }} />
            {orderType === 'delivery' ? (
              <div className="payment-options">
                {razorpayEnabled ? <label className={paymentMode === 'full' ? 'payment-card selected' : 'payment-card'}><input type="radio" name="payment_mode" checked={paymentMode === 'full'} onChange={() => setPaymentMode('full')} /><span>Full payment</span></label> : null}
                {razorpayEnabled && (settings.partial_payment_enabled || '0') === '1' ? <label className={paymentMode === 'partial' ? 'payment-card selected' : 'payment-card'}><input type="radio" name="payment_mode" checked={paymentMode === 'partial'} onChange={() => setPaymentMode('partial')} /><span>Partial payment</span></label> : null}
                {(settings.cod_enabled || '0') === '1' ? <label className={paymentMode === 'cod' ? 'payment-card selected' : 'payment-card'}><input type="radio" name="payment_mode" checked={paymentMode === 'cod'} onChange={() => setPaymentMode('cod')} /><span>COD / Pay later</span></label> : null}
              </div>
            ) : (
              <div className="payment-card selected full-width"><CreditCard size={18} /><span>{razorpayEnabled ? 'Razorpay full payment only' : 'Online payment currently unavailable'}</span></div>
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
          {!cart.length ? <EmptyState title="Your cart is empty" message="Choose something from the menu to start your order."><Link className="button ghost" href="/#menu">Explore the menu</Link></EmptyState> : null}
          <div className="summary-items">
            {cart.map((line, index) => <div className={line.is_bogo_free ? 'summary-item free-cart-line' : 'summary-item'} key={line.key || line.id}><OptimizedImage width={74} height={74} sizes="(max-width: 600px) 62px, 74px" src={productImage(line, index)} alt={line.name} /><div><strong>{line.name} {line.is_bogo_free ? <span className="bogo-free-badge">FREE</span> : null}</strong>{line.variant_name ? <p>{line.variant_name}{line.options?.length ? ` | ${line.options.map(option => option.name).join(', ')}` : ''}</p> : null}<p>{line.is_bogo_free ? `BOGO free item · original ${inr(line.price)} x ${line.quantity}` : `${inr(line.price)} x ${line.quantity}`}</p><div className="quantity-control"><button aria-label={`Decrease quantity of ${line.name}`} onClick={() => qty(line.key || line.id, -1)}><Minus size={14} /></button><strong>{line.quantity}</strong><button aria-label={`Increase quantity of ${line.name}`} onClick={() => qty(line.key || line.id, 1)} disabled={line.is_bogo_free}><Plus size={14} /></button></div></div><button className="icon-button" onClick={() => qty(line.key || line.id, -line.quantity)} aria-label={`Remove ${line.name}`}><Trash2 size={16} /></button></div>)}
          </div>
          <div className="totals">
            <div><span>Subtotal</span><strong>{inr(preview?.subtotal ?? subtotal)}</strong></div>
            <div><span>Coupon Discount</span><strong>-{inr(preview?.coupon_discount ?? 0)}</strong></div>
            <div><span>BOGO Discount</span><strong>-{inr(preview?.bogo_discount ?? 0)}</strong></div>
            {preview?.bogo_details?.length ? <div className="bogo-detail-row"><span>Free Items</span><strong>{preview.bogo_details.map(row => `${row.free_quantity} x ${row.item} ${row.size}`).join(', ')}</strong></div> : null}
            {orderType === 'delivery' ? <div><span>Delivery Charge</span><strong>{preview?.delivery?.is_free_delivery ? 'FREE' : inr(preview?.delivery?.delivery_charge ?? 0)}</strong></div> : null}
            {orderType === 'delivery' && preview?.delivery ? <div><span>Distance</span><strong>{preview.delivery.distance_km} km</strong></div> : null}
            {orderType === 'delivery' && preview?.delivery?.is_free_delivery ? <div className="notice success"><strong>FREE DELIVERY</strong><span>{preview.delivery.message}</span></div> : null}
            {orderType === 'delivery' && preview?.delivery?.progress_message && !preview.delivery.is_free_delivery ? <div className="notice warning"><span>{preview.delivery.progress_message}</span></div> : null}
            <div className="grand"><span>Total</span><strong>{inr(total)}</strong></div>
            <div><span>Paid Now</span><strong>{inr(paymentMode === 'cod' ? 0 : advance)}</strong></div>
            <div><span>Remaining</span><strong>{inr(paymentMode === 'cod' ? total : remaining)}</strong></div>
          </div>
          <button className="full-width mobile-sticky-cta" onClick={placeOrder} disabled={loading || (!cart.length && !pendingPayment) || (storeStatus && !storeStatus.is_open) || selectedOrderTypeDisabled || selectedPaymentDisabled}>{loading ? <Loader2 className="spin" size={16} /> : <CreditCard size={16} />}{loading ? 'Processing payment...' : storeStatus && !storeStatus.is_open ? 'Ordering Closed' : selectedOrderTypeDisabled ? 'Order Type Unavailable' : selectedPaymentDisabled ? 'Payment Unavailable' : pendingPayment ? 'Retry original order payment' : cta}</button>
          <p className="small-note">Review your items and total before placing your order.</p>
        </aside>
      </section>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutLoading />}>
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutLoading() {
  return (
    <main className="checkout-page">
      <section className="container checkout-hero"><span className="eyebrow">Secure checkout</span><h1>Complete your order</h1><p>Preparing your saved cart and current ordering options.</p></section>
      <div className="container checkout-grid dedicated-checkout"><LoadingState label="Loading checkout details…" cards={3} /><LoadingState label="Loading your order summary…" rows={6} /></div>
    </main>
  );
}
