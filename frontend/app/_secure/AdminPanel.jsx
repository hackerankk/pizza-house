'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { Bell, Camera, Clock, CreditCard, Eye, FileText, Gift, KeyRound, LayoutDashboard, LogOut, Mail, MapPinned, Megaphone, Menu, Palette, Power, Printer, RotateCcw, Save, Settings, ShieldAlert, ShoppingBag, Tag, Truck, Upload, UserRound, Utensils, X } from 'lucide-react';
import { API_BASE, adminApi, adminLogout, adminUploadApi, api, applyTheme, clearToken, downloadInvoice, inr, itemSelectionText, itemVariantText, openInvoice, productImage, refreshAdminSession, setThemeMode, setToken, storedThemeMode, token } from '../lib';

const resources = {
  products: ['category_id', 'name', 'description', 'price', 'stock', 'low_stock_threshold', 'image_url', 'is_active'],
  categories: ['name', 'description', 'image_url', 'sort_order', 'is_active'],
  coupons: ['code', 'discount_type', 'discount_value', 'min_order_value', 'max_discount', 'starts_at', 'expires_at', 'overall_usage_limit', 'per_customer_limit', 'is_active'],
  offers: ['name', 'offer_type', 'applies_to', 'category_ids', 'product_ids', 'discount_value', 'weekdays', 'size_rules', 'start_time', 'end_time', 'buy_product_id', 'buy_qty', 'free_product_id', 'get_qty', 'starts_at', 'expires_at', 'is_active'],
  'delivery-slabs': ['min_order_amount', 'free_delivery_distance_km', 'free_delivery_enabled', 'charge', 'priority', 'is_active'],
  'promotional-banners': ['title', 'subtitle', 'image_url', 'button_text', 'destination_type', 'destination_value', 'display_order', 'start_at', 'end_at', 'is_active'],
  'promotional-marquee': ['message', 'link', 'display_order', 'start_at', 'end_at', 'is_active'],
  'promotional-popups': ['title', 'description', 'image_url', 'offer_text', 'button_text', 'destination_type', 'destination_value', 'display_frequency', 'display_order', 'start_at', 'end_at', 'is_active']
};

const tabs = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['orders', 'Orders', ShoppingBag],
  ['payments', 'Payments', CreditCard],
  ['products', 'Products', Utensils],
  ['categories', 'Categories', Menu],
  ['coupons', 'Coupons', Tag],
  ['offers', 'Offers', Tag],
  ['promotional-banners', 'Promotional Banners', Gift],
  ['promotional-marquee', 'Promotional Marquee', Megaphone],
  ['promotional-popups', 'Offer Popup', Gift],
  ['delivery-slabs', 'Delivery Slabs', Truck],
  ['delivery-boys', 'Delivery Boys', Truck],
  ['staff', 'Staff', UserRound],
  ['staff-performance', 'Staff Performance', CreditCard],
  ['reports-sales', 'Sales Report', CreditCard],
  ['theme', 'Theme Settings', Palette],
  ['settings', 'General Settings', Settings],
  ['order-availability', 'Order Availability', Power],
  ['appearance', 'Appearance', Palette],
  ['integrations', 'Integrations', KeyRound],
  ['feature-controls', 'Feature Controls', ShieldAlert],
  ['notifications', 'Notifications', Bell]
];

const navSections = [
  { label: 'Main', items: ['dashboard', 'orders', 'payments'] },
  { label: 'Catalog', items: ['products', 'categories', 'coupons', 'offers'] },
  { label: 'Promotional', items: ['promotional-banners', 'promotional-marquee', 'promotional-popups'] },
  { label: 'People', items: ['staff', 'staff-performance', 'delivery-boys'] },
  { label: 'Reports', items: ['reports-sales'] },
  { label: 'Delivery', items: ['delivery-slabs'] },
  { label: 'Settings', items: ['order-availability', 'integrations', 'appearance', 'feature-controls'] },
  { label: 'More', items: ['theme', 'settings', 'notifications'] }
];

const tabMeta = Object.fromEntries(tabs.map(tab => [tab[0], tab]));

const fieldOptions = {
  is_active: [['1', 'Active'], ['0', 'Inactive']],
  discount_type: [['flat', 'Flat'], ['percent', 'Percent']],
  offer_type: [['fixed', 'Fixed discount'], ['percent', 'Percentage discount'], ['bogo', 'Buy One Get One']],
  applies_to: [['order', 'Entire Order'], ['category', 'Category'], ['product', 'Product']],
  partial_payment_type: [['percent', 'Percent advance'], ['fixed', 'Fixed advance']],
  partial_payment_enabled: [['1', 'Enabled'], ['0', 'Disabled']],
  cod_enabled: [['1', 'Enabled'], ['0', 'Disabled']],
  full_payment_enabled: [['1', 'Enabled'], ['0', 'Disabled']],
  customer_login_required: [['0', 'Guest checkout allowed'], ['1', 'Login required']]
  ,
  free_delivery_enabled: [['1', 'Free Delivery ON'], ['0', 'Free Delivery OFF']],
  destination_type: [['none', 'None'], ['product', 'Product'], ['category', 'Category'], ['offer', 'Offer'], ['custom_url', 'Custom URL']],
  display_frequency: [['session', 'Once per session'], ['daily', 'Once per day'], ['every_visit', 'Every visit']]
};

const prepOptions = [10, 15, 20, 30];
const weekDays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const pizzaSizes = [['S', 'Small'], ['M', 'Medium'], ['L', 'Large']];
const featureControlKeys = ['customer_theme_enabled', 'customer_dark_mode_enabled', 'online_ordering_enabled', 'delivery_enabled', 'takeaway_enabled', 'staff_pos_enabled', 'razorpay_enabled', 'google_maps_enabled', 'guest_checkout_enabled', 'customer_login_enabled'];
const hiddenGeneralSettings = new Set(['customer_login_required', 'accept_orders', 'force_close_orders', 'order_manual_override', 'order_schedule', 'customer_default_theme', 'admin_theme_mode', ...featureControlKeys]);

const featureControlLabels = {
  customer_theme_enabled: ['Customer Theme', 'Show customer-facing theme controls in the website header/menu.'],
  customer_dark_mode_enabled: ['Customer Dark Mode', 'Allow Dark and System mode choices for customers.'],
  online_ordering_enabled: ['Online Ordering', 'Globally allow customers to place new orders.'],
  delivery_enabled: ['Delivery', 'Allow delivery order type at checkout.'],
  takeaway_enabled: ['Takeaway', 'Allow takeaway/pickup order type at checkout.'],
  staff_pos_enabled: ['Staff POS', 'Allow staff users to access the counter POS screen.'],
  razorpay_enabled: ['Razorpay', 'Allow online Razorpay payments when configured.'],
  google_maps_enabled: ['Google Maps', 'Allow Maps-based checkout and tracking features when configured.'],
  guest_checkout_enabled: ['Guest Checkout', 'Allow checkout without a customer account.'],
  customer_login_enabled: ['Customer Login', 'Allow customer login/register pages.']
};

function statusLabel(status) {
  return String(status || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function availabilityModeLabel(availability) {
  if (!availability) return 'Loading';
  if (availability.manual_override === 'open') return 'Manually opened';
  if (availability.manual_override === 'closed') return 'Manually closed';
  return availability.schedule_open ? 'Open by schedule' : 'Closed by schedule';
}

function adminLabel(field) {
  const labels = {
    name: 'Name',
    category_id: 'Category',
    category_ids: 'Applicable Categories',
    product_id: 'Product',
    product_ids: 'Specific Products Only',
    buy_product_id: 'Buy Product',
    free_product_id: 'Get Free Product',
    offer_type: 'Offer Type',
    applies_to: 'Applies To',
    discount_type: 'Discount Type',
    discount_value: 'Discount',
    min_order_value: 'Minimum Order',
    max_discount: 'Maximum Discount',
    min_order_amount: 'Minimum Order',
    free_delivery_distance_km: 'Free Delivery Distance',
    free_delivery_enabled: 'Free Delivery',
    charge: 'Delivery Charge',
    priority: 'Priority',
    buy_qty: 'Buy Quantity',
    get_qty: 'Free Quantity',
    starts_at: 'Start Date',
    expires_at: 'End Date',
    start_time: 'Start Time',
    end_time: 'End Time',
    weekdays: 'Runs On',
    size_rules: 'Size Rules',
    is_active: 'Status',
    image_url: 'Image',
    low_stock_threshold: 'Low Stock Alert',
    sort_order: 'Display Order'
  };
  return labels[field] || statusLabel(field);
}

function productStartingPrice(item) {
  const variants = Array.isArray(item?.variants) ? item.variants.filter(v => Number(v.is_active) !== 0) : [];
  if (variants.length) return Math.min(...variants.map(v => Number(v.price || item.price || 0)));
  return Number(item?.price || 0);
}

function readableStatus(value) {
  return Number(value) === 1 || value === '1' ? 'Active' : 'Inactive';
}

function orderStatusLabel(order) {
  if (order?.source === 'staff_offline') {
    if (order.status === 'received') return 'Pending';
    if (order.status === 'delivered') return 'Completed';
  }
  return statusLabel(order?.status);
}

function nextStatuses(order) {
  if (order.source === 'staff_offline') {
    if (order.status === 'received') return ['accepted'];
    if (order.status === 'accepted') return ['ready'];
    if (order.status === 'ready') return ['delivered'];
    return [];
  }
  const deliveryFlow = ['received', 'accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'delivered'];
  const takeawayFlow = ['received', 'accepted', 'preparing', 'ready', 'picked_up'];
  const flow = ['takeaway', 'dine_in'].includes(order.order_type) ? takeawayFlow : deliveryFlow;
  if (order.status === 'cancelled' || order.status === 'delivered' || (order.status === 'picked_up' && ['takeaway', 'dine_in'].includes(order.order_type))) return [];
  const index = flow.indexOf(order.status);
  const next = index >= 0 && flow[index + 1] ? [flow[index + 1]] : [];
  next.push('cancelled');
  return [...new Set(next)];
}

function adminOrderActionLabel(order, status) {
  if (order.source === 'staff_offline') {
    if (status === 'accepted') return 'Accept Order';
    if (status === 'ready') return 'Mark Ready';
    if (status === 'delivered') return 'Mark Delivered';
  }
  return statusLabel(status);
}

function isAlertableOrder(order) {
  return ['Paid', 'Partially Paid', 'COD'].includes(order.payment_status) && order.status === 'received';
}

function ToggleSwitch({ checked, onChange, label, description, disabled = false, danger = false }) {
  return (
    <button
      type="button"
      className={`toggle-row${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}${danger ? ' danger-toggle' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onChange(!checked);
        }
      }}
    >
      <span className="switch-track"><span className="switch-thumb" /></span>
      <span className="toggle-copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </button>
  );
}

function RestaurantPowerSwitch({ availability, onChange }) {
  const isOpen = Boolean(availability?.is_open);
  return (
    <button
      type="button"
      className={isOpen ? 'restaurant-power-switch open' : 'restaurant-power-switch closed'}
      onClick={() => onChange(isOpen ? 'closed' : 'open')}
      aria-pressed={isOpen}
      title={isOpen ? 'Turn OFF to stop accepting orders now' : 'Turn ON to accept orders now'}
    >
      <span className="restaurant-power-track"><span className="restaurant-power-thumb" /></span>
      <span className="restaurant-power-copy">
        <strong>{isOpen ? 'Restaurant Open' : 'Restaurant Closed'}</strong>
        <small>{isOpen ? 'Orders Available' : 'Currently Closed'}</small>
      </span>
    </button>
  );
}

function CheckboxMultiSelect({ options, value = [], onChange }) {
  const selected = Array.isArray(value) ? value.map(String) : [];
  const toggle = id => {
    const key = String(id);
    onChange(selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key]);
  };
  return (
    <div className="admin-multi-select">
      <div className="action-row"><button type="button" className="ghost" onClick={() => onChange(options.map(option => String(option.id)))}>Select All</button><button type="button" className="ghost" onClick={() => onChange([])}>Clear</button></div>
      <div className="admin-checkbox-grid">
        {options.map(option => <label key={option.id} className="settings-toggle compact"><input type="checkbox" checked={selected.includes(String(option.id))} onChange={() => toggle(option.id)} /><span>{option.name}</span></label>)}
      </div>
    </div>
  );
}

function SizeRuleBuilder({ value = {}, onChange }) {
  const rules = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const update = (day, size, freeSize) => onChange({ ...rules, [day]: { ...(rules[day] || {}), [size]: freeSize } });
  return (
    <div className="size-rule-builder">
      {weekDays.map(day => (
        <div className="size-rule-day" key={day}>
          <strong>{statusLabel(day)}</strong>
          {pizzaSizes.map(([size, label]) => (
            <label key={`${day}-${size}`}>{label} buys
              <select value={rules[day]?.[size] || ''} onChange={e => update(day, size, e.target.value)}>
                <option value="">No free item</option>
                {pizzaSizes.map(([free, freeLabel]) => <option key={free} value={free}>{freeLabel} free</option>)}
              </select>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ tone = 'neutral', children }) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

function ReportBreakdown({ title, rows = [] }) {
  return (
    <section className="panel nested">
      <h3>{title}</h3>
      <div className="report-breakdown-list">
        {rows.map(row => <div key={row.label || 'none'}><span>{statusLabel(row.label || 'Unspecified')}</span><strong>{inr(row.total)}</strong><small>{row.orders} orders</small></div>)}
        {!rows.length ? <p className="small-note">No sales in this period.</p> : null}
      </div>
    </section>
  );
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
              <div><span>Type</span><strong>{order.order_type === 'dine_in' ? 'Dine-in' : order.order_type === 'takeaway' ? 'Takeaway' : 'Delivery'}</strong></div>
              <div><span>Payment</span><strong>{order.payment_status}</strong></div>
              <div><span>Method</span><strong>{order.payment_method || order.payment_mode || '-'}</strong></div>
              <div><span>Status</span><strong>{orderStatusLabel(order)}</strong></div>
            </div>
            {order.source === 'staff_offline' ? <div className="confirmation-grid compact">
              <div><span>Cash Received</span><strong>{inr(order.cash_received || 0)}</strong></div>
              <div><span>Online Received</span><strong>{inr(order.online_received || 0)}</strong></div>
              <div><span>Total Received</span><strong>{inr(order.total_received || order.paid_amount || 0)}</strong></div>
              <div><span>Change</span><strong>{inr(order.change_amount || order.cash_change || 0)}</strong></div>
            </div> : null}
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
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogCategories, setCatalogCategories] = useState([]);
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
  const [staff, setStaff] = useState([]);
  const [staffForm, setStaffForm] = useState({ name: '', phone: '', email: '', password: '', is_active: '1' });
  const [editingStaff, setEditingStaff] = useState(null);
  const [staffPerformance, setStaffPerformance] = useState([]);
  const [salesReport, setSalesReport] = useState(null);
  const [reportFilters, setReportFilters] = useState({ preset: 'today', from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10), staff_id: '' });
  const [deliverySlabTest, setDeliverySlabTest] = useState({ order_amount: '550', distance_km: '4.5', order_type: 'delivery' });
  const [deliverySlabResult, setDeliverySlabResult] = useState(null);
  const [payments, setPayments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState({});
  const [storeAvailability, setStoreAvailability] = useState(null);
  const [orderSchedule, setOrderSchedule] = useState({});
  const [adminThemeMode, setAdminThemeMode] = useState('system');
  const [customerDefaultTheme, setCustomerDefaultTheme] = useState('system');
  const [integrations, setIntegrations] = useState(null);
  const [integrationDraft, setIntegrationDraft] = useState({
    razorpay: { key_id: '', key_secret: '', mode: 'test', enabled: '1' },
    google_maps: { api_key: '', enabled: '1' }
  });
  const [mapsKey, setMapsKey] = useState('');
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
  const activeLabel = tabMeta[active]?.[1] || 'Admin';
  const categoryName = id => catalogCategories.find(category => String(category.id) === String(id))?.name || 'Unassigned';
  const productName = id => catalogProducts.find(product => String(product.id) === String(id))?.name || 'Product';

  const adminRequest = (path, options = {}) => adminApi(path, options);
  const adminUploadRequest = (path, formData, options = {}) => adminUploadApi(path, formData, options);

  useEffect(() => {
    api('/theme').then(t => {
      setTheme(t.theme);
      applyTheme(t.theme, storedThemeMode('pizza_house_admin_theme_mode') || 'system', 'pizza_house_admin_theme_mode');
    }).catch(() => {});
    setAdminThemeMode(storedThemeMode('pizza_house_admin_theme_mode') || 'system');
    api('/settings').then(data => setMapsKey(data.google_maps_api_key || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '')).catch(() => {});
    api('/store/status').then(data => setStoreAvailability(data.store || null)).catch(() => {});
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
      api('/store/status').then(statusData => setStoreAvailability(statusData.store || null)).catch(() => {});
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
      else if (resources[active]) {
        const data = await adminRequest(`/admin/${active}`);
        setItems(data.items || []);
        if (['products', 'offers'].includes(active)) {
          const [productsData, categoriesData] = await Promise.all([
            active === 'products' ? Promise.resolve(data) : adminRequest('/admin/products'),
            adminRequest('/admin/categories')
          ]);
          setCatalogProducts(productsData.items || []);
          setCatalogCategories(categoriesData.items || []);
        }
      }
      else if (active === 'orders') {
        const [ordersData, boysData] = await Promise.all([adminRequest('/admin/orders'), adminRequest('/admin/delivery-boys')]);
        setOrders(ordersData.orders || []);
        setDeliveryBoys(boysData.delivery_boys || []);
      }
      else if (active === 'delivery-boys') setDeliveryBoys((await adminRequest('/admin/delivery-boys')).delivery_boys || []);
      else if (active === 'staff') setStaff((await adminRequest('/admin/staff')).staff || []);
      else if (active === 'staff-performance') setStaffPerformance((await adminRequest('/admin/staff-performance')).staff_performance || []);
      else if (active === 'reports-sales') {
        const [reportData, staffData] = await Promise.all([adminRequest(`/admin/reports/sales?${new URLSearchParams(reportFilters)}`), adminRequest('/admin/staff')]);
        setSalesReport(reportData.report);
        setStaff(staffData.staff || []);
      }
      else if (active === 'payments') setPayments((await adminRequest('/admin/payments')).payments);
      else if (active === 'notifications') setNotifications((await adminRequest('/admin/notifications')).notifications);
      else if (active === 'settings' || active === 'feature-controls') setSettings((await adminRequest('/admin/settings')).settings);
      else if (active === 'order-availability') {
        const [data, settingsData] = await Promise.all([adminRequest('/admin/settings/order-availability'), adminRequest('/admin/settings')]);
        setStoreAvailability(data.availability);
        setOrderSchedule(data.schedule || {});
        setSettings(settingsData.settings || {});
      }
      else if (active === 'appearance') {
        const data = await adminRequest('/admin/settings');
        setCustomerDefaultTheme(data.settings?.customer_default_theme || 'system');
        setAdminThemeMode(storedThemeMode('pizza_house_admin_theme_mode') || data.settings?.admin_theme_mode || 'system');
      }
      else if (active === 'integrations') {
        const data = await adminRequest('/admin/settings/integrations');
        setIntegrations(data.integrations);
        setIntegrationDraft({
          razorpay: {
            key_id: data.integrations?.razorpay?.key_id || '',
            key_secret: data.integrations?.razorpay?.key_secret || '',
            mode: data.integrations?.razorpay?.mode || 'test',
            enabled: data.integrations?.razorpay?.enabled || '1'
          },
          google_maps: {
            api_key: data.integrations?.google_maps?.api_key || '',
            enabled: data.integrations?.google_maps?.enabled || '1'
          }
        });
      }
      else if (active === 'theme') {
        const data = await adminRequest('/admin/theme');
        setTheme(data.theme);
        applyTheme(data.theme, adminThemeMode, 'pizza_house_admin_theme_mode');
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
      let payload = normalizedResourcePayload();
      if (productImageFile && (active === 'products' || active === 'categories' || active === 'promotional-banners' || active === 'promotional-popups')) {
        const uploadForm = new FormData();
        uploadForm.append('image', productImageFile);
        uploadForm.append('name', payload.name || payload.title || 'image');
        const uploadPath = active === 'products' ? '/admin/product-image' : active === 'categories' ? '/admin/category-image' : '/admin/promotion-image';
        const uploaded = await adminUploadRequest(uploadPath, uploadForm);
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
    if (active === 'products') {
      const sizes = (item.variants || []).filter(v => ['S', 'M', 'L'].includes(v.name) && Number(v.is_active) !== 0);
      next.size_pricing_enabled = sizes.length > 0;
      next.size_prices = Object.fromEntries(sizes.map(v => [v.name, v.price]));
    }
    if (active === 'offers') {
      next.applies_to = item.scope === 'category' ? 'category' : 'product';
      next.category_id = item.scope === 'category' ? item.scope_id : '';
      next.product_id = item.scope === 'item' ? item.scope_id : '';
      try { next.category_ids = JSON.parse(item.category_ids || '[]'); } catch { next.category_ids = item.scope === 'category' ? [String(item.scope_id)] : []; }
      try { next.product_ids = JSON.parse(item.product_ids || '[]'); } catch { next.product_ids = item.scope === 'item' ? [String(item.scope_id)] : []; }
      try { next.weekdays = JSON.parse(item.weekdays || '[]'); } catch { next.weekdays = []; }
      try { next.size_rules = JSON.parse(item.size_rules || '{}'); } catch { next.size_rules = {}; }
      next.buy_product_id = item.buy_product_id || (item.scope === 'item' ? item.scope_id : '');
      next.free_product_id = item.free_product_id || (item.scope === 'item' ? item.scope_id : '');
    }
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

  async function saveStaff() {
    try {
      const payload = { ...staffForm, is_active: staffForm.is_active === '1' ? 1 : 0 };
      if (editingStaff) {
        await adminRequest(`/admin/staff/${editingStaff}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await adminRequest('/admin/staff', { method: 'POST', body: JSON.stringify(payload) });
      }
      setStaffForm({ name: '', phone: '', email: '', password: '', is_active: '1' });
      setEditingStaff(null);
      setMessage('Staff account saved.');
      setStaff((await adminRequest('/admin/staff')).staff || []);
    } catch (err) {
      setMessage(err.message);
    }
  }

  function startNewDeliverySlab() {
    setEditing(null);
    setForm({
      min_order_amount: '299',
      free_delivery_distance_km: '5',
      free_delivery_enabled: '1',
      charge: '0',
      priority: '100',
      is_active: '1'
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function toggleDeliverySlab(item, activeValue) {
    try {
      await adminRequest(`/admin/delivery-slabs/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          min_order_amount: item.min_order_amount,
          free_delivery_distance_km: item.free_delivery_distance_km || item.max_km,
          free_delivery_enabled: item.free_delivery_enabled,
          charge: item.charge,
          priority: item.priority || 100,
          is_active: activeValue ? 1 : 0
        })
      });
      setMessage(activeValue ? 'Delivery slab enabled.' : 'Delivery slab disabled.');
      loadActive();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function calculateDeliverySlab() {
    try {
      const data = await adminRequest('/admin/delivery-slabs/calculate', { method: 'POST', body: JSON.stringify(deliverySlabTest) });
      setDeliverySlabResult(data.result);
    } catch (err) {
      setMessage(err.message);
    }
  }

  function editStaffMember(member) {
    setEditingStaff(member.id);
    setStaffForm({ name: member.name || '', phone: member.phone || '', email: member.email || '', password: '', is_active: String(member.is_active ?? '1') });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function openAcceptOrder(order) {
    if (order.source === 'staff_offline') {
      await updateOrder(order, { status: 'accepted' });
      const nextQueue = alertQueue.filter(item => item.id !== order.id);
      setAlertQueue(nextQueue);
      setNewOrderAlert(nextQueue[0] || null);
      pollOrdersForAlerts();
      return;
    }
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

  function changeAdminThemeMode(mode) {
    setAdminThemeMode(mode);
    setThemeMode(mode, 'pizza_house_admin_theme_mode');
  }

  function updateSchedule(day, key, value) {
    setOrderSchedule(current => ({ ...current, [day]: { ...(current[day] || {}), [key]: value } }));
  }

  async function setOrderManualOverride(manualOverride) {
    if (manualOverride === 'closed' && !window.confirm('Turn ordering OFF now? Customers will not be able to place new orders.')) return;
    try {
      const data = await adminRequest('/admin/settings/order-availability/master', { method: 'PUT', body: JSON.stringify({ manual_override: manualOverride }) });
      setStoreAvailability(data.availability);
      setSettings(current => ({ ...current, order_manual_override: manualOverride, accept_orders: manualOverride === 'closed' ? '0' : '1', force_close_orders: manualOverride === 'closed' ? '1' : '0' }));
      setMessage(manualOverride === 'open' ? 'Orders are open now.' : manualOverride === 'closed' ? 'Orders are closed now.' : 'Orders now follow the daily schedule.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function loadSalesReport() {
    try {
      const data = await adminRequest(`/admin/reports/sales?${new URLSearchParams(reportFilters)}`);
      setSalesReport(data.report);
      setMessage('Sales report loaded.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function exportSalesCsv() {
    try {
      const params = new URLSearchParams({ ...reportFilters, format: 'csv' });
      const res = await fetch(`${API_BASE}/admin/reports/sales?${params}`, { headers: { Authorization: `Bearer ${token()}` }, credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('Unable to export sales report.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sales-report-${reportFilters.from}-to-${reportFilters.to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function saveOrderAvailability() {
    try {
      const data = await adminRequest('/admin/settings/order-availability', { method: 'PUT', body: JSON.stringify({ schedule: orderSchedule }) });
      setStoreAvailability(data.availability);
      setOrderSchedule(data.schedule || {});
      setMessage('Order availability schedule saved.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function saveFeatureControls() {
    try {
      const payload = Object.fromEntries(featureControlKeys.map(key => [key, settings[key] ?? '1']));
      const data = await adminRequest('/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
      setSettings(data.settings);
      const statusData = await api('/store/status');
      setStoreAvailability(statusData.store || null);
      setMessage('Feature controls saved.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function saveAppearance() {
    try {
      const data = await adminRequest('/admin/settings', { method: 'PUT', body: JSON.stringify({ customer_default_theme: customerDefaultTheme, admin_theme_mode: adminThemeMode }) });
      setCustomerDefaultTheme(data.settings?.customer_default_theme || customerDefaultTheme);
      setThemeMode(adminThemeMode, 'pizza_house_admin_theme_mode');
      setMessage('Appearance settings saved.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function resetAppearance() {
    setCustomerDefaultTheme('system');
    changeAdminThemeMode('system');
    try {
      const data = await adminRequest('/admin/settings', { method: 'PUT', body: JSON.stringify({ customer_default_theme: 'system', admin_theme_mode: 'system' }) });
      setCustomerDefaultTheme(data.settings?.customer_default_theme || 'system');
      setMessage('Appearance settings reset.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  function updateIntegration(section, key, value) {
    setIntegrationDraft(current => ({ ...current, [section]: { ...current[section], [key]: value } }));
  }

  function requiresReplaceConfirmation(section) {
    const original = integrations?.[section] || {};
    const draft = integrationDraft[section] || {};
    if (section === 'razorpay') {
      return original.configured && ((draft.key_id && draft.key_id !== original.key_id) || (draft.key_secret && draft.key_secret !== '********'));
    }
    return original.configured && draft.api_key && draft.api_key !== '********';
  }

  async function saveIntegration(section) {
    if (requiresReplaceConfirmation(section) && !window.confirm('Replace the existing server-side integration credentials? The old secret value cannot be viewed again.')) {
      return;
    }
    try {
      const endpoint = section === 'razorpay' ? '/admin/settings/integrations/razorpay' : '/admin/settings/integrations/google-maps';
      const data = await adminRequest(endpoint, { method: 'PUT', body: JSON.stringify(integrationDraft[section]) });
      setIntegrations(data.integrations);
      setIntegrationDraft({
        razorpay: {
          key_id: data.integrations?.razorpay?.key_id || '',
          key_secret: data.integrations?.razorpay?.key_secret || '',
          mode: data.integrations?.razorpay?.mode || 'test',
          enabled: data.integrations?.razorpay?.enabled || '1'
        },
        google_maps: {
          api_key: data.integrations?.google_maps?.api_key || '',
          enabled: data.integrations?.google_maps?.enabled || '1'
        }
      });
      const publicSettings = await api('/settings');
      setMapsKey(publicSettings.google_maps_api_key || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '');
      setMessage(`${section === 'razorpay' ? 'Razorpay' : 'Google Maps'} settings saved.`);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function testIntegration(section) {
    try {
      const endpoint = section === 'razorpay' ? '/admin/settings/integrations/razorpay/test' : '/admin/settings/integrations/google-maps/test';
      const data = await adminRequest(endpoint, { method: 'POST', body: JSON.stringify({}) });
      setMessage(data.test?.ok ? `${section === 'razorpay' ? 'Razorpay' : 'Google Maps'} configuration test passed.` : `Configuration test failed: ${data.test?.message || 'Unknown error'}`);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function saveTheme() {
    try {
      const data = await adminRequest('/admin/theme', { method: 'PUT', body: JSON.stringify(theme) });
      setTheme(data.theme);
      applyTheme(data.theme, adminThemeMode, 'pizza_house_admin_theme_mode');
      setMessage('Theme saved.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function resetTheme() {
    try {
      const data = await adminRequest('/admin/theme', { method: 'DELETE' });
      setTheme(data.theme);
      applyTheme(data.theme, adminThemeMode, 'pizza_house_admin_theme_mode');
      setMessage('Theme reset to defaults.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  function updateTheme(key, value) {
    const next = { ...theme, [key]: value };
    setTheme(next);
    applyTheme(next, adminThemeMode, 'pizza_house_admin_theme_mode');
  }

  function adminField(field, value, onChange) {
    const options = fieldOptions[field];
    if (options) {
      return <select value={value || ''} onChange={e => onChange(e.target.value)}><option value="">Select</option>{options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>;
    }
    if (field === 'category_ids') return <CheckboxMultiSelect options={catalogCategories} value={value || []} onChange={onChange} />;
    if (field === 'product_ids') return <CheckboxMultiSelect options={catalogProducts} value={value || []} onChange={onChange} />;
    if (field === 'weekdays') return <CheckboxMultiSelect options={weekDays.map(day => ({ id: day, name: statusLabel(day) }))} value={value || []} onChange={onChange} />;
    if (field === 'size_rules') return <SizeRuleBuilder value={value || {}} onChange={onChange} />;
    if (['category_id'].includes(field)) {
      return <select value={value || ''} onChange={e => onChange(e.target.value)}><option value="">Select category</option>{catalogCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>;
    }
    if (['product_id', 'buy_product_id', 'free_product_id'].includes(field)) {
      return <select value={value || ''} onChange={e => onChange(e.target.value)}><option value="">Select product</option>{catalogProducts.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select>;
    }
    if (field.includes('description') || field.includes('address')) return <textarea value={value || ''} onChange={e => onChange(e.target.value)} />;
    const numberFields = ['price','stock','low_stock_threshold','discount_value','min_order_value','max_discount','overall_usage_limit','per_customer_limit','buy_qty','get_qty','scope_id','buy_product_id','free_product_id','category_id','min_km','max_km','min_order_amount','free_delivery_distance_km','charge','priority','sort_order','display_order','partial_payment_value','minimum_order','restaurant_latitude','restaurant_longitude'];
    if (field.endsWith('_at')) return <input type="datetime-local" value={value || ''} onChange={e => onChange(e.target.value)} />;
    if (field.endsWith('_time')) return <input type="time" value={value || ''} onChange={e => onChange(e.target.value)} />;
    return <input type={numberFields.includes(field) ? 'number' : 'text'} value={value || ''} onChange={e => onChange(e.target.value)} />;
  }

  function normalizedResourcePayload() {
    const payload = { ...form };
    if (active === 'products') {
      if (payload.size_pricing_enabled) {
        const prices = Object.values(payload.size_prices || {});
        if (!prices.length || prices.some(price => !Number.isFinite(Number(price)) || Number(price) < 0.01 || Number(price) > 99999999.99)) {
          throw new Error('Enable at least one size and enter a positive price for every enabled size.');
        }
        payload.price = Math.min(...prices.map(Number));
      } else if (payload.size_prices !== undefined) {
        payload.size_prices = {};
      }
      delete payload.size_pricing_enabled;
    }
    if (active === 'offers') {
      const offerType = payload.offer_type || 'fixed';
      const appliesTo = payload.applies_to || 'order';
      payload.category_ids = JSON.stringify((payload.category_ids || []).map(Number).filter(Boolean));
      payload.product_ids = JSON.stringify((payload.product_ids || []).map(Number).filter(Boolean));
      payload.weekdays = JSON.stringify(payload.weekdays || []);
      payload.size_rules = JSON.stringify(payload.size_rules || {});
      if (appliesTo === 'category') {
        payload.scope = 'category';
        payload.scope_id = (form.category_ids || [])[0] || payload.category_id || '';
      } else if (appliesTo === 'product') {
        payload.scope = 'item';
        payload.scope_id = (form.product_ids || [])[0] || payload.product_id || payload.buy_product_id || '';
      } else {
        payload.scope = 'category';
        payload.scope_id = (form.category_ids || [])[0] || catalogCategories[0]?.id || payload.category_id || '1';
      }
      if (offerType === 'bogo') {
        payload.discount_value = payload.discount_value || '0';
        payload.scope = 'item';
        payload.scope_id = payload.buy_product_id || (form.product_ids || [])[0] || payload.scope_id;
        payload.buy_product_id = payload.buy_product_id || payload.scope_id;
        payload.free_product_id = payload.free_product_id || payload.buy_product_id;
        payload.buy_qty = payload.buy_qty || '1';
        payload.get_qty = payload.get_qty || '1';
      } else {
        payload.buy_qty = payload.buy_qty || '1';
        payload.get_qty = payload.get_qty || '1';
        payload.buy_product_id = '';
        payload.free_product_id = '';
      }
      delete payload.applies_to;
      delete payload.category_id;
      delete payload.product_id;
    }
    if (active === 'delivery-slabs') {
      payload.min_km = payload.min_km || '0';
      payload.max_km = payload.max_km || payload.free_delivery_distance_km || '0';
      payload.order_types = payload.order_types || 'delivery';
      payload.free_delivery_enabled = String(payload.free_delivery_enabled ?? '1') === '1' ? 1 : 0;
      payload.is_active = String(payload.is_active ?? '1') === '1' ? 1 : 0;
      payload.priority = payload.priority || '100';
    }
    return payload;
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
      {mapsKey ? <Script src={`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}`} strategy="afterInteractive" /> : null}
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
      {mobileNav ? <button className="admin-drawer-backdrop mobile-only" aria-label="Close admin navigation" onClick={() => setMobileNav(false)} /> : null}
      <aside className={mobileNav ? 'admin-sidebar open' : 'admin-sidebar'}>
        <div className="row">
          <Link href="/" className="brand mark"><span className="brand-icon">TP</span><span>The Pizza House</span></Link>
          <button className="icon-button mobile-only" onClick={() => setMobileNav(false)}><X size={18} /></button>
        </div>
        <nav className="admin-nav-groups">
          {navSections.map(section => (
            <div className="admin-nav-group" key={section.label}>
              <span className="admin-nav-section">{section.label}</span>
              {section.items.map(id => {
                const [, label, Icon] = tabMeta[id];
                return (
                  <button className={active === id ? 'admin-nav active' : 'admin-nav'} onClick={() => { setActive(id); setMobileNav(false); }} key={id}>
                    <Icon size={17} /> <span>{label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <button className="admin-nav" onClick={logout}><LogOut size={18} /> Logout</button>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar">
          <div className="admin-title-row">
            <button className="icon-button mobile-only" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
            <div><span className="eyebrow">Admin portal</span><h1>{activeLabel}</h1></div>
          </div>
          <div className="admin-topbar-actions">
            <RestaurantPowerSwitch availability={storeAvailability} onChange={setOrderManualOverride} />
            <span className="admin-session-pill">Admin session active</span>
            <select className="theme-mode-select" aria-label="Admin theme mode" value={adminThemeMode} onChange={e => changeAdminThemeMode(e.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
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

        {resources[active] && active !== 'delivery-slabs' && (
          <div className="admin-content-grid">
            <section className="panel">
              <div className="panel-heading"><h2>{editing ? 'Edit' : active === 'products' ? '+ Add Product' : active === 'offers' ? '+ Create Offer' : 'Add'} {active === 'products' || active === 'offers' ? '' : active.replace('-', ' ')}</h2><p>Changes save through the existing PHP admin API.</p></div>
              <div className="form-grid">
                {resourceFields.map(field => field === 'image_url' && (active === 'products' || active === 'categories' || active === 'promotional-banners' || active === 'promotional-popups')
                  ? <ProductImageUpload key={field} label={active === 'products' ? 'Product Image' : active === 'categories' ? 'Category Image' : 'Promotion Image'} value={form.image_url || ''} file={productImageFile} preview={productImagePreview} onSelect={selectProductImage} onRemove={() => { clearProductImageSelection(); setForm({ ...form, image_url: '' }); }} />
                  : active === 'offers' && form.offer_type === 'bogo' && ['applies_to', 'discount_value'].includes(field)
                    ? null
                    : active === 'offers' && form.offer_type !== 'bogo' && ['category_ids', 'product_ids', 'weekdays', 'size_rules', 'start_time', 'end_time', 'buy_product_id', 'free_product_id', 'buy_qty', 'get_qty'].includes(field)
                      ? null
                      : active === 'offers' && form.applies_to !== 'category' && field === 'category_id'
                        ? null
                        : active === 'offers' && form.applies_to !== 'product' && field === 'product_id'
                          ? null
                          : <label key={field}>{adminLabel(field)}{adminField(field, form[field], value => setForm({ ...form, [field]: value }))}</label>)}
              </div>
              {active === 'products' ? (
                <fieldset className="my-4 grid gap-3 rounded-lg border border-tph-border p-4">
                  <legend className="px-2 font-bold">Size Pricing</legend>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form.size_pricing_enabled)} onChange={e => setForm({ ...form, size_pricing_enabled: e.target.checked, size_prices: form.size_prices || {} })} />Enable pizza size pricing</label>
                  {form.size_pricing_enabled ? <div className="grid gap-3 sm:grid-cols-3">
                    {[['S', 'Small'], ['M', 'Medium'], ['L', 'Large']].map(([size, label]) => {
                      const enabled = Object.prototype.hasOwnProperty.call(form.size_prices || {}, size);
                      return <div key={size} className="grid gap-2">
                        <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e => {
                          const prices = { ...form.size_prices };
                          if (e.target.checked) prices[size] = ''; else delete prices[size];
                          setForm({ ...form, size_prices: prices });
                        }} />{label}</label>
                        <label>Price (INR)<input aria-label={`${label} price`} type="number" min="0.01" max="99999999.99" step="0.01" disabled={!enabled} value={form.size_prices?.[size] ?? ''} onChange={e => setForm({ ...form, size_prices: { ...form.size_prices, [size]: e.target.value } })} /></label>
                      </div>;
                    })}
                  </div> : null}
                </fieldset>
              ) : null}
              {active === 'offers' && form.offer_type === 'bogo' ? (
                <div className="offer-preview">
                  <strong>BOGO Preview</strong>
                  <p>Categories: {(form.category_ids || []).map(categoryName).join(', ') || 'All configured scope'}</p>
                  <p>Specific products: {(form.product_ids || []).map(productName).join(', ') || 'Any product in selected categories'}</p>
                  {(form.weekdays || []).map(day => <p key={day}>{statusLabel(day)}: {pizzaSizes.map(([size, label]) => `${label} -> ${form.size_rules?.[day]?.[size] ? statusLabel(form.size_rules[day][size]) + ' free' : 'None'}`).join(' | ')}</p>)}
                </div>
              ) : null}
              <div className="action-row">
                <button onClick={saveResource}>Save</button>
                {editing ? <button className="ghost" onClick={() => { setEditing(null); setForm({}); clearProductImageSelection(); }}>Cancel</button> : null}
              </div>
            </section>
            <section className="panel table-panel">
              <div className="panel-heading"><h2>{active === 'products' ? 'Products' : active === 'offers' ? 'Offers' : active.replace('-', ' ')}</h2></div>
              {active === 'products' ? (
                <div className="admin-product-list">
                  {items.map((item, index) => <article className="admin-product-row" key={item.id}>
                    <img className="table-thumb large" src={productImage(item, index)} alt="" />
                    <div><strong>{item.name}</strong><p>{item.description || 'No description'}</p></div>
                    <div><span>Category</span><strong>{categoryName(item.category_id)}</strong></div>
                    <div><span>Price</span><strong>{inr(productStartingPrice(item))}</strong></div>
                    <div><span>Stock</span><strong>{Number(item.stock || 0) <= Number(item.low_stock_threshold || 0) ? 'Low stock' : `${item.stock} available`}</strong></div>
                    <StatusBadge tone={Number(item.is_active) === 1 ? 'success' : 'danger'}>{readableStatus(item.is_active)}</StatusBadge>
                    <div className="action-row"><button className="ghost" onClick={() => editResource(item)}>Edit</button><button className="ghost" onClick={() => { const copy = {}; resourceFields.forEach(field => { copy[field] = field === 'name' ? `${item.name} Copy` : item[field] ?? ''; }); setForm(copy); setEditing(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Duplicate</button><button className="ghost danger" onClick={() => deleteResource(item.id)}>Delete</button></div>
                  </article>)}
                </div>
              ) : active === 'offers' ? (
                <div className="admin-offer-card-grid">
                  {items.map(item => {
                    const isBogo = (item.offer_type || 'bogo') === 'bogo';
                    let categoryIds = [];
                    let productIds = [];
                    let days = [];
                    try { categoryIds = JSON.parse(item.category_ids || '[]'); } catch {}
                    try { productIds = JSON.parse(item.product_ids || '[]'); } catch {}
                    try { days = JSON.parse(item.weekdays || '[]'); } catch {}
                    const applies = productIds.length ? productIds.map(productName).join(', ') : categoryIds.length ? categoryIds.map(categoryName).join(', ') : item.scope === 'category' ? categoryName(item.scope_id) : productName(item.scope_id || item.buy_product_id);
                    return <article className="admin-offer-card" key={item.id}>
                      <div><h3>{item.name}</h3><p>{isBogo ? `Buy ${item.buy_qty} ${productName(item.buy_product_id || item.scope_id)}, get ${item.get_qty} ${productName(item.free_product_id || item.scope_id)} free` : `${item.offer_type === 'percent' ? `${item.discount_value}% OFF` : `${inr(item.discount_value)} OFF`} · ${applies}`}</p></div>
                      <StatusBadge tone={Number(item.is_active) === 1 ? 'success' : 'danger'}>{readableStatus(item.is_active)}</StatusBadge>
                      <span className="badge">{isBogo ? 'BOGO' : item.offer_type === 'percent' ? 'Percentage Discount' : 'Fixed Discount'}</span>
                      <span className="small-note">{applies}</span>
                      {days.length ? <span className="small-note">Runs: {days.map(statusLabel).join(', ')}</span> : null}
                      <div className="action-row"><button className="ghost" onClick={() => editResource(item)}>Edit</button><button className="ghost danger" onClick={() => deleteResource(item.id)}>Delete</button></div>
                    </article>;
                  })}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr>{resourceFields.slice(0, 6).map(f => <th key={f}>{adminLabel(f)}</th>)}<th>Actions</th></tr></thead>
                    <tbody>{items.map((item, index) => (
                      <tr key={item.id}>
                        {resourceFields.slice(0, 6).map(f => <td key={f}>{f === 'image_url' && item[f] ? <img className="table-thumb" src={productImage(item, index)} alt="" /> : String(item[f] ?? '')}</td>)}
                        <td><div className="action-row"><button className="ghost" onClick={() => editResource(item)}>Edit</button><button className="ghost danger" onClick={() => deleteResource(item.id)}>Delete</button></div></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {active === 'delivery-slabs' && (
          <div className="admin-content-grid">
            <section className="panel">
              <div className="panel-heading">
                <h2>{editing ? 'Edit Delivery Slab' : '+ Add Delivery Slab'}</h2>
                <p>Create simple free-delivery rules such as ₹299+ up to 5 KM. Normal delivery charges still apply when a free rule does not match.</p>
              </div>
              <div className="form-grid">
                <label>Minimum Order<input type="number" min="0" step="0.01" value={form.min_order_amount || ''} onChange={e => setForm({ ...form, min_order_amount: e.target.value })} placeholder="299" /></label>
                <label>Free Delivery Distance<input type="number" min="0" step="0.01" value={form.free_delivery_distance_km || ''} onChange={e => setForm({ ...form, free_delivery_distance_km: e.target.value, max_km: e.target.value })} placeholder="5" /></label>
                <label>Free Delivery<select value={String(form.free_delivery_enabled ?? '1')} onChange={e => setForm({ ...form, free_delivery_enabled: e.target.value })}><option value="1">ON</option><option value="0">OFF</option></select></label>
                <label>Optional Delivery Charge<input type="number" min="0" step="0.01" value={form.charge || ''} onChange={e => setForm({ ...form, charge: e.target.value })} placeholder="0" /></label>
                <label>Priority<input type="number" min="0" step="1" value={form.priority || ''} onChange={e => setForm({ ...form, priority: e.target.value })} placeholder="100" /></label>
                <label>Status<select value={String(form.is_active ?? '1')} onChange={e => setForm({ ...form, is_active: e.target.value })}><option value="1">Active</option><option value="0">Inactive</option></select></label>
              </div>
              <div className="action-row">
                <button onClick={saveResource}>{editing ? 'Save Delivery Slab' : '+ Add Delivery Slab'}</button>
                {editing ? <button className="ghost" onClick={() => { setEditing(null); setForm({}); }}>Cancel</button> : null}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading"><h2>Delivery Slab Calculator</h2><p>Test a rule without placing an order.</p></div>
              <div className="form-grid">
                <label>Order Amount<input type="number" min="0" step="0.01" value={deliverySlabTest.order_amount} onChange={e => setDeliverySlabTest({ ...deliverySlabTest, order_amount: e.target.value })} /></label>
                <label>Distance<input type="number" min="0" step="0.01" value={deliverySlabTest.distance_km} onChange={e => setDeliverySlabTest({ ...deliverySlabTest, distance_km: e.target.value })} /></label>
                <label>Order Type<select value={deliverySlabTest.order_type} onChange={e => setDeliverySlabTest({ ...deliverySlabTest, order_type: e.target.value })}><option value="delivery">Delivery</option><option value="takeaway">Takeaway</option><option value="dine_in">Dine-in</option></select></label>
              </div>
              <div className="action-row"><button className="ghost" onClick={calculateDeliverySlab}>Calculate</button></div>
              {deliverySlabResult ? (
                <div className={deliverySlabResult.is_free_delivery ? 'notice success' : 'notice warning'}>
                  <strong>{deliverySlabResult.is_free_delivery ? 'Result: FREE DELIVERY' : `Result: ${inr(deliverySlabResult.delivery_charge)} delivery charge`}</strong>
                  <p>{deliverySlabResult.message}</p>
                  {deliverySlabResult.progress_message ? <p>{deliverySlabResult.progress_message}</p> : null}
                  <small>{deliverySlabResult.reason}</small>
                </div>
              ) : null}
            </section>

            <section className="panel table-panel span-all">
              <div className="panel-heading"><h2>Delivery Slabs</h2><button className="ghost" onClick={startNewDeliverySlab}>+ Add Delivery Slab</button></div>
              <div className="admin-offer-card-grid">
                {items.map(item => {
                  const activeRule = Number(item.is_active) === 1;
                  const freeOn = Number(item.free_delivery_enabled) === 1;
                  return (
                    <article className="admin-offer-card" key={item.id}>
                      <div>
                        <span className="eyebrow">{freeOn ? 'FREE DELIVERY' : 'DELIVERY CHARGE'}</span>
                        <h3>{inr(item.min_order_amount || 0)}+ order</h3>
                        <p>Up to {item.free_delivery_distance_km || item.max_km} KM</p>
                      </div>
                      <StatusBadge tone={activeRule ? 'success' : 'danger'}>{activeRule ? 'Active' : 'Inactive'}</StatusBadge>
                      <span className="badge">{freeOn ? 'Free delivery ON' : `${inr(item.charge)} charge`}</span>
                      <span className="small-note">Priority {item.priority || 100}</span>
                      <div className="action-row">
                        <button className="ghost" onClick={() => editResource(item)}>Edit</button>
                        <button className="ghost" onClick={() => toggleDeliverySlab(item, !activeRule)}>{activeRule ? 'Disable' : 'Enable'}</button>
                        <button className="ghost danger" onClick={() => deleteResource(item.id)}>Delete</button>
                      </div>
                    </article>
                  );
                })}
                {!items.length ? <div className="empty-state">No delivery slabs yet. Add the first free-delivery rule.</div> : null}
              </div>
            </section>
          </div>
        )}

        {active === 'orders' && (
          <section className="panel table-panel">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Source</th><th>Customer</th><th>Type</th><th>Items</th><th>Total</th><th>Paid</th><th>Payment</th><th>Delivery Boy</th><th>Tracking</th><th>Ready</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{orders.map(order => {
                  const next = nextStatuses(order);
                  return (
                    <tr id={`admin-order-${order.id}`} key={order.id}>
                      <td><strong>{order.order_number}</strong><p className="small-note">{order.created_at}</p></td>
                      <td><span className={order.source === 'staff_offline' ? 'badge warning' : 'badge success'}>{order.source === 'staff_offline' ? 'STAFF / OFFLINE' : 'ONLINE'}</span>{order.staff_name ? <p className="small-note">{order.staff_name}</p> : null}</td>
                      <td>{order.customer_name || 'Customer'}<p className="small-note">{order.customer_phone || ''}</p></td>
                      <td><span className="badge">{order.order_type === 'dine_in' ? 'Dine-in' : order.order_type === 'takeaway' ? 'Takeaway' : 'Delivery'}</span><p className="small-note">{order.order_type === 'delivery' ? `${order.distance_km || '-'} km` : (order.table_number ? `Table ${order.table_number}` : 'Counter order')}</p></td>
                      <td className="admin-items-summary">{order.items_summary || '-'}</td>
                      <td>{inr(order.total_amount)}</td>
                      <td>{inr(order.paid_amount)}<p className="small-note">Due {inr(order.remaining_amount)}</p></td>
                      <td><span className="badge">{order.payment_status}</span><p className="small-note">{order.payment_method || order.payment_mode}</p>{order.source === 'staff_offline' ? <p className="small-note">Cash {inr(order.cash_received || 0)} · Online {inr(order.online_received || 0)}</p> : null}</td>
                      <td>
                        {order.order_type === 'delivery' && order.source !== 'staff_offline' ? (
                          <select value={order.delivery_boy_id || ''} onChange={e => assignDeliveryBoy(order, e.target.value)} disabled={['out_for_delivery','delivered','cancelled'].includes(order.status)}>
                            <option value="">Unassigned</option>
                            {deliveryBoys.filter(boy => Number(boy.is_active) === 1).map(boy => <option key={boy.id} value={boy.id}>{boy.name}</option>)}
                          </select>
                        ) : '-'}
                        {order.source !== 'staff_offline' && order.delivery_boy_name ? <p className="small-note">{order.delivery_boy_name}</p> : null}
                      </td>
                      <td>
                        {order.order_type === 'delivery' && order.source !== 'staff_offline' ? (
                          order.driver_recorded_at ? <><span className="badge success">Live</span><p className="small-note">Last location {order.driver_recorded_at}</p></> : <span className="small-note">No live location</span>
                        ) : '-'}
                        {order.order_type === 'delivery' && order.source !== 'staff_offline' && order.driver_latitude && order.latitude ? <AdminMiniMap order={order} /> : null}
                      </td>
                      <td>{order.source !== 'staff_offline' && order.estimated_ready_at ? <><strong>{order.estimated_ready_at}</strong><p className="small-note">{order.preparation_minutes} min prep</p></> : '-'}</td>
                      <td><span className="badge success">{orderStatusLabel(order)}</span></td>
                      <td>
                        <div className="order-action-stack">
                          <button className="ghost" onClick={() => openOrderDetails(order)}><Eye size={16} /> Details</button>
                          <button className="ghost" onClick={() => viewAdminInvoice(order, false)}><FileText size={16} /> Invoice</button>
                          {order.status === 'delivered' && order.source === 'staff_offline' ? <span className="badge success">Completed</span> : null}
                          {order.status === 'received' && isAlertableOrder(order) && order.source !== 'staff_offline' ? <button className="ghost" onClick={() => openAcceptOrder(order)}><Clock size={16} /> Accept</button> : null}
                          {(order.source === 'staff_offline' ? next : next.filter(status => status !== 'accepted')).map(status => <button key={status} className={status === 'cancelled' ? 'ghost danger' : 'ghost'} onClick={() => updateOrder(order, { status })}>{adminOrderActionLabel(order, status)}</button>)}
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

        {active === 'staff' && (
          <div className="admin-content-grid">
            <section className="panel">
              <div className="panel-heading"><h2>{editingStaff ? 'Edit' : 'Add'} Staff</h2><p>Create restricted POS staff accounts. Staff cannot access admin settings.</p></div>
              <div className="form-grid">
                <label>Name<input value={staffForm.name} onChange={e => setStaffForm({ ...staffForm, name: e.target.value })} /></label>
                <label>Mobile<input value={staffForm.phone} onChange={e => setStaffForm({ ...staffForm, phone: e.target.value })} /></label>
                <label>Email / Username<input type="email" value={staffForm.email} onChange={e => setStaffForm({ ...staffForm, email: e.target.value })} /></label>
                <label>Password<input type="password" placeholder={editingStaff ? 'Leave blank to keep current password' : ''} value={staffForm.password} onChange={e => setStaffForm({ ...staffForm, password: e.target.value })} /></label>
                <label>Status<select value={staffForm.is_active} onChange={e => setStaffForm({ ...staffForm, is_active: e.target.value })}><option value="1">Active</option><option value="0">Inactive</option></select></label>
              </div>
              <div className="action-row">
                <button onClick={saveStaff}>{editingStaff ? 'Save Staff' : 'Add Staff'}</button>
                {editingStaff ? <button className="ghost" onClick={() => { setEditingStaff(null); setStaffForm({ name: '', phone: '', email: '', password: '', is_active: '1' }); }}>Cancel</button> : null}
              </div>
            </section>
            <section className="panel table-panel">
              <div className="panel-heading"><h2>Staff</h2></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Orders</th><th>Sales</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>{staff.map(member => <tr key={member.id}><td>{member.name}</td><td>{member.phone}</td><td>{member.email}</td><td>{member.order_count || 0}</td><td>{inr(member.sales_total || 0)}</td><td><span className={Number(member.is_active) === 1 ? 'badge success' : 'badge warning'}>{Number(member.is_active) === 1 ? 'Active' : 'Inactive'}</span></td><td><button className="ghost" onClick={() => editStaffMember(member)}>Edit / Reset Password</button></td></tr>)}</tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {active === 'staff-performance' && (
          <section className="panel table-panel">
            <div className="panel-heading"><h2>Staff Performance</h2><p>Current month by default. Shows staff POS/offline order performance.</p></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Staff</th><th>Orders</th><th>Offline Sales</th><th>Average Order</th><th>Cash Collected</th><th>Online Collected</th><th>Outstanding</th><th>Dine-in</th><th>Takeaway</th></tr></thead>
                <tbody>{staffPerformance.map(row => <tr key={row.id}><td><strong>{row.name}</strong><p className="small-note">{row.email}</p></td><td>{row.orders_taken || 0}</td><td>{inr(row.offline_sales || 0)}</td><td>{inr(row.average_order_value || 0)}</td><td>{inr(row.cash_collected || 0)}</td><td>{inr(row.online_collected || 0)}</td><td>{inr(row.outstanding_amount || 0)}</td><td>{row.dine_in_orders || 0}</td><td>{row.takeaway_orders || 0}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        {active === 'reports-sales' && (
          <section className="panel sales-report-panel">
            <div className="panel-heading"><h2>Sales Overview</h2><p>Daily sales, payment collection, staff sales, discounts, and BOGO impact.</p></div>
            <div className="report-filter-bar">
              <label>Range<select value={reportFilters.preset} onChange={e => setReportFilters({ ...reportFilters, preset: e.target.value })}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="custom">Specific Date / Range</option></select></label>
              <label>From<input type="date" value={reportFilters.from} onChange={e => setReportFilters({ ...reportFilters, from: e.target.value, preset: 'custom' })} /></label>
              <label>To<input type="date" value={reportFilters.to} onChange={e => setReportFilters({ ...reportFilters, to: e.target.value, preset: 'custom' })} /></label>
              <label>Staff<select value={reportFilters.staff_id} onChange={e => setReportFilters({ ...reportFilters, staff_id: e.target.value })}><option value="">All staff</option>{staff.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
              <button onClick={loadSalesReport}>Apply</button>
              <button className="ghost" onClick={exportSalesCsv}>Export CSV</button>
            </div>
            {salesReport ? (
              <>
                <div className="stat-grid">
                  {[
                    ['Total Sales', salesReport.summary.total_sales, true],
                    ['Orders', salesReport.summary.total_orders, false],
                    ['Online Sales', salesReport.summary.online_sales, true],
                    ['Offline Sales', salesReport.summary.offline_sales, true],
                    ['Cash Sales', salesReport.summary.cash_sales, true],
                    ['Counter Digital', salesReport.summary.counter_digital_sales, true],
                    ['Average Order', salesReport.summary.average_order, true],
                    ['Total Discounts', salesReport.summary.total_discounts, true],
                  ].map(([label, value, money]) => <article className="stat-card compact" key={label}><p>{label}</p><h2>{money ? inr(value) : value}</h2></article>)}
                </div>
                <div className="report-grid">
                  <ReportBreakdown title="By Order Source" rows={salesReport.breakdown.source} />
                  <ReportBreakdown title="By Payment" rows={salesReport.breakdown.payment} />
                  <ReportBreakdown title="By Order Type" rows={salesReport.breakdown.order_type} />
                  <section className="panel nested"><h3>Discount Summary</h3><div className="payment-breakdown"><div><span>Gross Sales</span><strong>{inr(salesReport.summary.gross_sales)}</strong></div><div><span>Total Discounts</span><strong>{inr(salesReport.summary.total_discounts)}</strong></div><div><span>Net Sales</span><strong>{inr(salesReport.summary.total_sales)}</strong></div><div><span>Fixed</span><strong>{inr(salesReport.summary.fixed_discount)}</strong></div><div><span>BOGO</span><strong>{inr(salesReport.summary.bogo_discount)}</strong></div><div><span>Coupon</span><strong>{inr(salesReport.summary.coupon_discount)}</strong></div></div></section>
                </div>
                <section className="panel nested table-panel"><h3>Staff Sales</h3><div className="table-wrap"><table><thead><tr><th>Staff</th><th>Orders</th><th>Offline Sales</th><th>Cash</th><th>Counter Digital</th><th>Average</th></tr></thead><tbody>{salesReport.staff_sales.map(row => <tr key={row.id || row.name}><td>{row.name || 'Staff'}</td><td>{row.orders}</td><td>{inr(row.offline_sales)}</td><td>{inr(row.cash_collected)}</td><td>{inr(row.counter_digital_collected)}</td><td>{inr(row.average_order)}</td></tr>)}</tbody></table></div></section>
                <section className="panel nested table-panel"><h3>BOGO Report</h3><div className="table-wrap"><table><thead><tr><th>Offer</th><th>Orders</th><th>Discount</th></tr></thead><tbody>{salesReport.bogo.map(row => <tr key={row.offer}><td>{row.offer}</td><td>{row.orders}</td><td>{inr(row.discount)}</td></tr>)}</tbody></table></div></section>
                <section className="panel nested table-panel"><h3>Daily Sales Table</h3><div className="table-wrap"><table><thead><tr><th>Order ID</th><th>Date/Time</th><th>Source</th><th>Staff</th><th>Customer</th><th>Type</th><th>Payment</th><th>Subtotal</th><th>Discount</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th></tr></thead><tbody>{salesReport.orders.map(row => <tr key={row.id}><td>{row.order_number}</td><td>{row.created_at}</td><td>{row.source}</td><td>{row.staff_name || '-'}</td><td>{row.customer_name}</td><td>{row.order_type}</td><td>{row.payment_type}</td><td>{inr(row.subtotal)}</td><td>{inr(row.discount_amount)}</td><td>{inr(row.total_amount)}</td><td>{inr(row.paid_amount)}</td><td>{inr(row.remaining_amount)}</td><td>{row.status}</td></tr>)}</tbody></table></div></section>
              </>
            ) : <div className="empty-state">Loading sales report...</div>}
          </section>
        )}

        {active === 'payments' && <DataTable rows={payments} columns={['order_number','amount','status','razorpay_order_id','razorpay_payment_id','created_at']} moneyCols={['amount']} />}
        {active === 'notifications' && <DataTable rows={notifications} columns={['channel','recipient','message','status','created_at']} />}

        {active === 'settings' && (
          <section className="panel">
            <div className="panel-heading"><h2>General and Payment Settings</h2><p>Controls restaurant details, checkout authentication, COD, full payment, and partial payment configuration.</p></div>
            <ToggleSwitch
              checked={(settings.customer_login_required || '0') === '1'}
              onChange={checked => setSettings({ ...settings, customer_login_required: checked ? '1' : '0' })}
              label="Customer Checkout Authentication"
              description="Require customers to login or register before placing checkout orders."
            />
            <div className="form-grid three">{Object.keys(settings).filter(key => !hiddenGeneralSettings.has(key)).map(key => <label key={key}>{key.replaceAll('_', ' ')}{adminField(key, settings[key], value => setSettings({ ...settings, [key]: value }))}</label>)}</div>
            <button onClick={saveSettings}><Save size={16} /> Save Changes</button>
          </section>
        )}

        {active === 'order-availability' && (
          <section className="panel">
            <div className="panel-heading"><h2>Restaurant Power</h2><p>{storeAvailability?.is_open ? 'Orders are being accepted now.' : 'New orders are currently disabled.'}</p></div>
            <div className="restaurant-power-hero">
              <RestaurantPowerSwitch availability={storeAvailability} onChange={setOrderManualOverride} />
              <p>{storeAvailability?.manual_override === 'open' ? 'Manually opened - accepting orders now.' : storeAvailability?.manual_override === 'closed' ? 'Manually closed - orders are currently disabled.' : 'Following the daily schedule automatically.'}</p>
            </div>
            <div className="availability-summary-grid">
              <article className="availability-summary-card">
                <span>Current status</span>
                <strong>{storeAvailability?.is_open ? 'Orders Open' : 'Orders Closed'}</strong>
                <StatusBadge tone={storeAvailability?.is_open ? 'success' : 'danger'}>{availabilityModeLabel(storeAvailability)}</StatusBadge>
              </article>
              <article className="availability-summary-card">
                <span>Today&apos;s hours</span>
                <strong>{storeAvailability?.today?.enabled === '1' ? `${storeAvailability.today.open} - ${storeAvailability.today.close}` : 'Closed today'}</strong>
                <small>{statusLabel(storeAvailability?.today?.day || '')}</small>
              </article>
              <article className="availability-summary-card">
                <span>Manual override</span>
                <strong>{storeAvailability?.manual_override === 'open' ? 'ON' : storeAvailability?.manual_override === 'closed' ? 'OFF' : 'AUTO'}</strong>
                <small>{storeAvailability?.message || storeAvailability?.timezone || 'Asia/Kolkata'}</small>
              </article>
            </div>
            <div className="availability-controls">
              <button className={storeAvailability?.manual_override === 'open' ? 'availability-power-card active open' : 'availability-power-card open'} onClick={() => setOrderManualOverride('open')}>
                <strong>Accept Orders Now</strong>
                <span>Turn ON to accept new orders immediately.</span>
              </button>
              <button className={storeAvailability?.manual_override === 'auto' ? 'availability-power-card active' : 'availability-power-card'} onClick={() => setOrderManualOverride('auto')}>
                <strong>Follow Daily Schedule</strong>
                <span>Use the weekly open and close times below.</span>
              </button>
              <button className={storeAvailability?.manual_override === 'closed' ? 'availability-power-card active closed' : 'availability-power-card closed'} onClick={() => setOrderManualOverride('closed')}>
                <strong>Stop Orders Now</strong>
                <span>Turn OFF to stop accepting new orders immediately.</span>
              </button>
            </div>
            <div className="panel-heading"><h2>Daily Schedule</h2><p>Use this as the automatic default. Restaurant Power can still open or close immediately.</p></div>
            <div className="availability-grid">
              {weekDays.map(day => {
                const row = orderSchedule[day] || { enabled: '1', open: '11:00', close: '23:00' };
                return (
                  <div className="availability-row" key={day}>
                    <ToggleSwitch
                      checked={row.enabled === '1'}
                      onChange={checked => updateSchedule(day, 'enabled', checked ? '1' : '0')}
                      label={statusLabel(day)}
                      description={row.enabled === '1' ? 'Open day' : 'Closed day'}
                    />
                    <label>Opening time<input type="time" value={row.open || '11:00'} onChange={e => updateSchedule(day, 'open', e.target.value)} /></label>
                    <label>Closing time<input type="time" value={row.close || '23:00'} onChange={e => updateSchedule(day, 'close', e.target.value)} /></label>
                  </div>
                );
              })}
            </div>
            <div className="action-row"><button onClick={saveOrderAvailability}><Save size={16} /> Save Schedule</button></div>
          </section>
        )}

        {active === 'feature-controls' && (
          <section className="panel">
            <div className="panel-heading"><h2>Feature Controls</h2><p>Enable or disable customer-facing features globally. Backend enforcement is used where it affects ordering.</p></div>
            <div className="feature-control-grid">
              {featureControlKeys.map(key => {
                const [label, description] = featureControlLabels[key];
                return (
                  <ToggleSwitch
                    key={key}
                    checked={(settings[key] ?? '1') === '1'}
                    onChange={checked => setSettings({ ...settings, [key]: checked ? '1' : '0' })}
                    label={label}
                    description={description}
                    danger={key === 'online_ordering_enabled'}
                  />
                );
              })}
            </div>
            <div className="action-row"><button onClick={saveFeatureControls}><Save size={16} /> Save Feature Controls</button></div>
          </section>
        )}

        {active === 'appearance' && (
          <div className="theme-layout">
            <section className="panel">
              <div className="panel-heading"><h2>Appearance</h2><p>Theme mode integrates with the existing Theme Settings customizer.</p></div>
              <div className="form-grid">
                <label>Admin Theme Mode<select value={adminThemeMode} onChange={e => changeAdminThemeMode(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
                <label>Customer Default Theme<select value={customerDefaultTheme} onChange={e => setCustomerDefaultTheme(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
              </div>
              <p className="small-note">Customer saved preferences in localStorage override the admin default.</p>
              <div className="action-row"><button onClick={saveAppearance}><Save size={16} /> Save</button><button className="ghost" onClick={resetAppearance}><RotateCcw size={16} /> Reset</button></div>
            </section>
            <section className="theme-preview">
              <span className="eyebrow">Preview</span>
              <h2>{statusLabel(adminThemeMode)} mode</h2>
              <p>Cards, inputs, buttons and tables use the same CSS variables as the current site.</p>
              <button>Primary Button</button>
            </section>
          </div>
        )}

        {active === 'integrations' && (
          <div className="admin-content-grid">
            <section className="panel integration-panel">
              <div className="panel-heading">
                <h2>Razorpay</h2>
                <p>Credentials are stored server-side. The secret key is never returned to the browser.</p>
              </div>
              <div className="confirmation-grid compact">
                <div><span>Status</span><strong>{integrations?.razorpay?.configured ? 'Configured' : 'Not Configured'}</strong></div>
                <div><span>Source</span><strong>{integrations?.razorpay?.source || '-'}</strong></div>
                <div><span>Mode</span><strong>{statusLabel(integrations?.razorpay?.mode || integrationDraft.razorpay.mode)}</strong></div>
              </div>
              <ToggleSwitch
                checked={integrationDraft.razorpay.enabled === '1'}
                onChange={checked => updateIntegration('razorpay', 'enabled', checked ? '1' : '0')}
                label="Enable Razorpay"
                description="When disabled, online Razorpay payments are unavailable."
              />
              <div className="form-grid">
                <label>Razorpay Key ID<input value={integrationDraft.razorpay.key_id || ''} placeholder="rzp_test_xxxxx" onChange={e => updateIntegration('razorpay', 'key_id', e.target.value)} /></label>
                <label>Razorpay Key Secret<input type="password" value={integrationDraft.razorpay.key_secret || ''} placeholder="********" onChange={e => updateIntegration('razorpay', 'key_secret', e.target.value)} /></label>
                <label>Mode<select value={integrationDraft.razorpay.mode || 'test'} onChange={e => updateIntegration('razorpay', 'mode', e.target.value)}><option value="test">Test</option><option value="live">Live</option></select></label>
              </div>
              <p className="small-note">Leave masked fields unchanged to keep the existing server-side values.</p>
              <div className="action-row">
                <button onClick={() => saveIntegration('razorpay')}><Save size={16} /> Save Razorpay</button>
                <button className="ghost" onClick={() => testIntegration('razorpay')}><KeyRound size={16} /> Test Configuration</button>
              </div>
            </section>

            <section className="panel integration-panel">
              <div className="panel-heading">
                <h2>Google Maps</h2>
                <p>The browser receives only the public Maps key needed for map loading.</p>
              </div>
              <div className="confirmation-grid compact">
                <div><span>Status</span><strong>{integrations?.google_maps?.configured ? 'Configured' : 'Not Configured'}</strong></div>
                <div><span>Source</span><strong>{integrations?.google_maps?.source || '-'}</strong></div>
              </div>
              <ToggleSwitch
                checked={integrationDraft.google_maps.enabled === '1'}
                onChange={checked => updateIntegration('google_maps', 'enabled', checked ? '1' : '0')}
                label="Enable Google Maps"
                description="Controls checkout maps, order tracking maps, and delivery dashboard maps."
              />
              <div className="form-grid">
                <label>Google Maps API Key<input type="password" value={integrationDraft.google_maps.api_key || ''} placeholder="********" onChange={e => updateIntegration('google_maps', 'api_key', e.target.value)} /></label>
              </div>
              <p className="small-note">Use a browser-restricted Google Maps key. Backend-only secrets are never exposed here.</p>
              <div className="action-row">
                <button onClick={() => saveIntegration('google_maps')}><Save size={16} /> Save Google Maps</button>
                <button className="ghost" onClick={() => testIntegration('google_maps')}><MapPinned size={16} /> Test Configuration</button>
              </div>
            </section>
          </div>
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

function ProductImageUpload({ label = 'Product Image', value, file, preview, onSelect, onRemove }) {
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
      <span>{label}</span>
      <div
        className={dragging ? 'image-dropzone dragging' : 'image-dropzone'}
        onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {currentPreview ? (
          <div className="image-preview-card">
            <img src={currentPreview} alt={`${label} preview`} />
            <div>
              <strong>{file?.name || `Current ${label.toLowerCase()}`}</strong>
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

