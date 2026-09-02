'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { Bell, Camera, Clock, CreditCard, Eye, FileText, LayoutDashboard, LogOut, Mail, Menu, Palette, Printer, RotateCcw, Save, Settings, ShoppingBag, Tag, Truck, Upload, Utensils, X } from 'lucide-react';
import { adminApi, adminLogout, adminUploadApi, api, applyTheme, clearToken, downloadInvoice, inr, itemSelectionText, itemVariantText, openInvoice, productImage, refreshAdminSession, setToken, token } from '../lib';

const resources = {
  products: ['category_id', 'name', 'slug', 'description', 'price', 'stock', 'low_stock_threshold', 'image_url', 'is_active'],
  categories: ['name', 'slug', 'description', 'sort_order', 'is_active'],
  coupons: ['code', 'discount_type', 'discount_value', 'min_order_value', 'max_discount', 'starts_at', 'expires_at', 'overall_usage_limit', 'per_customer_limit', 'is_active'],
  offers: ['name', 'scope', 'scope_id', 'buy_qty', 'get_qty', 'starts_at', 'expires_at', 'is_active'],
  'delivery-slabs': ['min_km', 'max_km', 'charge', 'is_active']
};

const tabs = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['orders', 'Orders', ShoppingBag],
  ['payments', 'Payments', CreditCard],
  ['products', 'Products', Utensils],
  ['categories', 'Categories', Menu],
  ['coupons', 'Coupons', Tag],
  ['offers', 'Offers', Tag],
  ['delivery-slabs', 'Delivery Slabs', Truck],
  ['delivery-boys', 'Delivery Boys', Truck],
  ['theme', 'Theme Settings', Palette],
  ['settings', 'General Settings', Settings],
  ['notifications', 'Notifications', Bell]
];

const fieldOptions = {
  is_active: [['1', 'Active'], ['0', 'Inactive']],
  discount_type: [['flat', 'Flat'], ['percent', 'Percent']],
  scope: [['item', 'Item'], ['category', 'Category']],
  partial_payment_type: [['percent', 'Percent advance'], ['fixed', 'Fixed advance']],
  partial_payment_enabled: [['1', 'Enabled'], ['0', 'Disabled']],
  cod_enabled: [['1', 'Enabled'], ['0', 'Disabled']],
  full_payment_enabled: [['1', 'Enabled'], ['0', 'Disabled']],
  customer_login_required: [['0', 'Guest checkout allowed'], ['1', 'Login required']]
};

const prepOptions = [10, 15, 20, 30];

function statusLabel(status) {
  return String(status || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function nextStatuses(order) {
  const deliveryFlow = ['received', 'accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'delivered'];
  const takeawayFlow = ['received', 'accepted', 'preparing', 'ready', 'picked_up'];
  const flow = order.order_type === 'takeaway' ? takeawayFlow : deliveryFlow;
  if (order.status === 'cancelled' || order.status === 'delivered' || (order.status === 'picked_up' && order.order_type === 'takeaway')) return [];
  const index = flow.indexOf(order.status);
  const next = index >= 0 && flow[index + 1] ? [flow[index + 1]] : [];
  next.push('cancelled');
  return [...new Set(next)];
}

function isAlertableOrder(order) {
  return ['Paid', 'Partially Paid', 'COD'].includes(order.payment_status) && order.status === 'received';
}

function OrderAlertModal({ order, alertCount, soundBlocked, alertsEnabled, onEnableSound, onView, onAccept }) {
  return (
    <div className="admin-modal-backdrop full-screen-alert" role="dialog" aria-modal="true" aria-label="New order alert">
      <section className="admin-order-modal new-order-fullscreen-card">
        <div className="order-alert-icon"><Bell size={26} /></div>
        <span className="eyebrow">NEW ORDER RECEIVED</span>
        <h2>{order.order_number}</h2>
        {alertCount > 1 ? <p className="notice warning">{alertCount} unaccepted orders waiting</p> : null}
        {soundBlocked || !alertsEnabled ? <p className="notice warning">Click Enable Sound to hear order alerts.</p> : null}
        <div className="order-alert-grid">
          <div><span>Customer</span><strong>{order.customer_name || 'Customer'}</strong></div>
          <div><span>Order Type</span><strong>{order.order_type === 'takeaway' ? 'Takeaway' : 'Delivery'}</strong></div>
          <div><span>Items</span><strong>{Number(order.items_count || 0)} items</strong></div>
          <div><span>Payment</span><strong>{order.payment_status}</strong></div>
          <div><span>Total</span><strong>{inr(order.total_amount)}</strong></div>
        </div>
        <p className="order-alert-items">{order.items_summary || 'Items will appear in the order list.'}</p>
        <div className="action-row">
          <button className="ghost" onClick={onView}><Eye size={16} /> View Order</button>
          {soundBlocked || !alertsEnabled ? <button className="ghost" onClick={onEnableSound}><Bell size={16} /> Enable Sound</button> : null}
          <button className="accept-order-button" onClick={onAccept}><Bell size={20} /> ACCEPT ORDER</button>
        </div>
      </section>
    </div>
  );
}

function AcceptOrderModal({ order, prepMinutes, customPrepMinutes, onPrepChange, onCustomChange, onClose, onAccept }) {
  return (
    <div className="admin-modal-backdrop accept-order-backdrop" role="dialog" aria-modal="true" aria-label="Accept order">
      <section className="admin-order-modal">
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close preparation time dialog"><X size={18} /></button>
        <span className="eyebrow">Preparation time</span>
        <h2>Accept {order.order_number}</h2>
        <p className="small-note">Set the estimated preparation time shown to the customer.</p>
        <div className="prep-choice-grid">
          {prepOptions.map(minutes => (
            <button key={minutes} className={prepMinutes === minutes ? 'prep-choice active' : 'prep-choice'} onClick={() => onPrepChange(minutes)}>{minutes} min</button>
          ))}
          <button className={prepMinutes === 'custom' ? 'prep-choice active' : 'prep-choice'} onClick={() => onPrepChange('custom')}>Custom</button>
        </div>
        {prepMinutes === 'custom' ? <input type="number" min="1" max="240" placeholder="Custom minutes" value={customPrepMinutes} onChange={event => onCustomChange(event.target.value)} /> : null}
        <div className="action-row">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button onClick={onAccept}><Clock size={16} /> Accept Order</button>
        </div>
      </section>
    </div>
  );
}

function OrderDetailsModal({ data, loading, onClose, onViewInvoice, onDownloadInvoice, onEmailInvoice }) {
  const order = data?.order;
  const items = data?.items || [];
  if (!order && !loading) return null;
  return (
    <div className="admin-modal-backdrop accept-order-backdrop" role="dialog" aria-modal="true" aria-label="Order details">
      <section className="admin-order-modal order-details-modal">
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close order details"><X size={18} /></button>
        {loading ? <div className="empty-state">Loading order details...</div> : (
          <>
            <span className="eyebrow">Order Details</span>
            <h2>{order.order_number}</h2>
            <div className="confirmation-grid compact">
              <div><span>Customer</span><strong>{order.customer_name || 'Customer'}</strong></div>
              <div><span>Mobile</span><strong>{order.customer_phone || '-'}</strong></div>
              <div><span>Email</span><strong>{order.customer_email || '-'}</strong></div>
              <div><span>Type</span><strong>{order.order_type === 'takeaway' ? 'Takeaway' : 'Delivery'}</strong></div>
              <div><span>Payment</span><strong>{order.payment_status}</strong></div>
              <div><span>Status</span><strong>{statusLabel(order.status)}</strong></div>
            </div>
            {order.delivery_address ? <p className="small-note"><strong>Address:</strong> {order.delivery_address}</p> : null}
            <div className="summary-items">
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
            </div>
            <div className="totals">
              <div><span>Subtotal</span><strong>{inr(order.subtotal)}</strong></div>
              <div><span>Delivery Charge</span><strong>{inr(order.delivery_charge)}</strong></div>
              <div><span>Discount</span><strong>-{inr(order.discount_amount)}</strong></div>
              <div><span>Paid</span><strong>{inr(order.paid_amount)}</strong></div>
              <div><span>Remaining</span><strong>{inr(order.remaining_amount)}</strong></div>
              <div className="grand"><span>Total</span><strong>{inr(order.total_amount)}</strong></div>
            </div>
            <div className="action-row confirmation-actions">
              <button className="ghost" onClick={() => onViewInvoice(order)}><FileText size={16} /> View Invoice</button>
              <button className="ghost" onClick={() => onViewInvoice(order)}><FileText size={16} /> Generate Invoice</button>
              <button className="ghost" onClick={() => onDownloadInvoice(order)}><Printer size={16} /> Download / Print</button>
              <button className="ghost" onClick={() => onEmailInvoice(order)}><Mail size={16} /> Email Invoice</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function AdminMiniMap({ order }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !window.google?.maps || !order.driver_latitude || !order.latitude) return;
    const driver = { lat: Number(order.driver_latitude), lng: Number(order.driver_longitude) };
    const customer = { lat: Number(order.latitude), lng: Number(order.longitude) };
    const map = new window.google.maps.Map(ref.current, {
      center: driver,
      zoom: 13,
      disableDefaultUI: true,
      zoomControl: true
    });
    new window.google.maps.Marker({ map, position: driver, label: 'D', title: 'Delivery boy' });
    new window.google.maps.Marker({ map, position: customer, label: 'C', title: 'Customer' });
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend(driver);
    bounds.extend(customer);
    map.fitBounds(bounds);
  }, [order.driver_latitude, order.driver_longitude, order.latitude, order.longitude]);

  return <div ref={ref} className="admin-mini-map" aria-label="Live delivery map" />;
}

const themeLabels = {
  background_color: 'Website background colour',
  primary_color: 'Primary colour',
  secondary_color: 'Secondary colour',
  button_color: 'Button colour',
  button_hover_color: 'Button hover colour',
  button_text_color: 'Button text colour',
  text_color: 'Text colour',
  card_color: 'Card colour',
  header_color: 'Header colour',
  footer_color: 'Footer colour',
  border_color: 'Border colour',
  accent_color: 'Accent colour',
  font_family: 'Font family',
  heading_font_size: 'Heading font size',
  body_font_size: 'Body font size',
  button_font_size: 'Button font size',
  navigation_font_size: 'Navigation font size',
  product_font_size: 'Product title/price font size',
  button_border_radius: 'Button border radius',
  button_padding: 'Button padding',
  button_font_weight: 'Button font weight',
  card_border_radius: 'Card border radius',
  logo_url: 'Logo',
  favicon_url: 'Favicon'
};

export default function AdminPage() {
  const [login, setLogin] = useState({ email: '', password: '' });
  const [admin, setAdmin] = useState(null);
  const [active, setActive] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({});
  const [productImageFile, setProductImageFile] = useState(null);
  const [productImagePreview, setProductImagePreview] = useState('');
  const [editing, setEditing] = useState(null);
  const [orders, setOrders] = useState([]);
  const [orderDetails, setOrderDetails] = useState(null);
  const [orderDetailsLoading, setOrderDetailsLoading] = useState(false);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [deliveryBoyForm, setDeliveryBoyForm] = useState({ name: '', phone: '', email: '', password: '', is_active: '1' });
  const [editingDeliveryBoy, setEditingDeliveryBoy] = useState(null);
  const [payments, setPayments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState({});
  const [theme, setTheme] = useState({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [newOrderAlert, setNewOrderAlert] = useState(null);
  const [alertQueue, setAlertQueue] = useState([]);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [acceptingOrder, setAcceptingOrder] = useState(null);
  const [prepMinutes, setPrepMinutes] = useState(15);
  const [customPrepMinutes, setCustomPrepMinutes] = useState('');
  const pollingRef = useRef(false);
  const audioContextRef = useRef(null);
  const soundTimerRef = useRef(null);
  const vibratingRef = useRef(null);
  const activeSoundOrderRef = useRef(null);

  const resourceFields = useMemo(() => resources[active] || [], [active]);
  const activeLabel = tabs.find(([id]) => id === active)?.[1] || 'Admin';

  const adminRequest = (path, options = {}) => adminApi(path, options);
  const adminUploadRequest = (path, formData, options = {}) => adminUploadApi(path, formData, options);

  useEffect(() => {
    api('/theme').then(t => {
      setTheme(t.theme);
      applyTheme(t.theme);
    }).catch(() => {});
    setAlertsEnabled(localStorage.getItem('pizza_house_admin_alerts_enabled') === '1');
    if (token()) {
      adminRequest('/auth/me').then(data => {
        if (data.user.role === 'admin') setAdmin(data.user);
      }).catch(() => clearToken());
    } else {
      refreshAdminSession().then(data => {
        if (data.user.role === 'admin') setAdmin(data.user);
      }).catch(() => {});
    }
    return stopAlertEffects;
  }, []);

  useEffect(() => {
    if (admin) loadActive();
  }, [active, admin]);

  useEffect(() => {
    if (!admin) return;
    pollOrdersForAlerts();
    const timer = setInterval(pollOrdersForAlerts, 5000);
    return () => clearInterval(timer);
  }, [admin]);

  useEffect(() => {
    if (newOrderAlert) {
      startAlertEffects(newOrderAlert);
    } else {
      stopAlertEffects();
    }
  }, [newOrderAlert?.id, alertsEnabled]);

  async function adminLogin() {
    setLoading(true);
    setMessage('');
    try {
      const data = await api('/auth/admin-login', { method: 'POST', body: JSON.stringify(login) });
      setToken(data.token);
      setAdmin(data.user);
      setMessage('Welcome back.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    stopAlertEffects();
    await adminLogout().catch(() => clearToken());
    setAdmin(null);
    setStats(null);
    setMessage('');
    setAlertQueue([]);
    setNewOrderAlert(null);
  }

  async function loadActive() {
    try {
      if (active === 'dashboard') setStats((await adminRequest('/admin/dashboard')).stats);
      else if (resources[active]) setItems((await adminRequest(`/admin/${active}`)).items);
      else if (active === 'orders') {
        const [ordersData, boysData] = await Promise.all([adminRequest('/admin/orders'), adminRequest('/admin/delivery-boys')]);
        setOrders(ordersData.orders || []);
        setDeliveryBoys(boysData.delivery_boys || []);
      }
      else if (active === 'delivery-boys') setDeliveryBoys((await adminRequest('/admin/delivery-boys')).delivery_boys || []);
      else if (active === 'payments') setPayments((await adminRequest('/admin/payments')).payments);
      else if (active === 'notifications') setNotifications((await adminRequest('/admin/notifications')).notifications);
      else if (active === 'settings') setSettings((await adminRequest('/admin/settings')).settings);
      else if (active === 'theme') {
        const data = await adminRequest('/admin/theme');
        setTheme(data.theme);
        applyTheme(data.theme);
      }
    } catch (err) {
      setMessage(err.message);
    }
  }

  function playOrderAlertSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        setSoundBlocked(true);
        return false;
      }
      const context = audioContextRef.current || new AudioContext();
      audioContextRef.current = context;
      if (context.state !== 'running') {
        setSoundBlocked(true);
        return false;
      }
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.32, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.75);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.8);
      setSoundBlocked(false);
      return true;
    } catch {
      setSoundBlocked(true);
      return false;
    }
  }

  async function enableOrderAlerts() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const context = audioContextRef.current || new AudioContext();
        audioContextRef.current = context;
        if (context.state === 'suspended') await context.resume();
      }
      localStorage.setItem('pizza_house_admin_alerts_enabled', '1');
      setAlertsEnabled(true);
      setSoundBlocked(false);
      playOrderAlertSound();
    } catch {
      setSoundBlocked(true);
    }
  }

  function stopAlertEffects() {
    if (soundTimerRef.current) clearInterval(soundTimerRef.current);
    if (vibratingRef.current) clearInterval(vibratingRef.current);
    soundTimerRef.current = null;
    vibratingRef.current = null;
    activeSoundOrderRef.current = null;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(0);
  }

  function startAlertEffects(order) {
    if (!order || activeSoundOrderRef.current === order.id) return;
    stopAlertEffects();
    activeSoundOrderRef.current = order.id;
    showBrowserOrderNotification(order);
    if (alertsEnabled) {
      const played = playOrderAlertSound();
      if (played) soundTimerRef.current = setInterval(playOrderAlertSound, 2600);
    } else {
      setSoundBlocked(true);
    }
    if ('vibrate' in navigator) {
      navigator.vibrate([700, 180, 700]);
      vibratingRef.current = setInterval(() => navigator.vibrate([700, 180, 700]), 2600);
    }
  }

  function showBrowserOrderNotification(order) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(`New order ${order.order_number}`, {
      body: `${order.customer_name || 'Customer'} - ${inr(order.total_amount)} - ${order.payment_status}`,
      tag: `order-${order.id}`
    });
  }

  async function pollOrdersForAlerts() {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const data = await adminRequest('/admin/orders');
      const nextOrders = data.orders || [];
      setOrders(nextOrders);
      const pendingAlerts = nextOrders.filter(isAlertableOrder).sort((a, b) => Number(a.id) - Number(b.id));
      setAlertQueue(pendingAlerts);
      setNewOrderAlert(pendingAlerts[0] || null);
    } catch {
      // Keep polling quiet; visible API errors still show through normal tab loading.
    } finally {
      pollingRef.current = false;
    }
  }

  async function saveResource() {
    try {
      let payload = { ...form };
      if (active === 'products' && productImageFile) {
        const uploadForm = new FormData();
        uploadForm.append('image', productImageFile);
        uploadForm.append('name', payload.name || 'product');
        const uploaded = await adminUploadRequest('/admin/product-image', uploadForm);
        payload = { ...payload, image_url: uploaded.image_url };
      }
      if (editing) await adminRequest(`/admin/${active}/${editing}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await adminRequest(`/admin/${active}`, { method: 'POST', body: JSON.stringify(payload) });
      setForm({});
      clearProductImageSelection();
      setEditing(null);
      setMessage('Saved successfully.');
      loadActive();
    } catch (err) {
      setMessage(err.message);
    }
  }

  function editResource(item) {
    const next = {};
    resourceFields.forEach(field => { next[field] = item[field] ?? ''; });
    setForm(next);
    clearProductImageSelection();
    setEditing(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearProductImageSelection() {
    if (productImagePreview) URL.revokeObjectURL(productImagePreview);
    setProductImageFile(null);
    setProductImagePreview('');
  }

  function selectProductImage(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage('Only JPG, PNG or WEBP product images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Product image must be 5MB or smaller.');
      return;
    }
    clearProductImageSelection();
    setProductImageFile(file);
    setProductImagePreview(URL.createObjectURL(file));
    setMessage('');
  }

  async function deleteResource(id) {
    try {
      await adminRequest(`/admin/${active}/${id}`, { method: 'DELETE' });
      setMessage('Deleted.');
      loadActive();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function updateOrder(order, patch) {
    try {
      await adminRequest(`/admin/orders/${order.id}`, { method: 'PUT', body: JSON.stringify(patch) });
      setMessage('Order updated.');
      loadActive();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function assignDeliveryBoy(order, deliveryBoyId) {
    await updateOrder(order, { delivery_boy_id: deliveryBoyId || null });
  }

  async function saveDeliveryBoy() {
    try {
      const payload = { ...deliveryBoyForm, is_active: deliveryBoyForm.is_active === '1' ? 1 : 0 };
      if (editingDeliveryBoy) {
        await api(`/admin/delivery-boys/${editingDeliveryBoy}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await adminRequest('/admin/delivery-boys', { method: 'POST', body: JSON.stringify(payload) });
      }
      setDeliveryBoyForm({ name: '', phone: '', email: '', password: '', is_active: '1' });
      setEditingDeliveryBoy(null);
      setMessage('Delivery boy saved.');
      setDeliveryBoys((await adminRequest('/admin/delivery-boys')).delivery_boys || []);
    } catch (err) {
      setMessage(err.message);
    }
  }

  function editDeliveryBoy(boy) {
    setEditingDeliveryBoy(boy.id);
    setDeliveryBoyForm({ name: boy.name || '', phone: boy.phone || '', email: boy.email || '', password: '', is_active: String(boy.is_active ?? '1') });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openAcceptOrder(order) {
    setAcceptingOrder(order);
    setPrepMinutes(15);
    setCustomPrepMinutes('');
  }

  async function acceptOrder(order) {
    const minutes = prepMinutes === 'custom' ? Number(customPrepMinutes) : Number(prepMinutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) {
      setMessage('Preparation minutes must be between 1 and 240.');
      return;
    }
    await updateOrder(order, { status: 'accepted', preparation_minutes: minutes });
    setAcceptingOrder(null);
    const nextQueue = alertQueue.filter(item => item.id !== order.id);
    setAlertQueue(nextQueue);
    setNewOrderAlert(nextQueue[0] || null);
    pollOrdersForAlerts();
  }

  function viewAlertOrder(order) {
    setActive('orders');
    setTimeout(() => document.getElementById(`admin-order-${order.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }

  async function openOrderDetails(order) {
    setOrderDetailsLoading(true);
    setActive('orders');
    try {
      const data = await adminRequest(`/admin/orders/${order.id}/tracking`);
      setOrderDetails(data);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setOrderDetailsLoading(false);
    }
  }

  async function viewAdminInvoice(order, download = false) {
    try {
      const path = `/admin/orders/${order.id}/invoice`;
      if (download) await downloadInvoice(path, `invoice-${order.order_number}.pdf`);
      else await openInvoice(path);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function emailAdminInvoice(order) {
    try {
      const data = await adminRequest(`/admin/orders/${order.id}/email-invoice`, { method: 'POST', body: JSON.stringify({}) });
      setMessage(data.email?.ok ? 'Invoice email sent.' : `Invoice email ${data.email?.status || 'failed'}: ${data.email?.error || 'Check email settings.'}`);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function saveSettings() {
    try {
      const data = await adminRequest('/admin/settings', { method: 'PUT', body: JSON.stringify(settings) });
      setSettings(data.settings);
      setMessage('Settings saved.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function saveTheme() {
    try {
      const data = await adminRequest('/admin/theme', { method: 'PUT', body: JSON.stringify(theme) });
      setTheme(data.theme);
      applyTheme(data.theme);
      setMessage('Theme saved.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function resetTheme() {
    try {
      const data = await adminRequest('/admin/theme', { method: 'DELETE' });
      setTheme(data.theme);
      applyTheme(data.theme);
      setMessage('Theme reset to defaults.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  function updateTheme(key, value) {
    const next = { ...theme, [key]: value };
    setTheme(next);
    applyTheme(next);
  }

  function adminField(field, value, onChange) {
    const options = fieldOptions[field];
    if (options) {
      return <select value={value || ''} onChange={e => onChange(e.target.value)}><option value="">Select</option>{options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>;
    }
    if (field.includes('description') || field.includes('address')) return <textarea value={value || ''} onChange={e => onChange(e.target.value)} />;
    const numberFields = ['price','stock','low_stock_threshold','discount_value','min_order_value','max_discount','overall_usage_limit','per_customer_limit','buy_qty','get_qty','scope_id','category_id','min_km','max_km','charge','sort_order','partial_payment_value','minimum_order','restaurant_latitude','restaurant_longitude'];
    return <input type={numberFields.includes(field) ? 'number' : 'text'} value={value || ''} onChange={e => onChange(e.target.value)} />;
  }

  if (!admin) {
    return (
      <main className="admin-login-screen">
        <section className="admin-login-card">
          <Link href="/" className="brand mark"><span className="brand-icon">TP</span><span>The Pizza House</span></Link>
          <div>
            <span className="eyebrow">Admin portal</span>
            <h1>Sign in to manage orders</h1>
            <p>Use your admin account to manage menu items, offers, payments, delivery slabs, and the theme customizer.</p>
          </div>
          {message ? <p className="notice error">{message}</p> : null}
          <input placeholder="Admin email" value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} />
          <input type="password" placeholder="Password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} />
          <button onClick={adminLogin} disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
          <Link href="/" className="small-note">Back to customer website</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? <Script src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`} strategy="afterInteractive" /> : null}
      {newOrderAlert ? (
        <OrderAlertModal
          order={newOrderAlert}
          alertCount={alertQueue.length}
          soundBlocked={soundBlocked}
          alertsEnabled={alertsEnabled}
          onEnableSound={enableOrderAlerts}
          onView={() => viewAlertOrder(newOrderAlert)}
          onAccept={() => openAcceptOrder(newOrderAlert)}
        />
      ) : null}
      {acceptingOrder ? (
        <AcceptOrderModal
          order={acceptingOrder}
          prepMinutes={prepMinutes}
          customPrepMinutes={customPrepMinutes}
          onPrepChange={setPrepMinutes}
          onCustomChange={setCustomPrepMinutes}
          onClose={() => setAcceptingOrder(null)}
          onAccept={() => acceptOrder(acceptingOrder)}
        />
      ) : null}
      {(orderDetails || orderDetailsLoading) ? (
        <OrderDetailsModal
          data={orderDetails}
          loading={orderDetailsLoading}
          onClose={() => { setOrderDetails(null); setOrderDetailsLoading(false); }}
          onViewInvoice={order => viewAdminInvoice(order, false)}
          onDownloadInvoice={order => viewAdminInvoice(order, true)}
          onEmailInvoice={emailAdminInvoice}
        />
      ) : null}
      <aside className={mobileNav ? 'admin-sidebar open' : 'admin-sidebar'}>
        <div className="row">
          <Link href="/" className="brand mark"><span className="brand-icon">TP</span><span>The Pizza House</span></Link>
          <button className="icon-button mobile-only" onClick={() => setMobileNav(false)}><X size={18} /></button>
        </div>
        <nav>
          {tabs.map(([id, label, Icon]) => (
            <button className={active === id ? 'admin-nav active' : 'admin-nav'} key={id} onClick={() => { setActive(id); setMobileNav(false); }}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
        <button className="admin-nav" onClick={logout}><LogOut size={18} /> Logout</button>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          <div><span className="eyebrow">Admin</span><h1>{activeLabel}</h1></div>
          <div className="admin-topbar-actions">
            {(!alertsEnabled || soundBlocked) ? <button className="ghost" onClick={enableOrderAlerts}><Bell size={16} /> Enable Order Alerts</button> : null}
            <div className="admin-profile">{admin.name?.[0] || 'A'}<span>{admin.email}</span></div>
          </div>
        </header>
        {message ? <p className="notice success">{message}</p> : null}

        {active === 'dashboard' && (
          <div className="stat-grid">
            {stats ? Object.entries(stats).map(([key, value]) => (
              <article className="stat-card" key={key}>
                <p>{key.replaceAll('_', ' ')}</p>
                <h2>{key.includes('revenue') || key.includes('payments') ? inr(value) : value}</h2>
              </article>
            )) : <div className="empty-state">Loading dashboard...</div>}
          </div>
        )}

        {resources[active] && (
          <div className="admin-content-grid">
            <section className="panel">
              <div className="panel-heading"><h2>{editing ? 'Edit' : 'Add'} {active.replace('-', ' ')}</h2><p>Changes save through the existing PHP admin API.</p></div>
              <div className="form-grid">
                {resourceFields.map(field => field === 'image_url' && active === 'products'
                  ? <ProductImageUpload key={field} value={form.image_url || ''} file={productImageFile} preview={productImagePreview} onSelect={selectProductImage} onRemove={() => { clearProductImageSelection(); setForm({ ...form, image_url: '' }); }} />
                  : <label key={field}>{field.replaceAll('_', ' ')}{adminField(field, form[field], value => setForm({ ...form, [field]: value }))}</label>)}
              </div>
              <div className="action-row">
                <button onClick={saveResource}>Save</button>
                {editing ? <button className="ghost" onClick={() => { setEditing(null); setForm({}); clearProductImageSelection(); }}>Cancel</button> : null}
              </div>
            </section>
            <section className="panel table-panel">
              <div className="panel-heading"><h2>{active.replace('-', ' ')}</h2></div>
              <div className="table-wrap">
                <table>
                  <thead><tr>{resourceFields.slice(0, 6).map(f => <th key={f}>{f.replaceAll('_', ' ')}</th>)}<th>Actions</th></tr></thead>
                  <tbody>{items.map((item, index) => (
                    <tr key={item.id}>
                      {resourceFields.slice(0, 6).map(f => <td key={f}>{f === 'image_url' && item[f] ? <img className="table-thumb" src={productImage(item, index)} alt="" /> : String(item[f] ?? '')}</td>)}
                      <td><div className="action-row"><button className="ghost" onClick={() => editResource(item)}>Edit</button><button className="ghost danger" onClick={() => deleteResource(item.id)}>Delete</button></div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {active === 'orders' && (
          <section className="panel table-panel">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Customer</th><th>Type</th><th>Items</th><th>Total</th><th>Paid</th><th>Payment</th><th>Delivery Boy</th><th>Tracking</th><th>Ready</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{orders.map(order => {
                  const next = nextStatuses(order);
                  return (
                    <tr id={`admin-order-${order.id}`} key={order.id}>
                      <td><strong>{order.order_number}</strong><p className="small-note">{order.created_at}</p></td>
                      <td>{order.customer_name || 'Customer'}<p className="small-note">{order.customer_phone || ''}</p></td>
                      <td><span className="badge">{order.order_type === 'takeaway' ? 'Takeaway' : 'Delivery'}</span><p className="small-note">{order.order_type === 'takeaway' ? 'Pickup order' : `${order.distance_km || '-'} km`}</p></td>
                      <td className="admin-items-summary">{order.items_summary || '-'}</td>
                      <td>{inr(order.total_amount)}</td>
                      <td>{inr(order.paid_amount)}<p className="small-note">Due {inr(order.remaining_amount)}</p></td>
                      <td><span className="badge">{order.payment_status}</span><p className="small-note">{order.payment_mode}</p></td>
                      <td>
                        {order.order_type === 'delivery' ? (
                          <select value={order.delivery_boy_id || ''} onChange={e => assignDeliveryBoy(order, e.target.value)} disabled={['out_for_delivery','delivered','cancelled'].includes(order.status)}>
                            <option value="">Unassigned</option>
                            {deliveryBoys.filter(boy => Number(boy.is_active) === 1).map(boy => <option key={boy.id} value={boy.id}>{boy.name}</option>)}
                          </select>
                        ) : '-'}
                        {order.delivery_boy_name ? <p className="small-note">{order.delivery_boy_name}</p> : null}
                      </td>
                      <td>
                        {order.driver_recorded_at ? <><span className="badge success">Live</span><p className="small-note">Last location {order.driver_recorded_at}</p></> : <span className="small-note">No live location</span>}
                        {order.driver_latitude && order.latitude ? <AdminMiniMap order={order} /> : null}
                      </td>
                      <td>{order.estimated_ready_at ? <><strong>{order.estimated_ready_at}</strong><p className="small-note">{order.preparation_minutes} min prep</p></> : '-'}</td>
                      <td><span className="badge success">{statusLabel(order.status)}</span></td>
                      <td>
                        <div className="order-action-stack">
                          <button className="ghost" onClick={() => openOrderDetails(order)}><Eye size={16} /> Details</button>
                          <button className="ghost" onClick={() => viewAdminInvoice(order, false)}><FileText size={16} /> Invoice</button>
                          {order.status === 'received' && isAlertableOrder(order) ? <button className="ghost" onClick={() => openAcceptOrder(order)}><Clock size={16} /> Accept</button> : null}
                          {next.filter(status => status !== 'accepted').map(status => <button key={status} className={status === 'cancelled' ? 'ghost danger' : 'ghost'} onClick={() => updateOrder(order, { status })}>{statusLabel(status)}</button>)}
                        </div>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </section>
        )}

        {active === 'delivery-boys' && (
          <div className="admin-content-grid">
            <section className="panel">
              <div className="panel-heading"><h2>{editingDeliveryBoy ? 'Edit' : 'Add'} Delivery Boy</h2><p>Create delivery login accounts for assigned orders.</p></div>
              <div className="form-grid">
                <label>Name<input value={deliveryBoyForm.name} onChange={e => setDeliveryBoyForm({ ...deliveryBoyForm, name: e.target.value })} /></label>
                <label>Phone<input value={deliveryBoyForm.phone} onChange={e => setDeliveryBoyForm({ ...deliveryBoyForm, phone: e.target.value })} /></label>
                <label>Email<input type="email" value={deliveryBoyForm.email} onChange={e => setDeliveryBoyForm({ ...deliveryBoyForm, email: e.target.value })} /></label>
                <label>Password<input type="password" placeholder={editingDeliveryBoy ? 'Leave blank to keep current password' : ''} value={deliveryBoyForm.password} onChange={e => setDeliveryBoyForm({ ...deliveryBoyForm, password: e.target.value })} /></label>
                <label>Status<select value={deliveryBoyForm.is_active} onChange={e => setDeliveryBoyForm({ ...deliveryBoyForm, is_active: e.target.value })}><option value="1">Active</option><option value="0">Inactive</option></select></label>
              </div>
              <div className="action-row">
                <button onClick={saveDeliveryBoy}>{editingDeliveryBoy ? 'Save Delivery Boy' : 'Add Delivery Boy'}</button>
                {editingDeliveryBoy ? <button className="ghost" onClick={() => { setEditingDeliveryBoy(null); setDeliveryBoyForm({ name: '', phone: '', email: '', password: '', is_active: '1' }); }}>Cancel</button> : null}
              </div>
            </section>
            <section className="panel table-panel">
              <div className="panel-heading"><h2>Delivery Boys</h2></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>{deliveryBoys.map(boy => <tr key={boy.id}><td>{boy.name}</td><td>{boy.phone}</td><td>{boy.email}</td><td><span className={Number(boy.is_active) === 1 ? 'badge success' : 'badge warning'}>{Number(boy.is_active) === 1 ? 'Active' : 'Inactive'}</span></td><td><button className="ghost" onClick={() => editDeliveryBoy(boy)}>Edit</button></td></tr>)}</tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {active === 'payments' && <DataTable rows={payments} columns={['order_number','amount','status','razorpay_order_id','razorpay_payment_id','created_at']} moneyCols={['amount']} />}
        {active === 'notifications' && <DataTable rows={notifications} columns={['channel','recipient','message','status','created_at']} />}

        {active === 'settings' && (
          <section className="panel">
            <div className="panel-heading"><h2>General and Payment Settings</h2><p>Controls restaurant details, checkout authentication, COD, full payment, and partial payment configuration.</p></div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={(settings.customer_login_required || '0') === '1'}
                onChange={e => setSettings({ ...settings, customer_login_required: e.target.checked ? '1' : '0' })}
              />
              <span>
                <strong>Customer Checkout Authentication</strong>
                <small>Require customers to login or register before placing checkout orders.</small>
              </span>
            </label>
            <div className="form-grid three">{Object.keys(settings).filter(key => key !== 'customer_login_required').map(key => <label key={key}>{key.replaceAll('_', ' ')}{adminField(key, settings[key], value => setSettings({ ...settings, [key]: value }))}</label>)}</div>
            <button onClick={saveSettings}><Save size={16} /> Save Changes</button>
          </section>
        )}

        {active === 'theme' && (
          <div className="theme-layout">
            <section className="panel">
              <div className="panel-heading"><h2>Theme Settings</h2><p>These values persist in MySQL and drive the frontend CSS variables.</p></div>
              <div className="theme-control-grid">{Object.entries(themeLabels).map(([key, label]) => <label key={key}>{label}<input type={key.includes('color') || key.includes('colour') ? 'color' : 'text'} value={theme[key] || ''} onChange={e => updateTheme(key, e.target.value)} /></label>)}</div>
              <div className="action-row"><button onClick={saveTheme}><Save size={16} /> Save Changes</button><button className="ghost" onClick={resetTheme}><RotateCcw size={16} /> Reset</button></div>
            </section>
            <section className="theme-preview">
              <span className="eyebrow">Live preview</span>
              <h2>Premium pizza night</h2>
              <p>Preview typography, colors, card radius, buttons, and product styling before saving.</p>
              <button>Primary Button</button>
              <article className="product-card compact"><img src={productImage({}, 0)} alt="" /><div className="product-body"><h3>Margherita Pizza</h3><span className="price">INR 299.00</span><p>Fresh basil, tomato, and mozzarella.</p></div></article>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function ProductImageUpload({ value, file, preview, onSelect, onRemove }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const currentPreview = preview || (value ? productImage({ image_url: value }) : '');
  const fileSize = file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : '';

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    onSelect(event.dataTransfer.files?.[0]);
  }

  return (
    <div className="upload-field">
      <span>Product Image</span>
      <div
        className={dragging ? 'image-dropzone dragging' : 'image-dropzone'}
        onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {currentPreview ? (
          <div className="image-preview-card">
            <img src={currentPreview} alt="Product preview" />
            <div>
              <strong>{file?.name || 'Current product image'}</strong>
              <p>{file ? fileSize : value}</p>
              <div className="action-row">
                <button type="button" className="ghost" onClick={() => inputRef.current?.click()}><Upload size={16} /> Replace Image</button>
                <button type="button" className="ghost danger" onClick={onRemove}>Remove</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="dropzone-empty">
            <Camera size={34} />
            <strong>Drag & Drop image here</strong>
            <span>or</span>
            <button type="button" className="ghost" onClick={() => inputRef.current?.click()}><Upload size={16} /> Choose from Device</button>
            <small>JPG, PNG or WEBP - Max 5MB</small>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          onChange={event => onSelect(event.target.files?.[0])}
          hidden
        />
      </div>
    </div>
  );
}

function DataTable({ rows, columns, moneyCols = [] }) {
  return (
    <section className="panel table-panel">
      <div className="table-wrap">
        <table>
          <thead><tr>{columns.map(col => <th key={col}>{col.replaceAll('_', ' ')}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>{columns.map(col => <td key={col}>{moneyCols.includes(col) ? inr(row[col]) : String(row[col] ?? '')}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

