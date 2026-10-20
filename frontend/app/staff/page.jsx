'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, CreditCard, LogOut, Menu, Minus, Plus, Printer, Save, Search, Trash2, Utensils, X } from 'lucide-react';
import { api, clearToken, inr, openInvoice, productImage, setToken, token } from '../lib';

function optionPrice(option, variantName) {
  if (variantName === 'S') return Number(option.small_price || option.fixed_price || 0);
  if (variantName === 'M') return Number(option.medium_price || option.fixed_price || 0);
  if (variantName === 'L') return Number(option.large_price || option.fixed_price || 0);
  return Number(option.fixed_price || option.small_price || 0);
}

function StaffOptionModal({ item, optionGroups, onClose, onAdd }) {
  const variants = useMemo(() => item?.variants || [], [item?.variants]);
  const variantSignature = variants.map(v => `${v.id}:${v.name}:${v.is_default}`).join('|');
  const firstVariant = variants.find(v => Number(v.is_default) === 1) || variants[0] || null;
  const [variantId, setVariantId] = useState(firstVariant?.id || null);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const nextFirstVariant = variants.find(v => Number(v.is_default) === 1) || variants[0] || null;
    setVariantId(nextFirstVariant?.id || null);
    setSelectedOptions([]);
    setQuantity(1);
  }, [item?.id, variantSignature, variants]);

  if (!item) return null;
  const variant = variants.find(v => Number(v.id) === Number(variantId)) || firstVariant;
  const isPizza = ['S', 'M', 'L'].includes(variant?.name);
  const allowedGroups = isPizza ? optionGroups : optionGroups.filter(group => !group.name?.toLowerCase().includes('crust') && !group.name?.toLowerCase().includes('topping'));
  const optionRows = allowedGroups.flatMap(group => (group.options || []).map(option => ({ ...option, group_name: group.name })));
  const chosen = optionRows.filter(option => selectedOptions.includes(Number(option.id)));
  const unitPrice = effectiveVariantPrice(item, variant) + chosen.reduce((sum, option) => sum + optionPrice(option, variant?.name), 0);
  const optionIds = chosen.map(option => Number(option.id)).sort((a, b) => a - b);

  function toggleOption(id, checked) {
    setSelectedOptions(current => checked ? [...current, Number(id)] : current.filter(value => value !== Number(id)));
  }

  return (
    <div className="option-modal-backdrop" role="dialog" aria-modal="true">
      <div className="option-modal">
        <div className="option-modal-header">
          <div><h2>{item.name}</h2><p>{item.description}</p></div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        {variants.length ? <section className="option-section"><h3>Variant / Size</h3><div className="choice-list">{variants.map(v => <label className="choice-row" key={v.id}><input type="radio" checked={Number(variant?.id) === Number(v.id)} onChange={() => { setVariantId(v.id); setSelectedOptions([]); }} /><span>{v.name === 'S' ? 'Small' : v.name === 'M' ? 'Medium' : v.name === 'L' ? 'Large' : v.name}</span><strong>{inr(effectiveVariantPrice(item, v))}</strong></label>)}</div></section> : null}
        {optionRows.length ? <section className="option-section"><h3>Options</h3><div className="choice-list">{optionRows.map(option => <label className="choice-row" key={option.id}><input type="checkbox" checked={selectedOptions.includes(Number(option.id))} onChange={e => toggleOption(option.id, e.target.checked)} /><span>{option.group_name}: {option.name}</span><strong>+{inr(optionPrice(option, variant?.name))}</strong></label>)}</div></section> : null}
        <div className="option-modal-footer">
          <div className="quantity-control"><button onClick={() => setQuantity(q => Math.max(1, q - 1))}><Minus size={14} /></button><strong>{quantity}</strong><button onClick={() => setQuantity(q => Math.min(Number(item.stock), q + 1))}><Plus size={14} /></button></div>
          <div className="modal-total"><span>Total</span><strong>{inr(unitPrice * quantity)}</strong></div>
          <button onClick={() => onAdd({ ...item, key: `${item.id}:${variant?.id || ''}:${optionIds.join('.')}`, variant_id: variant?.id || null, variant_name: variant?.name || null, option_ids: optionIds, options: chosen.map(option => ({ ...option, price: optionPrice(option, variant?.name) })), price: unitPrice, quantity })}>Add</button>
        </div>
      </div>
    </div>
  );
}

function staffBogoSizeCode(name = '') {
  if (name === 'S' || String(name).toLowerCase().includes('small')) return 'S';
  if (name === 'M' || String(name).toLowerCase().includes('medium')) return 'M';
  if (name === 'L' || String(name).toLowerCase().includes('large')) return 'L';
  return String(name || '').toUpperCase();
}

function staffBogoCapacity(offer, paidQty) {
  const buy = Math.max(1, Number(offer?.buy_qty || 1));
  const get = Math.max(1, Number(offer?.get_qty || 1));
  return Math.floor(Math.max(Number(paidQty || 0), 0) / buy) * get;
}

function staffBogoMappedFreeSize(offer, paidVariantName, weekday) {
  const rules = offer?.size_rules || {};
  const dayRules = (weekday && rules[weekday]) || rules.default || rules;
  if (!dayRules || !Object.keys(dayRules).length) return '';
  const mapped = dayRules[staffBogoSizeCode(paidVariantName)];
  return mapped ? staffBogoSizeCode(mapped) : '';
}

function reconcileStaffBogoCart(lines = [], offerForLine = null) {
  const paidByKey = new Map();
  lines.forEach(line => { if (!line.is_bogo_free) paidByKey.set(String(line.key || line.id), line); });
  const used = new Map();
  const out = [];
  lines.forEach(line => {
    if (!line.is_bogo_free) {
      out.push(line);
      return;
    }
    const parentKey = String(line.bogo_parent_key || '');
    const paid = paidByKey.get(parentKey);
    if (!paid) return;
    let capacity = Number(paid.quantity || 0);
    if (offerForLine) {
      const offer = offerForLine(paid);
      if (!offer || Number(line.price) > Number(paid.price)) return;
      capacity = staffBogoCapacity(offer, paid.quantity);
    }
    const already = used.get(parentKey) || 0;
    if (already >= capacity) return;
    const quantity = Math.min(Number(line.quantity || 1), capacity - already);
    used.set(parentKey, already + quantity);
    out.push({ ...line, quantity });
  });
  return out;
}

function repriceStaffLine(line, freshItems, freshGroups) {
  const item = (freshItems || []).find(row => String(row.id) === String(line.id));
  if (!item) return line;
  const variant = (item.variants || []).find(v => String(v.id) === String(line.variant_id)) || (item.variants || []).find(v => Number(v.is_default) === 1) || (item.variants || [])[0] || null;
  const optionsById = new Map((freshGroups || []).flatMap(group => (group.options || []).map(option => [String(option.id), { ...option, group_name: group.name }])));
  const options = (line.option_ids || []).map(id => optionsById.get(String(id))).filter(Boolean);
  const price = effectiveVariantPrice(item, variant) + options.reduce((sum, option) => sum + optionPrice(option, variant?.name), 0);
  return { ...line, name: item.name, category_id: item.category_id, stock: item.stock, variant_id: variant?.id || null, variant_name: variant?.name || null, options: options.map(option => ({ ...option, price: optionPrice(option, variant?.name) })), price };
}

function staffSizeLabel(name) {
  if (name === 'S') return 'Small';
  if (name === 'M') return 'Medium';
  if (name === 'L') return 'Large';
  return name || 'Regular';
}

function effectiveVariantPrice(item, variant = null) {
  const productPrice = Number(item?.price || 0);
  if (!variant) return productPrice;
  const variantPrice = Number(variant?.price || 0);
  return variantPrice > 0 ? variantPrice : productPrice;
}

function staffStartingPrice(item) {
  const variants = Array.isArray(item?.variants) ? item.variants : [];
  if (!variants.length) return Number(item?.price || 0);
  return Math.min(...variants.map(variant => effectiveVariantPrice(item, variant)));
}

const defaultStaffPermissions = {
  create_orders: true,
  view_current_orders: true,
  confirm_orders: true,
  mark_order_ready_complete: true,
  edit_orders: false,
  view_today_orders: true,
  view_reports: false,
  apply_manual_discount: false,
  view_customer_history: false,
  cancel_orders: false,
  delete_orders: false
};

function staffOrderActionLabel(status) {
  if (status === 'accepted') return 'Confirm';
  if (status === 'ready') return 'Ready';
  if (status === 'delivered') return 'Complete';
  return status.replaceAll('_', ' ');
}

function nextStaffStatuses(order) {
  if (order.status === 'received') return ['accepted'];
  if (order.status === 'accepted') return ['ready'];
  if (order.status === 'ready') return ['delivered'];
  return [];
}

function staffCancellable(order) {
  return order && !['delivered', 'cancelled'].includes(order.status);
}

function StaffBogoModal({ unlock, items, categories, weekday, onClose, onAdd }) {
  const eligibleItems = useMemo(() => {
    if (!unlock) return [];
    const categoryIds = unlock.offer?.category_ids || [];
    const productIds = unlock.offer?.product_ids || [];
    return items.filter(item => {
      if (!(item.variants || []).some(variant => ['S', 'M', 'L'].includes(variant.name))) return false;
      if (productIds.length) return productIds.map(Number).includes(Number(item.id));
      if (categoryIds.length) return categoryIds.map(Number).includes(Number(item.category_id));
      return Number(item.category_id) === Number(unlock.line.category_id);
    });
  }, [items, unlock]);
  const [categoryId, setCategoryId] = useState('all');
  const [productId, setProductId] = useState('');
  if (!unlock) return null;
  const requiredFreeSize = staffBogoMappedFreeSize(unlock.offer, unlock.line.variant_name, weekday);
  const visibleItems = eligibleItems.filter(item => categoryId === 'all' || String(item.category_id) === String(categoryId));
  const selectedItem = visibleItems.find(item => String(item.id) === String(productId)) || visibleItems[0] || null;
  const eligibleCategories = categories.filter(category => eligibleItems.some(item => Number(item.category_id) === Number(category.id)));
  const eligibleCategoryNames = eligibleCategories.map(category => category.name).join(', ') || 'Configured eligible pizza categories';
  const eligibleProductNames = eligibleItems.slice(0, 6).map(item => item.name).join(', ');

  function addFree(variant) {
    const variantPrice = effectiveVariantPrice(selectedItem, variant);
    if (!selectedItem || variantPrice > Number(unlock.line.price) || (requiredFreeSize !== '' && variant.name !== requiredFreeSize)) return;
    onAdd({
      ...selectedItem,
      key: `bogo:${unlock.line.key}:${selectedItem.id}:${variant.id}`,
      variant_id: variant.id,
      variant_name: variant.name,
      option_ids: [],
      options: [],
      price: variantPrice,
      quantity: 1,
      is_bogo_free: true,
      bogo_parent_key: unlock.line.key
    });
  }

  return (
    <div className="option-modal-backdrop" role="dialog" aria-modal="true">
      <div className="option-modal bogo-modal">
        <div className="option-modal-header">
          <div><span className="eyebrow">BOGO offer</span><h2>Choose free pizza</h2><p>{unlock.offer?.name || 'Active BOGO'} · Eligible size price must be {inr(unlock.line.price)} or less.</p></div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="bogo-context-grid">
          <div><span>Purchased Pizza</span><strong>{unlock.line.name}</strong></div>
          <div><span>Paid Size / Price</span><strong>{staffSizeLabel(unlock.line.variant_name)} · {inr(unlock.line.price)}</strong></div>
          <div><span>Eligible Categories</span><strong>{eligibleCategoryNames}</strong></div>
          <div><span>Eligible Products</span><strong>{eligibleProductNames}{eligibleItems.length > 6 ? ` +${eligibleItems.length - 6} more` : ''}</strong></div>
        </div>
        <div className="bogo-category-strip">
          <button className={categoryId === 'all' ? 'active' : ''} onClick={() => setCategoryId('all')}>All eligible</button>
          {eligibleCategories.map(category => <button key={category.id} className={String(categoryId) === String(category.id) ? 'active' : ''} onClick={() => { setCategoryId(category.id); setProductId(''); }}>{category.name}</button>)}
        </div>
        <div className="bogo-product-grid">
          {visibleItems.map(item => <button key={item.id} className={String(selectedItem?.id) === String(item.id) ? 'bogo-product-card active' : 'bogo-product-card'} onClick={() => setProductId(item.id)}><img src={productImage(item)} alt="" /><span>{item.name}</span></button>)}
        </div>
        {selectedItem ? <div className="bogo-size-grid">{(selectedItem.variants || []).filter(variant => ['S', 'M', 'L'].includes(variant.name)).map(variant => {
          const variantPrice = effectiveVariantPrice(selectedItem, variant);
          const disabled = variantPrice > Number(unlock.line.price) || (requiredFreeSize !== '' && variant.name !== requiredFreeSize);
          return <button key={variant.id} className={disabled ? 'bogo-size-option disabled' : 'bogo-size-option'} disabled={disabled} onClick={() => addFree(variant)}><strong>{staffSizeLabel(variant.name)}</strong><span>{inr(variantPrice)} {disabled ? '' : 'FREE'}</span><small>{disabled ? 'Not eligible: higher than paid pizza' : 'Eligible free size'}</small></button>;
        })}</div> : <p className="notice warning">No eligible pizzas configured.</p>}
      </div>
    </div>
  );
}

export default function StaffPage() {
  const [login, setLogin] = useState({ email: '', password: '' });
  const [staff, setStaff] = useState(null);
  const [permissions, setPermissions] = useState(defaultStaffPermissions);
  const [staffDashboard, setStaffDashboard] = useState({ today: { orders: 0 }, current_orders: [] });
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [optionGroups, setOptionGroups] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [offers, setOffers] = useState([]);
  const [activeBogoOffers, setActiveBogoOffers] = useState([]);
  const [activeBogoWeekday, setActiveBogoWeekday] = useState('');
  const [bogoPicker, setBogoPicker] = useState(null);
  const [modalItem, setModalItem] = useState(null);
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [orderType, setOrderType] = useState('takeaway');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState('none');
  const [fixedDiscount, setFixedDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [onlineReceived, setOnlineReceived] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [delivery, setDelivery] = useState({ address: '', latitude: '', longitude: '', distance_km: '' });
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [customerLookup, setCustomerLookup] = useState(null);
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [customerHistoryOpen, setCustomerHistoryOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [createdOrder, setCreatedOrder] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [lastOrderAction, setLastOrderAction] = useState('created');
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef('');
  const [posEnabled, setPosEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDeliveryQuote(null);
  }, [cart, discountType, fixedDiscount, selectedOfferId]);

  const loadStaffDashboard = useCallback(async () => {
    if (!token('staff')) return;
    try {
      const data = await api('/staff/dashboard');
      setStaffDashboard({ today: data.today || { orders: 0 }, current_orders: data.current_orders || [] });
      setPermissions({ ...defaultStaffPermissions, ...(data.permissions || {}) });
    } catch (err) {
      if (!String(err.message || '').toLowerCase().includes('permission')) setMessage(err.message);
    }
  }, []);

  useEffect(() => {
    if (token('staff')) api('/auth/me', { authScope: 'staff' }).then(data => {
      if (data.user?.role === 'staff') {
        setStaff(data.user);
        setPermissions({ ...defaultStaffPermissions, ...(data.user.permissions || {}) });
        loadStaffDashboard();
        api('/staff/offers').then(offerData => setOffers(offerData.offers || [])).catch(() => {});
      }
    }).catch(() => {});
    api('/menu').then(menu => {
      const menuItems = menu.items || menu.products || [];
      setCategories(menu.categories || []);
      setItems(menuItems);
      setOptionGroups(menu.option_groups || []);
      if (!menuItems.length) {
        setMessage('Menu API returned no active products for Staff POS.');
      }
    }).catch(err => setMessage(`Unable to load Staff POS menu: ${err.message}`));
    api('/settings').then(settingsResponse => {
      setPosEnabled((settingsResponse.settings?.staff_pos_enabled || '1') === '1');
    }).catch(err => setMessage(current => current || `Unable to load Staff POS settings: ${err.message}`));
    api('/offers/active-bogo').then(bogo => {
      setActiveBogoOffers(bogo.offers || []);
      setActiveBogoWeekday(bogo.weekday || '');
    }).catch(() => {
      setActiveBogoOffers([]);
      setActiveBogoWeekday('');
    });
  }, [loadStaffDashboard]);

  useEffect(() => {
    if (!staff) return undefined;
    loadStaffDashboard();
    const timer = setInterval(loadStaffDashboard, 15000);
    return () => clearInterval(timer);
  }, [staff, loadStaffDashboard]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (!staff || !permissions.view_customer_history) {
      setCustomerLookup(null);
      return undefined;
    }
    const normalizedPhone = String(customer.phone || '').replace(/\D/g, '').slice(-10);
    if (normalizedPhone.length < 6) {
      setCustomerLookup(null);
      setCustomerHistoryOpen(false);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        setCustomerLookupLoading(true);
        const data = await api(`/staff/customers/search?phone=${encodeURIComponent(normalizedPhone)}`, { authScope: 'staff' });
        const match = (data.customers || [])[0] || null;
        setCustomerLookup(match);
        if (match) {
          setCustomer(current => ({
            ...current,
            name: current.name || match.name || '',
            email: current.email || match.email || ''
          }));
        }
      } catch (err) {
        setCustomerLookup(null);
      } finally {
        setCustomerLookupLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [customer.phone, permissions.view_customer_history, staff]);

  const visibleItems = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return items.filter(item => {
      const category = categories.find(cat => Number(cat.id) === Number(item.category_id));
      const categoryMatch = activeCategory === 'all' || String(item.category_id) === String(activeCategory);
      const text = `${item.name} ${item.description || ''} ${category?.name || ''}`.toLowerCase();
      return categoryMatch && (!q || text.includes(q));
    });
  }, [items, categories, activeCategory, debouncedSearch]);

  const suggestions = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    if (!q) return [];
    return items
      .map(item => ({ item, category: categories.find(cat => Number(cat.id) === Number(item.category_id)) }))
      .filter(({ item, category }) => `${item.name} ${item.description || ''} ${category?.name || ''}`.toLowerCase().includes(q))
      .slice(0, 7);
  }, [items, categories, debouncedSearch]);

  function pizzaSizeCode(name = '') {
    if (name === 'S' || String(name).toLowerCase().includes('small')) return 'S';
    if (name === 'M' || String(name).toLowerCase().includes('medium')) return 'M';
    if (name === 'L' || String(name).toLowerCase().includes('large')) return 'L';
    return String(name || '').toUpperCase();
  }

  const offerForLine = useCallback((line) => {
    if (line.is_bogo_free || !['S', 'M', 'L'].includes(pizzaSizeCode(line.variant_name))) return null;
    return activeBogoOffers.find(offer => {
      const productIds = (offer.product_ids || []).map(Number);
      const categoryIds = (offer.category_ids || []).map(Number);
      const scoped = productIds.length ? productIds.includes(Number(line.id)) : (categoryIds.length ? categoryIds.includes(Number(line.category_id)) : true);
      if (!scoped) return false;
      const sizeRules = offer.size_rules || {};
      const rules = sizeRules[activeBogoWeekday] || sizeRules.default || sizeRules;
      const size = pizzaSizeCode(line.variant_name);
      return !rules || !Object.keys(rules).length || (Object.prototype.hasOwnProperty.call(rules, size) && String(rules[size] || '').trim() !== '');
    }) || null;
  }, [activeBogoOffers, activeBogoWeekday]);

  const subtotal = cart.reduce((sum, line) => sum + Number(line.price) * Number(line.quantity), 0);
  const explicitBogoDiscount = cart.filter(line => line.is_bogo_free).reduce((sum, line) => sum + Number(line.price) * Number(line.quantity), 0);
  const cartCount = cart.reduce((sum, line) => sum + Number(line.quantity), 0);
  const bogoUnlocks = useMemo(() => cart
    .filter(line => !line.is_bogo_free)
    .map(line => ({ line, offer: offerForLine(line), chosen: cart.filter(row => row.is_bogo_free && row.bogo_parent_key === line.key).reduce((sum, row) => sum + Number(row.quantity), 0) }))
    .filter(unlock => unlock.offer && unlock.chosen < staffBogoCapacity(unlock.offer, unlock.line.quantity)), [cart, offerForLine]);
  const staffMenuFingerprintRef = useRef('');
  const refreshStaffMenu = useCallback(() => {
    api('/menu').then(menu => {
      const menuItems = menu.items || menu.products || [];
      const groups = menu.option_groups || [];
      const fingerprint = JSON.stringify(menuItems.map(item => [item.id, item.price, item.category_id, item.is_active, (item.variants || []).map(v => [v.id, v.name, v.price, v.is_default, v.is_active])]));
      const catalogChanged = staffMenuFingerprintRef.current !== '' && staffMenuFingerprintRef.current !== fingerprint;
      staffMenuFingerprintRef.current = fingerprint;
      setCategories(menu.categories || []);
      setItems(menuItems);
      setOptionGroups(groups);
      setModalItem(current => {
        if (!current) return current;
        return menuItems.find(item => String(item.id) === String(current.id)) || current;
      });
      setCart(current => {
        if (!current.length) return current;
        const next = reconcileStaffBogoCart(current.map(line => repriceStaffLine(line, menuItems, groups)), offerForLine);
        return JSON.stringify(current) === JSON.stringify(next) ? current : next;
      });
      if (catalogChanged && !editingOrderId) setMessage('Menu updated with the latest saved prices.');
    }).catch(() => {});
  }, [offerForLine, editingOrderId]);
  const selectedOffer = offers.find(offer => String(offer.id) === String(selectedOfferId));
  const bogoPreview = useMemo(() => {
    if (discountType !== 'bogo' || !selectedOffer) return { amount: 0, freeQty: 0, label: '' };
    const scopedBuyProducts = (selectedOffer.product_ids || []).map(Number);
    const scopedBuyCategories = (selectedOffer.category_ids || []).map(Number);
    const previewMatchesBuy = (line) => {
      if (line.is_bogo_free) return false;
      if (scopedBuyProducts.length) return scopedBuyProducts.includes(Number(line.id));
      if (scopedBuyCategories.length) return scopedBuyCategories.includes(Number(line.category_id));
      const legacyBuyId = Number(selectedOffer.buy_product_id || (selectedOffer.scope === 'item' ? selectedOffer.scope_id : 0));
      return legacyBuyId ? Number(line.id) === legacyBuyId : Number(line.category_id) === Number(selectedOffer.scope_id);
    };
    const buyId = Number(selectedOffer.buy_product_id || (selectedOffer.scope === 'item' ? selectedOffer.scope_id : 0));
    const freeId = Number(selectedOffer.free_product_id || (selectedOffer.scope === 'item' ? selectedOffer.scope_id : buyId));
    const buyQtyNeeded = Math.max(1, Number(selectedOffer.buy_qty || 1));
    const getQty = Math.max(1, Number(selectedOffer.get_qty || 1));
    const matchingBuyQty = cart.filter(previewMatchesBuy).reduce((sum, line) => sum + Number(line.quantity), 0);
    const freeLine = (scopedBuyProducts.length || scopedBuyCategories.length) ? cart.find(previewMatchesBuy) : cart.find(line => Number(line.id) === freeId);
    const freeQty = Math.min(freeLine ? Number(freeLine.quantity) : 0, Math.floor(matchingBuyQty / buyQtyNeeded) * getQty);
    return {
      amount: freeLine ? Math.min(subtotal, Number(freeLine.price) * freeQty) : 0,
      freeQty,
      label: freeQty > 0 ? `${freeQty} × ${selectedOffer.free_product_name || freeLine?.name || 'item'} free` : 'Offer requirements not met'
    };
  }, [cart, discountType, selectedOffer, subtotal]);
  const manualDiscount = discountType === 'fixed'
    ? Math.min(Math.max(Number(fixedDiscount || 0), 0), subtotal)
    : discountType === 'percent'
      ? Math.min(subtotal, subtotal * Math.min(Math.max(Number(fixedDiscount || 0), 0), 100) / 100)
    : discountType === 'bogo' ? bogoPreview.amount : 0;
  const totalDiscount = manualDiscount + explicitBogoDiscount;
  const discountedSubtotal = Math.max(subtotal - totalDiscount, 0);
  const quotedDeliveryCharge = orderType === 'delivery' ? Number(deliveryQuote?.delivery_charge || 0) : 0;
  const finalTotal = orderType === 'delivery' ? Math.max(discountedSubtotal + quotedDeliveryCharge, 0) : discountedSubtotal;
  const cashAmount = paymentMethod === 'cash' ? finalTotal : paymentMethod === 'split' ? Number(cashReceived || 0) : 0;
  const onlineAmount = paymentMethod === 'online' ? finalTotal : paymentMethod === 'split' ? Number(onlineReceived || 0) : 0;
  const totalReceived = cashAmount + onlineAmount;
  const change = Math.max(totalReceived - finalTotal, 0);
  const paidNow = Math.min(totalReceived, finalTotal);
  const remaining = Math.max(finalTotal - totalReceived, 0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onFocus = () => refreshStaffMenu();
    const timer = setInterval(() => refreshStaffMenu(), 60000);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshStaffMenu]);

  function choosePaymentMethod(method) {
    setPaymentMethod(method);
    if (method !== 'split') {
      setCashReceived('');
      setOnlineReceived('');
    }
  }

  async function quoteStaffDelivery() {
    if (orderType !== 'delivery') return;
    if (!delivery.latitude || !delivery.longitude) {
      setDeliveryQuote(null);
      setMessage('Enter delivery latitude and longitude for an exact quote, or enter the distance — the final charge is calculated by the server on save.');
      return;
    }
    setDeliveryQuoteLoading(true);
    try {
      const data = await api('/delivery/quote', { method: 'POST', body: JSON.stringify({ latitude: delivery.latitude, longitude: delivery.longitude, order_amount: Math.max(discountedSubtotal, 0), order_type: 'delivery' }) });
      setDeliveryQuote(data);
      setMessage(data.is_free_delivery ? 'Free delivery applies for this order.' : `Delivery charge ${inr(data.delivery_charge)} for ${data.distance_km} km. Final charge is confirmed by the server on save.`);
    } catch (err) {
      setDeliveryQuote(null);
      setMessage(err.message);
    } finally {
      setDeliveryQuoteLoading(false);
    }
  }

  async function staffLogin(event) {
    event.preventDefault();
    setMessage('');
    try {
      const data = await api('/auth/staff-login', { method: 'POST', body: JSON.stringify(login) });
      setToken(data.token, 'staff');
      setStaff(data.user);
      setPermissions({ ...defaultStaffPermissions, ...(data.user.permissions || {}) });
      loadStaffDashboard();
      api('/staff/offers').then(offerData => setOffers(offerData.offers || [])).catch(() => {});
    } catch (err) {
      setMessage(err.message);
    }
  }

  function addLine(line) {
    setCart(current => {
      const existing = current.find(row => row.key === line.key);
      const merged = existing ? current.map(row => row.key === line.key ? { ...row, quantity: Math.min(Number(row.stock), Number(row.quantity) + Number(line.quantity)) } : row) : [...current, line];
      const reconciled = reconcileStaffBogoCart(merged, offerForLine);
      return reconciled;
    });
    setModalItem(null);
    setBogoPicker(null);
  }

  function qty(key, delta) {
    setCart(current => {
      const target = current.find(line => (line.key || line.id) === key);
      if (!target) return current;
      const targetKey = String(target.key || target.id);
      const next = !target.is_bogo_free && Number(target.quantity) + delta <= 0
        ? current.filter(line => line.is_bogo_free ? String(line.bogo_parent_key || '') !== targetKey : String(line.key || line.id) !== key)
        : current.map(line => (line.key || line.id) === key ? { ...line, quantity: Number(line.quantity) + delta } : line).filter(line => line.quantity > 0);
      return reconcileStaffBogoCart(next, offerForLine);
    });
  }

  function add(item) {
    const variants = item.variants || [];
    if (variants.length > 1 || ['S', 'M', 'L'].includes(variants[0]?.name)) {
      setModalItem(item);
      return;
    }
    const variant = variants.find(v => Number(v.is_default) === 1) || variants[0] || null;
    addLine({ ...item, key: `${item.id}:${variant?.id || ''}:`, variant_id: variant?.id || null, variant_name: variant?.name || null, option_ids: [], options: [], price: effectiveVariantPrice(item, variant), quantity: 1 });
  }

  function resetOrderForm() {
    setCart([]);
    setEditingOrder(null);
    setEditingOrderId(null);
    idempotencyKeyRef.current = '';
    setOrderType('takeaway');
    setDelivery({ address: '', latitude: '', longitude: '', distance_km: '' });
    setDeliveryQuote(null);
    setPaymentMethod('cash');
    setDiscountOpen(false);
    setDiscountType('none');
    setFixedDiscount('');
    setDiscountReason('');
    setSelectedOfferId('');
    setCashReceived('');
    setOnlineReceived('');
    setTableNumber('');
    setCustomer({ name: '', phone: '', email: '' });
    setBogoPicker(null);
    setModalItem(null);
    setMobileCartOpen(false);
  }

  function cartLineFromOrderItem(item) {
    const product = items.find(row => Number(row.id) === Number(item.menu_item_id));
    const optionIds = (item.selection_meta?.options || []).map(option => Number(option.id)).filter(Boolean);
    const key = `edit:${item.id}:${item.menu_item_id}:${item.variant_id || ''}:${optionIds.join('.')}`;
    return {
      ...(product || {}),
      id: Number(item.menu_item_id),
      key,
      name: item.name_snapshot,
      stock: Number(product?.stock || 9999),
      variant_id: item.variant_id || null,
      variant_name: item.variant_snapshot || null,
      option_ids: optionIds,
      options: item.selection_meta?.options || [],
      price: Number(item.unit_price || 0),
      quantity: Math.max(1, Number(item.quantity || 1)),
      is_bogo_free: Boolean(item.is_bogo_free),
      bogo_parent_key: item.bogo_parent_key || ''
    };
  }

  async function editStaffOrder(order) {
    if (!permissions.edit_orders) return setMessage('You do not have permission to edit orders.');
    try {
      setMessage('');
      if (['out_for_delivery', 'delivered', 'cancelled'].includes(order.status)) throw new Error(`Order ${order.order_number} can no longer be edited (status: ${String(order.status).replaceAll('_', ' ')}).`);
      const data = await api(`/staff/orders/${order.id}/edit`);
      if (data && data.can_edit === false) throw new Error(`Order ${data.order?.order_number || order.order_number} can no longer be edited.`);
      if (!data || !data.order || !data.order.id) throw new Error('Could not load order details. Please try again.');
      setEditingOrder(data.order);
      setEditingOrderId(Number(data.order.id));
      setCreatedOrder(null);
      const mappedLines = (data.items || []).map(cartLineFromOrderItem);
      const editPaidLines = mappedLines.filter(line => !line.is_bogo_free);
      const editUsedFree = new Map();
      setCart(mappedLines.map(line => {
        if (!line.is_bogo_free) return line;
        if (editPaidLines.some(paid => paid.key === line.bogo_parent_key)) return line;
        const fallback = editPaidLines.find(paid => {
          if (Number(line.price) > Number(paid.price)) return false;
          const offer = offerForLine(paid);
          if (!offer) return false;
          return (editUsedFree.get(paid.key) || 0) + Number(line.quantity) <= staffBogoCapacity(offer, paid.quantity);
        });
        if (!fallback) return line;
        editUsedFree.set(fallback.key, (editUsedFree.get(fallback.key) || 0) + Number(line.quantity));
        return { ...line, bogo_parent_key: fallback.key };
      }));
      setCustomer({ name: data.order.customer_name || '', phone: data.order.customer_phone || '', email: data.order.customer_email || '' });
      setOrderType(['takeaway', 'delivery', 'dine_in'].includes(data.order.order_type) ? data.order.order_type : 'takeaway');
      setDelivery({ address: data.order.delivery_address || '', latitude: data.order.latitude || '', longitude: data.order.longitude || '', distance_km: data.order.distance_km || '' });
      setDeliveryQuote(null);
      setPaymentMethod(['cash', 'online', 'split'].includes(data.order.payment_method) ? data.order.payment_method : 'cash');
      setCashReceived(data.order.cash_received || '');
      setOnlineReceived(data.order.online_received || '');
      setTableNumber(data.order.table_number || '');
      const savedDiscountType = data.order?.staff_discount_type || 'none';
      setDiscountOpen(savedDiscountType !== 'none');
      setDiscountType(['fixed', 'percent', 'bogo'].includes(savedDiscountType) ? savedDiscountType : 'none');
      setFixedDiscount(savedDiscountType === 'fixed' || savedDiscountType === 'percent' ? String(data.order?.staff_discount_value ?? '') : '');
      setDiscountReason(savedDiscountType === 'fixed' || savedDiscountType === 'percent' ? String(data.order?.staff_discount_description ?? '') : '');
      setSelectedOfferId(savedDiscountType === 'bogo' ? String(data.order?.staff_offer_id ?? '') : '');
      // Discount panel prefilled from the saved order above so the permitted discount survives edits.
      // setDiscountType prefilled above; do not reset the saved discount here.
      setMessage(`Editing ${data.order.order_number}. Add, remove, or adjust items, then save changes.`);
    } catch (err) {
      setMessage(err.message);
    }
  }

  function submitOrderForm() {
    if (loading || submittingRef.current) return;
    submittingRef.current = true;
    const done = () => { submittingRef.current = false; };
    (editingOrderId ? saveEditedOrder() : createOrder()).finally(done);
  }

  async function saveEditedOrder() {
    if (!editingOrderId || !editingOrder) return setMessage('No order is being edited. Your changes were not saved.');
    if (!permissions.edit_orders) return setMessage('You do not have permission to edit orders.');
    if (!cart.length) return setMessage('Edited order must contain at least one item.');
    if (customer.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) return setMessage('Enter a valid customer email address or leave it empty.');
    if (orderType === 'delivery') {
      if (!delivery.address.trim()) return setMessage('Delivery address is required.');
      if ((!delivery.latitude || !delivery.longitude) && !delivery.distance_km) return setMessage('Enter delivery coordinates or the delivery distance.');
    }
    if (['fixed', 'percent', 'bogo'].includes(discountType) && !permissions.apply_manual_discount) return setMessage('You do not have permission to apply discounts.');
    setLoading(true);
    try {
      const payload = {
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email,
        order_type: orderType,
        table_number: orderType === 'dine_in' ? tableNumber : undefined,
        ...(orderType === 'delivery' ? { delivery_address: delivery.address, latitude: delivery.latitude, longitude: delivery.longitude, distance_km: delivery.distance_km } : {}),
        payment_method: paymentMethod,
        cash_received: paymentMethod === 'split' ? cashReceived : undefined,
        online_received: paymentMethod === 'split' ? onlineReceived : undefined,
        items: cart.map(line => ({
          id: line.id,
          variant_id: line.variant_id || null,
          option_ids: line.option_ids || [],
          quantity: line.quantity,
          client_key: line.key || '',
          is_bogo_free: Boolean(line.is_bogo_free),
          bogo_parent_key: line.bogo_parent_key || ''
        }))
      };
      payload.discount_type = discountType;
      payload.discount_amount = ['fixed', 'percent'].includes(discountType) ? fixedDiscount : undefined;
      payload.discount_reason = ['fixed', 'percent'].includes(discountType) ? discountReason : undefined;
      payload.offer_id = discountType === 'bogo' ? selectedOfferId : undefined;
      payload.order_id = editingOrderId;
      const data = await api(`/staff/orders/${editingOrderId}/edit`, { method: 'PUT', body: JSON.stringify(payload) });
      setLastOrderAction('updated');
      setCreatedOrder(data.order);
      setStaffDashboard(current => ({
        ...current,
        current_orders: (current.current_orders || []).map(row => Number(row.id) === Number(editingOrderId) ? { ...row, ...data.order } : row)
      }));
      resetOrderForm();
      setMessage(`Order ${data.order.order_number} updated successfully. Total ${inr(data.order.total_amount)} · Paid ${inr(data.order.paid_amount || 0)} · Remaining ${inr(data.order.remaining_amount || 0)}.`);
      loadStaffDashboard();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  function selectCategory(categoryId) {
    setActiveCategory(categoryId);
    setMobileCategoryOpen(false);
    document.querySelector('.staff-menu-panel')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function selectSuggestion(item) {
    setActiveCategory(item.category_id);
    setSearch(item.name);
    setDebouncedSearch(item.name);
    setHighlightedProductId(item.id);
    setTimeout(() => {
      document.getElementById(`staff-product-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    setTimeout(() => setHighlightedProductId(null), 1800);
  }

  async function createOrder() {
    if (!permissions.create_orders) return setMessage('You do not have permission to create orders.');
    if (editingOrderId) return setMessage(`You are editing Order ${editingOrder?.order_number || `#${editingOrderId}`}. Save or cancel the edit before creating a new order.`);
    if (!cart.length) return setMessage('Cart is empty.');
    if (customer.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) return setMessage('Enter a valid customer email address or leave it empty.');
    if (orderType === 'delivery') {
      if (!delivery.address.trim()) return setMessage('Delivery address is required.');
      if ((!delivery.latitude || !delivery.longitude) && !delivery.distance_km) return setMessage('Enter delivery coordinates or the delivery distance.');
    }
    if (cashAmount < 0 || onlineAmount < 0 || Number.isNaN(cashAmount) || Number.isNaN(onlineAmount)) return setMessage('Enter valid payment amounts.');
    if (discountType === 'fixed' && Number(fixedDiscount || 0) > subtotal) return setMessage('Discount cannot exceed subtotal.');
    if (discountType === 'percent' && (Number(fixedDiscount || 0) < 0 || Number(fixedDiscount || 0) > 100)) return setMessage('Percentage discount must be between 0 and 100.');
    if (['fixed', 'percent', 'bogo'].includes(discountType) && !permissions.apply_manual_discount) return setMessage('You do not have permission to apply discounts.');
    if (discountType === 'bogo' && (!selectedOfferId || bogoPreview.freeQty <= 0)) return setMessage('Select a valid BOGO offer for this cart.');
    setLoading(true);
    setMessage('');
    try {
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
      const idempotency = idempotencyKeyRef.current;
      const body = {
        order_type: orderType,
        ...(orderType === 'delivery' ? { delivery_address: delivery.address, latitude: delivery.latitude, longitude: delivery.longitude, distance_km: delivery.distance_km } : {}),
        payment_method: paymentMethod,
        items: cart.map(line => ({ id: line.id, variant_id: line.variant_id, option_ids: line.option_ids || [], quantity: line.quantity, client_key: line.key || '', is_bogo_free: Boolean(line.is_bogo_free), bogo_parent_key: line.bogo_parent_key || '' })),
        cash_received: paymentMethod === 'split' ? cashReceived : undefined,
        online_received: paymentMethod === 'split' ? onlineReceived : undefined,
        table_number: orderType === 'dine_in' ? tableNumber : undefined,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email,
        discount_type: discountType,
        discount_amount: ['fixed', 'percent'].includes(discountType) ? fixedDiscount : undefined,
        discount_reason: ['fixed', 'percent'].includes(discountType) ? discountReason : undefined,
        offer_id: discountType === 'bogo' ? selectedOfferId : undefined,
        idempotency_key: idempotency
      };
      const data = await api('/staff/orders', { method: 'POST', headers: { 'X-Idempotency-Key': idempotency }, body: JSON.stringify(body) });
      setLastOrderAction('created');
      if (data.duplicate) setMessage(`Order ${data.order.order_number} was already created. Retry detected — no duplicate order was made.`);
      setCreatedOrder(data.order);
      resetOrderForm();
      loadStaffDashboard();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateStaffOrder(order, status) {
    try {
      setMessage('');
      await api(`/staff/orders/${order.id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      setMessage(`Order ${order.order_number} updated.`);
      if (['cancelled', 'delivered'].includes(status)) {
        setStaffDashboard(current => ({
          ...current,
          current_orders: (current.current_orders || []).filter(row => Number(row.id) !== Number(order.id))
        }));
      }
      loadStaffDashboard();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function deleteStaffOrder(order) {
    if (!permissions.delete_orders) return setMessage('You do not have permission to delete orders.');
    if (!window.confirm(`Delete ${order.order_number}? This only works for safe, non-audited POS orders.`)) return;
    try {
      setMessage('');
      await api(`/staff/orders/${order.id}`, { method: 'DELETE' });
      setMessage(`Order ${order.order_number} deleted.`);
      setStaffDashboard(current => ({
        ...current,
        current_orders: (current.current_orders || []).filter(row => Number(row.id) !== Number(order.id))
      }));
      loadStaffDashboard();
    } catch (err) {
      setMessage(err.message);
    }
  }

  const categoryButtons = (
    <>
      <button className={activeCategory === 'all' ? 'staff-category active' : 'staff-category'} onClick={() => selectCategory('all')}><Utensils size={20} /><span>All Menu</span></button>
      {categories.map(category => (
        <button key={category.id} className={String(activeCategory) === String(category.id) ? 'staff-category active' : 'staff-category'} onClick={() => selectCategory(category.id)}>
          {category.image_url ? <img src={productImage(category)} alt="" loading="lazy" /> : <Utensils size={20} />}
          <span>{category.name}</span>
        </button>
      ))}
    </>
  );

  const cartPanel = (
    <aside className="staff-cart-panel">
      <div className="staff-cart-head">
        <div>
          <span className="eyebrow">Current Order</span>
          <h2>{cartCount ? `${cartCount} item${cartCount === 1 ? '' : 's'}` : 'Cart Empty'}</h2>
        </div>
        <strong>{inr(finalTotal)}</strong>
      </div>

      <div className="staff-order-meta">
        <div><span>Staff</span><strong>{staff?.name}</strong></div>
        <div><span>Source</span><strong>STAFF / OFFLINE</strong></div>
      </div>

      <div className="staff-segmented">
        <button className={orderType === 'takeaway' ? 'active' : ''} onClick={() => setOrderType('takeaway')}>Takeaway</button>
        <button className={orderType === 'delivery' ? 'active' : ''} onClick={() => setOrderType('delivery')}>Delivery</button>
        <button className={orderType === 'dine_in' ? 'active' : ''} onClick={() => setOrderType('dine_in')}>Dine-In</button>
      </div>
      {/* Superseded duplicate takeaway buttons, kept out of render:
        <button className={orderType === 'takeaway' ? 'active' : ''} onClick={() => setOrderType('takeaway')}>Takeaway</button>
        <button className={orderType === 'takeaway' ? 'active' : ''} onClick={() => setOrderType('takeaway')}>Takeaway</button>
      </div>
      */}
      {orderType === 'dine_in' ? <input className="staff-input" placeholder="Table number / seat optional" value={tableNumber} onChange={e => setTableNumber(e.target.value)} /> : null}
      {orderType === 'delivery' ? (
        <div className="staff-customer-grid">
          <textarea className="staff-input staff-textarea" placeholder="Delivery address" aria-label="Delivery address" value={delivery.address} onChange={e => { setDelivery({ ...delivery, address: e.target.value }); setDeliveryQuote(null); }} />
          <div className="staff-customer-grid two-col">
            <input className="staff-input" placeholder="Latitude" inputMode="decimal" value={delivery.latitude} onChange={e => { setDelivery({ ...delivery, latitude: e.target.value }); setDeliveryQuote(null); }} />
            <input className="staff-input" placeholder="Longitude" inputMode="decimal" value={delivery.longitude} onChange={e => { setDelivery({ ...delivery, longitude: e.target.value }); setDeliveryQuote(null); }} />
          </div>
          <input className="staff-input" placeholder="Distance (km) — if coordinates unknown" inputMode="decimal" value={delivery.distance_km} onChange={e => { setDelivery({ ...delivery, distance_km: e.target.value }); setDeliveryQuote(null); }} />
          <div className="action-row">
            <button className="ghost" onClick={quoteStaffDelivery} disabled={deliveryQuoteLoading || !cart.length}>{deliveryQuoteLoading ? 'Calculating...' : 'Calculate Delivery'}</button>
          </div>
          {deliveryQuote ? <p className="small-note">{deliveryQuote.is_free_delivery ? `FREE DELIVERY · ${deliveryQuote.distance_km} km · ${deliveryQuote.message || ''}` : `Delivery ${inr(deliveryQuote.delivery_charge)} · ${deliveryQuote.distance_km} km`}</p> : <p className="small-note">Enter coordinates and tap Calculate Delivery for an exact quote, or enter the distance — the server confirms the final charge on save.</p>}
        </div>
      ) : null}

      <div className="staff-customer-grid">
        <input className="staff-input" placeholder="Customer name optional" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
        <input className="staff-input" placeholder="Phone optional" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} />
        <input className="staff-input" placeholder="Email optional" value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })} />
      </div>
      {permissions.view_customer_history && (customerLookupLoading || customerLookup) ? (
        <div className="staff-auto-payment-card">
          {customerLookupLoading ? <span>Looking up customer history...</span> : (
            <>
              <span>Repeat Customer</span>
              <strong>{customerLookup.name || customerLookup.phone}</strong>
              <small>{customerLookup.total_orders} order{customerLookup.total_orders === 1 ? '' : 's'} · Spent {inr(customerLookup.total_spent || 0)} · Last {customerLookup.last_order?.order_number}</small>
              <div className="action-row">
                <button className="ghost" onClick={() => setCustomerHistoryOpen(open => !open)}>{customerHistoryOpen ? 'Hide History' : 'View History'}</button>
              </div>
              {customerHistoryOpen ? <div className="staff-current-order-list">{(customerLookup.orders || []).map(order => <div className="staff-current-order-card" key={order.id}><div><strong>{order.order_number}</strong><span>{order.created_at}</span></div><div><span>{order.order_type}</span><strong>{inr(order.total_amount)}</strong></div><div><span>{order.payment_status}</span><small>{order.status}</small></div></div>)}</div> : null}
            </>
          )}
        </div>
      ) : null}

      <div className="staff-cart-lines">
        {!cart.length ? <div className="empty-state compact"><strong>No items yet</strong><p>Add products from the menu to start a counter order.</p></div> : null}
        {cart.map(line => (
          <div className={line.is_bogo_free ? 'staff-cart-line free-cart-line' : 'staff-cart-line'} key={line.key || line.id}>
            <div>
              <strong>{line.name} {line.is_bogo_free ? <span className="bogo-free-badge">FREE</span> : null}</strong>
              {line.variant_name || line.options?.length ? <p>{line.variant_name}{line.options?.length ? ` | ${line.options.map(o => o.name).join(', ')}` : ''}</p> : null}
            </div>
            <div className="staff-cart-actions">
              <div className="quantity-control small"><button onClick={() => qty(line.key || line.id, -1)}><Minus size={14} /></button><strong>{line.quantity}</strong><button onClick={() => qty(line.key || line.id, 1)} disabled={line.is_bogo_free}><Plus size={14} /></button></div>
              <strong>{line.is_bogo_free ? 'FREE' : inr(Number(line.price) * Number(line.quantity))}</strong>
              <button className="icon-button tiny" onClick={() => qty(line.key || line.id, -line.quantity)} aria-label={`Remove ${line.name}`}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      {bogoUnlocks.length ? <div className="bogo-unlock-list">{bogoUnlocks.map(unlock => <div className="bogo-unlock-card" key={unlock.line.key}><div><strong>Free pizza unlocked</strong><span>Choose 1 pizza up to {inr(unlock.line.price)}</span></div><button className="ghost" onClick={() => setBogoPicker(unlock)}>Choose Free Pizza</button></div>)}</div> : null}

      <div className="staff-payment-section">
        <div className="staff-discount-head">
          <div><span className="eyebrow">Discount</span><strong>{manualDiscount > 0 ? `-${inr(manualDiscount)}` : 'No discount'}</strong></div>
          {permissions.apply_manual_discount ? <button className="ghost" onClick={() => { setDiscountOpen(open => !open); if (discountType === 'none') setDiscountType('fixed'); }}>{discountOpen ? 'Hide' : 'Add Discount'}</button> : <span className="small-note">No discount permission</span>}
        </div>
        {discountOpen && permissions.apply_manual_discount ? (
          <div className="staff-discount-panel">
            <select className="staff-input" value={discountType} onChange={e => setDiscountType(e.target.value)}>
              <option value="none">No discount</option>
              <option value="fixed">Fixed amount</option>
              <option value="percent">Percentage</option>
              <option value="bogo">BOGO offer</option>
            </select>
            {['fixed', 'percent'].includes(discountType) ? (
              <>
                <input className="staff-input" type="number" min="0" max={discountType === 'percent' ? 100 : subtotal} step="0.01" placeholder={discountType === 'percent' ? 'Discount percent' : 'Discount amount'} value={fixedDiscount} onChange={e => setFixedDiscount(e.target.value)} />
                <input className="staff-input" placeholder="Reason / note optional" value={discountReason} onChange={e => setDiscountReason(e.target.value)} />
                {discountType === 'percent' ? <p className="small-note">Calculated discount: {inr(manualDiscount)}</p> : null}
              </>
            ) : null}
            {discountType === 'bogo' ? (
              <>
                <select className="staff-input" value={selectedOfferId} onChange={e => setSelectedOfferId(e.target.value)}>
                  <option value="">Select active offer</option>
                  {offers.filter(offer => (offer.offer_type || 'bogo') === 'bogo' && offer.schedule_active !== false && offer.schedule_active !== 0).map(offer => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
                </select>
                <p className={bogoPreview.freeQty > 0 ? 'small-note success-text' : 'small-note'}>{selectedOfferId ? `${bogoPreview.label} · Discount ${inr(bogoPreview.amount)}` : 'Choose an active BOGO offer.'}</p>
              </>
            ) : null}
          </div>
        ) : null}
        <span className="eyebrow">Payment</span>
        <div className="payment-options staff-payment-options">
          <label className={paymentMethod === 'cash' ? 'payment-card selected' : 'payment-card'}><input type="radio" checked={paymentMethod === 'cash'} onChange={() => choosePaymentMethod('cash')} />Cash</label>
          <label className={paymentMethod === 'online' ? 'payment-card selected' : 'payment-card'}><input type="radio" checked={paymentMethod === 'online'} onChange={() => choosePaymentMethod('online')} />Online</label>
          <label className={paymentMethod === 'split' ? 'payment-card selected' : 'payment-card'}><input type="radio" checked={paymentMethod === 'split'} onChange={() => choosePaymentMethod('split')} />Split</label>
        </div>
        {paymentMethod === 'cash' ? (
          <div className="staff-auto-payment-card">
            <span>Cash</span>
            <strong>{inr(finalTotal)}</strong>
            <small>Paid · {inr(0)} Remaining</small>
          </div>
        ) : null}
        {paymentMethod === 'online' ? (
          <div className="staff-auto-payment-card">
            <span>Online</span>
            <strong>{inr(finalTotal)}</strong>
            <small>Counter digital payment · {inr(0)} Remaining</small>
          </div>
        ) : null}
        {paymentMethod === 'split' ? (
          <>
            <input className="staff-input" type="number" min="0" step="0.01" placeholder="Cash received" value={cashReceived} disabled={editingOrderId != null} onChange={e => setCashReceived(e.target.value)} />
            <input className="staff-input" type="number" min="0" step="0.01" placeholder="Online received" value={onlineReceived} disabled={editingOrderId != null} onChange={e => setOnlineReceived(e.target.value)} />
            <p className="small-note">Only split payment uses manual amounts. Counter online means UPI/card/bank app collected at the counter.{editingOrderId != null ? ' Recorded received amounts stay unchanged while editing; only the remaining balance is recomputed.' : ''}</p>
          </>
        ) : null}
      </div>

      {paymentMethod === 'split' ? (
        <div className="payment-breakdown staff-payment-breakdown">
          <div><span>Subtotal</span><strong>{inr(subtotal)}</strong></div>
          {explicitBogoDiscount > 0 ? <div><span>BOGO Discount</span><strong>-{inr(explicitBogoDiscount)}</strong></div> : null}
          <div><span>Discount</span><strong>{manualDiscount > 0 ? `-${inr(manualDiscount)}` : inr(0)}</strong></div>
          {orderType === 'delivery' ? <div><span>Delivery Charge</span><strong>{deliveryQuote ? inr(quotedDeliveryCharge) : 'On save'}</strong></div> : null}
          <div className="grand"><span>Grand Total</span><strong>{inr(finalTotal)}</strong></div>
          <div><span>Total Received</span><strong>{inr(totalReceived)}</strong></div>
          <div><span>Paid</span><strong>{inr(paidNow)}</strong></div>
          <div><span>Remaining</span><strong>{inr(remaining)}</strong></div>
          <div><span>Change</span><strong>{inr(change)}</strong></div>
        </div>
      ) : null}
      {orderType === 'delivery' && paymentMethod !== 'split' ? (
        <div className="payment-breakdown staff-payment-breakdown">
          <div><span>Subtotal</span><strong>{inr(subtotal)}</strong></div>
          {explicitBogoDiscount > 0 ? <div><span>BOGO Discount</span><strong>-{inr(explicitBogoDiscount)}</strong></div> : null}
          <div><span>Discount</span><strong>{manualDiscount > 0 ? `-${inr(manualDiscount)}` : inr(0)}</strong></div>
          <div><span>Delivery Charge</span><strong>{deliveryQuote ? inr(quotedDeliveryCharge) : 'On save'}</strong></div>
          <div className="grand"><span>Grand Total</span><strong>{inr(finalTotal)}</strong></div>
        </div>
      ) : null}
      <button className="full-width staff-place-order" onClick={submitOrderForm} disabled={loading || !cart.length || (!editingOrderId && !permissions.create_orders) || (editingOrderId && !permissions.edit_orders)}>{editingOrderId ? <Save size={18} /> : <CreditCard size={18} />} {loading ? (editingOrderId ? 'Saving...' : 'Creating...') : editingOrderId ? (permissions.edit_orders ? 'Save Edited Order' : 'Edit Disabled') : permissions.create_orders ? 'Place Order' : 'Create Order Disabled'}</button>
    </aside>
  );

  if (!posEnabled) {
    return (
      <main className="staff-login-screen">
        <section className="admin-login-card">
          <span className="eyebrow">Staff POS</span>
          <h1>POS unavailable</h1>
          <p className="small-note">Staff POS is disabled from Admin Feature Controls.</p>
        </section>
      </main>
    );
  }

  if (!staff) {
    return (
      <main className="staff-login-screen">
        <form className="admin-login-card" onSubmit={staffLogin}>
          <span className="eyebrow">Staff POS</span>
          <h1>Staff login</h1>
          {message ? <p className="notice error" role="alert" aria-live="polite">{message}</p> : null}
          <input type="email" placeholder="Email / username" value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} />
          <input type="password" placeholder="Password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} />
          <button>Login to POS</button>
        </form>
      </main>
    );
  }

  return (
    <main className="staff-pos-shell">
      <header className="staff-pos-header">
        <div><strong>The Pizza House POS</strong><span>{new Date().toLocaleString()}</span></div>
        <div className="staff-header-status">
          <span className="badge success">{staff.name}</span>
          <span className="badge warning">{orderType === 'dine_in' ? 'DINE-IN' : orderType === 'delivery' ? 'DELIVERY' : 'TAKEAWAY'}</span>
          <button className="ghost" onClick={() => { clearToken('staff'); setStaff(null); }}><LogOut size={16} /> Logout</button>
        </div>
      </header>
      {message ? <p className="notice error" role="alert" aria-live="polite">{message}</p> : null}
      {createdOrder ? <section className="staff-success-card"><h2>{lastOrderAction === 'updated' ? 'Order Updated Successfully' : 'Order Created Successfully'}</h2><p><strong>{createdOrder.order_number}</strong></p><p>Subtotal: {inr(createdOrder.subtotal)} · Discount: {inr(createdOrder.discount_amount || 0)}{createdOrder.order_type === 'delivery' ? ` · Delivery: ${inr(createdOrder.delivery_charge || 0)}` : ''} · Total: {inr(createdOrder.total_amount)}</p>{createdOrder.discount_description ? <p>{createdOrder.discount_description}</p> : null}{createdOrder.order_type === 'delivery' && createdOrder.delivery_address ? <p>Deliver to: {createdOrder.delivery_address}</p> : null}<p>Payment: {createdOrder.payment_method || createdOrder.payment_mode} · {createdOrder.payment_status}</p><p>Cash: {inr(createdOrder.cash_received || 0)} · Online: {inr(createdOrder.online_received || 0)} · Paid: {inr(createdOrder.paid_amount || 0)} · Remaining: {inr(createdOrder.remaining_amount || 0)} · Change: {inr(createdOrder.change_amount || createdOrder.cash_change || 0)}</p><div className="action-row"><button className="ghost" onClick={() => openInvoice(`/staff/orders/${createdOrder.id}/invoice`)}><Printer size={16} /> Generate / Download Bill</button><button onClick={() => { setCreatedOrder(null); resetOrderForm(); }}>New Order</button></div></section> : null}
      <section className="staff-dashboard-strip">
        {permissions.view_today_orders ? <article className="staff-today-card"><span>Today</span><strong>{staffDashboard.today?.orders || 0}</strong><small>Orders</small></article> : null}
        {permissions.view_current_orders ? (
          <article className="staff-current-orders-panel">
            <div className="staff-section-head"><div><span className="eyebrow">Current Orders</span><h2>Active staff orders</h2></div><button className="ghost" onClick={loadStaffDashboard}>Refresh</button></div>
            <div className="staff-current-order-list">
              {(staffDashboard.current_orders || []).length ? staffDashboard.current_orders.map(order => {
                const next = nextStaffStatuses(order);
                return (
                  <div className="staff-current-order-card" key={order.id}>
                    <div><strong>{order.order_number}</strong><span>{order.customer_name || 'Walk-in customer'} {order.customer_phone ? `· ${order.customer_phone}` : ''}</span></div>
                    <div><span>{order.order_type === 'dine_in' ? 'Dine-in' : order.order_type === 'delivery' ? 'Delivery' : 'Takeaway'} · Staff</span><strong>{inr(order.total_amount)}</strong>{order.order_type === 'delivery' && order.delivery_address ? <small>{order.delivery_address}</small> : null}</div>
                    <div><span>{order.payment_status}</span><small>Paid {inr(order.paid_amount || 0)} · Remaining {inr(order.remaining_amount || 0)}</small></div>
                    <div><span>Status</span><strong>{order.status === 'received' ? 'Created' : order.status === 'accepted' ? 'Confirmed' : order.status === 'delivered' ? 'Completed' : order.status.replaceAll('_', ' ')}</strong></div>
                    <div className="action-row">
                      {next.includes('accepted') && permissions.confirm_orders ? <button className="ghost" onClick={() => updateStaffOrder(order, 'accepted')}>{staffOrderActionLabel('accepted')}</button> : null}
                      {next.includes('ready') && permissions.mark_order_ready_complete ? <button className="ghost" onClick={() => updateStaffOrder(order, 'ready')}>{staffOrderActionLabel('ready')}</button> : null}
                      {next.includes('delivered') && permissions.mark_order_ready_complete ? <button className="ghost" onClick={() => updateStaffOrder(order, 'delivered')}>{staffOrderActionLabel('delivered')}</button> : null}
                      {permissions.edit_orders ? <button className="ghost" onClick={() => editStaffOrder(order)}><Save size={15} /> Edit Order</button> : null}
                      {permissions.cancel_orders && staffCancellable(order) ? <button className="ghost danger" onClick={() => { if (window.confirm(`Cancel ${order.order_number}?`)) updateStaffOrder(order, 'cancelled'); }}><X size={15} /> Cancel</button> : null}
                      {permissions.delete_orders ? <button className="ghost danger" onClick={() => deleteStaffOrder(order)}><Trash2 size={15} /> Delete</button> : null}
                      <button className="ghost" onClick={() => openInvoice(`/staff/orders/${order.id}/invoice`)}><Printer size={15} /> Bill</button>
                    </div>
                  </div>
                );
              }) : <p className="small-note">No active staff orders right now.</p>}
            </div>
          </article>
        ) : null}
      </section>
      {editingOrderId && editingOrder ? <section className="staff-success-card staff-editing-banner"><h2>Editing {editingOrder.order_number}</h2><p>Update products, customer details, order type, delivery address, or payment method. The backend will recalculate totals, stock, coupons, BOGO, delivery charge, and remaining amount when you save. Verified payments stay unchanged; only the remaining balance is recomputed. To change a burger option or pizza size, remove the line and re-add it with the new option.</p><div className="action-row"><button className="ghost" onClick={resetOrderForm}>Cancel Edit</button></div></section> : null}
      <section className="staff-pos-layout">
        <aside className="staff-category-panel">
          <h2>Categories</h2>
          {categoryButtons}
        </aside>
        <section className="staff-menu-panel">
          <div className="staff-menu-toolbar">
            <button className="ghost staff-mobile-category-trigger" onClick={() => setMobileCategoryOpen(true)}><Menu size={18} /> Categories</button>
            <div className="search-box staff-search-box"><Search size={20} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products, categories or descriptions" /></div>
            {suggestions.length ? <div className="staff-search-suggestions">{suggestions.map(({ item, category }) => <button key={item.id} onClick={() => selectSuggestion(item)}><strong>{item.name}</strong><span>{category?.name || 'Menu'} · {inr(staffStartingPrice(item))}</span></button>)}</div> : debouncedSearch ? <div className="staff-search-suggestions muted"><p>No matching items found</p></div> : null}
          </div>
          <div className="staff-feed-heading">
            <div>
              <span className="eyebrow">{activeCategory === 'all' ? 'All Categories' : 'Selected Category'}</span>
              <h1>{activeCategory === 'all' ? 'Counter Menu' : categories.find(category => String(category.id) === String(activeCategory))?.name}</h1>
            </div>
            <span className="badge">{visibleItems.length} products</span>
          </div>
          <div className="staff-product-grid">{visibleItems.map((item, index) => <article id={`staff-product-${item.id}`} className={highlightedProductId === item.id ? 'staff-product-card highlighted' : 'staff-product-card'} key={item.id}><img src={productImage(item, index)} alt="" loading="lazy" /><div className="staff-product-copy"><h3>{item.name}</h3><p>{item.description}</p><strong>From {inr(staffStartingPrice(item))}</strong></div><button onClick={() => add(item)} disabled={Number(item.stock) <= 0}>{Number(item.stock) <= 0 ? 'Sold Out' : 'Add'}</button></article>)}</div>
        </section>
        {cartPanel}
      </section>
      <button className="staff-mobile-cart-bar" onClick={() => setMobileCartOpen(true)}>
        <span>{cartCount} item{cartCount === 1 ? '' : 's'}</span>
        <strong>{inr(finalTotal)}</strong>
        <em>View Cart</em>
      </button>
      {mobileCategoryOpen ? <div className="staff-mobile-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setMobileCategoryOpen(false); }}><aside className="staff-mobile-category-drawer"><div className="staff-drawer-head"><h2>Categories</h2><button className="icon-button" onClick={() => setMobileCategoryOpen(false)}><X size={18} /></button></div>{categoryButtons}</aside></div> : null}
      {mobileCartOpen ? <div className="staff-mobile-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setMobileCartOpen(false); }}><section className="staff-mobile-cart-sheet"><div className="staff-drawer-head"><h2>Checkout</h2><button className="icon-button" onClick={() => setMobileCartOpen(false)}><X size={18} /></button></div>{cartPanel}</section></div> : null}
      <StaffOptionModal key={modalItem ? `staff-product-${modalItem.id}` : 'staff-product-none'} item={modalItem} optionGroups={optionGroups} onClose={() => setModalItem(null)} onAdd={addLine} />
      <StaffBogoModal key={bogoPicker ? `staff-bogo-${bogoPicker.line?.key}-${bogoPicker.offer?.id}` : 'staff-bogo-none'} unlock={bogoPicker} items={items} categories={categories} weekday={activeBogoWeekday} onClose={() => setBogoPicker(null)} onAdd={addLine} />
    </main>
  );
}
