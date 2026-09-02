export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

export function token() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') || '';
}

export function setToken(value) {
  localStorage.setItem('token', value);
}

export function clearToken() {
  if (typeof window !== 'undefined') localStorage.removeItem('token');
}

export function rememberGuestOrder(orderId, accessToken) {
  if (typeof window === 'undefined' || !orderId || !accessToken) return;
  let orders = {};
  try {
    orders = JSON.parse(localStorage.getItem('pizza_house_guest_orders') || '{}') || {};
  } catch {
    orders = {};
  }
  orders[String(orderId)] = accessToken;
  localStorage.setItem('pizza_house_guest_orders', JSON.stringify(orders));
}

export function guestOrderToken(orderId) {
  if (typeof window === 'undefined' || !orderId) return '';
  try {
    const orders = JSON.parse(localStorage.getItem('pizza_house_guest_orders') || '{}') || {};
    return orders[String(orderId)] || '';
  } catch {
    return '';
  }
}

export function orderAccessQuery(orderId, explicitToken = '') {
  const accessToken = explicitToken || guestOrderToken(orderId);
  return accessToken ? `access_token=${encodeURIComponent(accessToken)}` : '';
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const auth = token();
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, cache: 'no-store', credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function uploadApi(path, formData, options = {}) {
  const headers = { ...(options.headers || {}) };
  const auth = token();
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, method: options.method || 'POST', body: formData, headers, cache: 'no-store', credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Upload failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function refreshAdminSession() {
  const res = await fetch(`${API_BASE}/auth/admin-refresh`, { method: 'POST', cache: 'no-store', credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    clearToken();
    const err = new Error(data.error || 'Admin session expired');
    err.status = res.status;
    throw err;
  }
  setToken(data.token);
  return data;
}

export async function adminApi(path, options = {}) {
  try {
    return await api(path, options);
  } catch (err) {
    if (err.status !== 401) throw err;
    await refreshAdminSession();
    return api(path, options);
  }
}

export async function adminUploadApi(path, formData, options = {}) {
  try {
    return await uploadApi(path, formData, options);
  } catch (err) {
    if (err.status !== 401) throw err;
    await refreshAdminSession();
    return uploadApi(path, formData, options);
  }
}

export async function invoiceBlob(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const auth = token();
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, cache: 'no-store', credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || 'Invoice request failed');
    err.status = res.status;
    throw err;
  }
  return res.blob();
}

export async function openInvoice(path) {
  const blob = await invoiceBlob(path);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function downloadInvoice(path, filename = 'invoice.pdf') {
  const blob = await invoiceBlob(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function adminLogout() {
  try {
    await api('/auth/admin-logout', { method: 'POST', body: JSON.stringify({}) });
  } finally {
    clearToken();
  }
}

export function applyTheme(theme = {}) {
  if (typeof document === 'undefined') return;
  const map = {
    background_color: '--background-color',
    primary_color: '--primary-color',
    secondary_color: '--secondary-color',
    button_color: '--button-color',
    button_hover_color: '--button-hover-color',
    button_text_color: '--button-text-color',
    text_color: '--text-color',
    card_color: '--card-color',
    header_color: '--header-color',
    footer_color: '--footer-color',
    border_color: '--border-color',
    accent_color: '--accent-color',
    font_family: '--font-family',
    heading_font_size: '--heading-font-size',
    body_font_size: '--body-font-size',
    button_font_size: '--button-font-size',
    navigation_font_size: '--navigation-font-size',
    product_font_size: '--product-font-size',
    button_border_radius: '--button-border-radius',
    button_padding: '--button-padding',
    button_font_weight: '--button-font-weight',
    card_border_radius: '--card-border-radius'
  };
  Object.entries(map).forEach(([key, variable]) => {
    if (theme[key]) document.documentElement.style.setProperty(variable, theme[key]);
  });
  if (theme.favicon_url) {
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = theme.favicon_url;
  }
}

export function inr(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
}

export function readCart() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem('pizza_house_cart') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCart(cart) {
  if (typeof window !== 'undefined') localStorage.setItem('pizza_house_cart', JSON.stringify(cart));
}

export function productImage(item, index = 0) {
  if (item?.image_url) {
    if (/^https?:\/\//i.test(item.image_url) || item.image_url.startsWith('/')) return item.image_url;
    return `${API_BASE.replace(/\/$/, '')}/${item.image_url.replace(/^\/+/, '')}`;
  }
  const fallback = [
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1594007654729-407eedc4be65?auto=format&fit=crop&w=900&q=80'
  ];
  return fallback[index % fallback.length];
}

export function itemSelectionText(item) {
  if (item?.options_display) return item.options_display;
  if (item?.selection_meta?.display) return item.selection_meta.display;
  if (item?.options_snapshot && !String(item.options_snapshot).trim().startsWith('{')) return item.options_snapshot;
  return '';
}

export function itemVariantText(item) {
  return item?.variant_label || item?.selection_meta?.variant?.label || item?.variant_snapshot || '';
}

export function whatsappOrderSummary(order, items = []) {
  const lines = [
    'The Pizza House',
    `Order ID: ${order.order_number || order.id}`,
    `Customer: ${order.customer_name || order.guest_name || 'Customer'}`,
    'Items:'
  ];
  items.forEach(item => {
    const variant = itemVariantText(item);
    const options = itemSelectionText(item);
    lines.push(`- ${item.name_snapshot}${variant ? ` (${variant})` : ''} x ${item.quantity}${Number(item.free_quantity || 0) > 0 ? ` + ${item.free_quantity} free` : ''}`);
    if (options) lines.push(`  ${options}`);
  });
  lines.push(`Total: ${inr(order.total_amount)}`);
  lines.push(`Payment status: ${order.payment_status}`);
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}
