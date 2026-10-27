'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, CreditCard, LogOut, Menu, Minus, Plus, Printer, Save, Search, Trash2, Utensils, X } from 'lucide-react';
import { api, applyTheme, clearToken, inr, openInvoice, productImage, setToken, token, setThemeMode, storedThemeMode } from '../lib';
import { playStaffOrderAlert } from '../order-alert';
import { Toast, useToastMessage } from '../components/ui';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState';
import OptimizedImage from '../components/OptimizedImage';
import { scrollBehavior } from '../motion';
import useDialogFocus from '../components/useDialogFocus';
import { menuDescription } from '../customer-copy.mjs';
import { isPizzaProduct } from '../product-type.mjs';
import StaffBogoPolicyEditor from './StaffBogoPolicyEditor';
import { eligibleManualProducts, isFreeLine, manualFreeRemaining, optionApplies, optionSelections, reconcileManualFreeCart, reconcileStaffBogoCart, staffBogoAllowedFreeSizes, staffBogoCapacity, staffBogoOfferForLine, staffBogoOfferForPair, staffBogoPairAllowed, staffBogoSelectionSignature, staffBogoSizeCode, staffCartPayload, staffOptionPrice as optionPrice } from './staff-cart.mjs';

function StaffOptionModal({ item, optionGroups, onClose, onAdd }) {
  const dialogRef = useDialogFocus(Boolean(item), onClose);
  const variants = useMemo(() => (item?.variants || []).filter(variant => !item?._editLine?.is_manual_free || ['S', 'M', 'L'].includes(variant.name)), [item?.variants, item?._editLine?.is_manual_free]);
  const variantSignature = variants.map(variant => `${variant.id}:${variant.name}:${variant.is_default}`).join('|');
  const firstVariant = variants.find(v => Number(v.is_default) === 1) || variants[0] || null;
  const [variantId, setVariantId] = useState(item?._editLine?.variant_id || firstVariant?.id || null);
  const [selectedOptions, setSelectedOptions] = useState(() => optionSelections(item?._editLine));
  const [quantity, setQuantity] = useState(item?._editLine?.quantity || 1);
  useEffect(() => {
    const selected = variants.find(variant => String(variant.id) === String(item?._editLine?.variant_id)) || variants.find(variant => Number(variant.is_default) === 1) || variants[0];
    setVariantId(selected?.id || null);
    setSelectedOptions(optionSelections(item?._editLine));
    setQuantity(item?._editLine?.quantity || 1);
  // Keep main's choice-reset behavior without discarding edits on price-only refreshes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?._editLine, variantSignature]);
  if (!item) return null;
  const variant = variants.find(v => Number(v.id) === Number(variantId)) || firstVariant;
  const availableOptions = optionGroups.flatMap(group => (group.options || []).map(option => ({ ...option, group_name: group.name }))).filter(option => optionApplies(option, item, variant?.name));
  const optionRows = [...availableOptions, ...(item._editLine?.options || []).filter(option => !availableOptions.some(row => Number(row.id) === Number(option.id))).map(option => ({ ...option, historical_only: true }))];
  const unchangedSelection = item._editLine && String(variant?.id || '') === String(item._editLine.variant_id || '') && JSON.stringify(optionSelections({ option_selections: selectedOptions })) === JSON.stringify(optionSelections(item._editLine));
  const chosen = selectedOptions.map(selection => {
    const option = optionRows.find(row => Number(row.id) === Number(selection.id));
    if (!option) return null;
    const saved = item._editLine?.options?.find(row => Number(row.id) === Number(selection.id));
    return { ...option, quantity: selection.quantity, price: unchangedSelection && saved ? Number(saved.price) : optionPrice(option, variant?.name) };
  }).filter(Boolean);
  const unavailableSelection = !unchangedSelection && chosen.some(option => option.historical_only);
  const unitPrice = unchangedSelection ? Number(item._editLine.price) : effectiveVariantPrice(item, variant) + chosen.reduce((sum, option) => sum + option.price * option.quantity, 0);
  const optionIds = chosen.map(option => Number(option.id)).sort((a, b) => a - b);
  const availableQuantity = Number(item.stock || 0) + Number(item._editLine?.reserved_quantity || 0);

  function toggleOption(id, checked) {
    setSelectedOptions(current => checked ? [...current.filter(value => Number(value.id) !== Number(id)), { id: Number(id), quantity: 1 }] : current.filter(value => Number(value.id) !== Number(id)));
  }

  return (
    <div className="option-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="option-modal" role="dialog" aria-modal="true" aria-labelledby="staff-options-title" tabIndex={-1}>
        <div className="option-modal-header">
          <div><h2 id="staff-options-title">{item.name}</h2>{menuDescription(item.description) ? <p>{menuDescription(item.description)}</p> : null}</div>
          <button className="icon-button" onClick={onClose} aria-label="Close options">×</button>
        </div>
        {item._editLine?.order_item_id ? <p className="small-note">The saved price is retained when the size and toppings are unchanged. Changing either uses current menu prices.</p> : null}
        {variants.length ? <section className="option-section"><h3>Variant / Size</h3><div className="choice-list">{variants.map(v => <label className="choice-row" key={v.id}><input type="radio" checked={Number(variant?.id) === Number(v.id)} onChange={() => { setVariantId(v.id); setSelectedOptions([]); }} /><span>{!isPizzaProduct(item) ? (v.name === 'S' ? 'Standard' : v.name) : v.name === 'S' ? 'Small' : v.name === 'M' ? 'Medium' : v.name === 'L' ? 'Large' : v.name}</span><strong>{inr(effectiveVariantPrice(item, v))}</strong></label>)}</div></section> : null}
        {optionRows.length ? <section className="option-section"><h3>Add Toppings / Add-Ons</h3><p className="small-note">Prices are per pizza. Each cart line has its own selections.</p><div className="choice-list">{optionRows.map(option => {
          const selection = selectedOptions.find(row => Number(row.id) === Number(option.id));
          const saved = item._editLine?.options?.find(row => Number(row.id) === Number(option.id));
          const price = unchangedSelection && saved ? Number(saved.price) : optionPrice(option, variant?.name);
          return <div className="choice-row" key={option.id}><label><input type="checkbox" checked={Boolean(selection)} disabled={option.historical_only && !selection} onChange={e => toggleOption(option.id, e.target.checked)} /> <span>{option.group_name ? `${option.group_name}: ` : ''}{option.name}{option.historical_only ? ' (saved selection, no longer available)' : ''}</span></label><strong>+{inr(price)}</strong>{selection ? <label>Qty <input className="staff-input" style={{ width: '5rem' }} aria-label={`${option.name} quantity per pizza`} type="number" min="1" max="20" value={selection.quantity} onChange={e => setSelectedOptions(current => current.map(row => Number(row.id) === Number(option.id) ? { ...row, quantity: Math.max(1, Math.min(20, Number(e.target.value) || 1)) } : row))} /></label> : null}</div>;
        })}</div>{unavailableSelection ? <p role="alert" className="notice warning">Remove unavailable saved toppings before changing this item.</p> : null}</section> : <p className="small-note">No toppings or add-ons are configured for this product.</p>}
        <div className="option-modal-footer">
          <div className="quantity-control"><button aria-label="Decrease quantity" onClick={() => setQuantity(q => Math.max(1, q - 1))}><Minus size={14} /></button><strong>{quantity}</strong><button aria-label="Increase quantity" disabled={Boolean(item._editLine?.is_manual_free) || quantity >= availableQuantity} onClick={() => setQuantity(q => Math.min(availableQuantity, q + 1))}><Plus size={14} /></button></div>
          <div className="modal-total"><span>{item._editLine?.is_manual_free ? 'Regular price / full discount' : 'Total'}</span><strong>{inr(unitPrice * quantity)}{item._editLine?.is_manual_free ? ' · FREE' : ''}</strong></div>
          <button disabled={unavailableSelection || quantity < 1} onClick={() => onAdd({ ...item, key: item._editLine?.key || `staff:${crypto.randomUUID()}`, order_item_id: item._editLine?.order_item_id, variant_id: variant?.id || null, variant_name: variant?.name || null, option_ids: optionIds, option_selections: chosen.map(option => ({ id: Number(option.id), quantity: option.quantity })), options: chosen, price: unitPrice, quantity })}>{item._editLine ? 'Update Item' : 'Add Item'}</button>
        </div>
      </div>
    </div>
  );
}

function repriceStaffLine(line, freshItems, freshGroups) {
  // Placed-order snapshots stay at the purchased price until their selections change.
  if (line.order_item_id) return line;
  const item = (freshItems || []).find(row => String(row.id) === String(line.id));
  if (!item) return line;
  const variant = (item.variants || []).find(v => String(v.id) === String(line.variant_id)) || (item.variants || []).find(v => Number(v.is_default) === 1) || (item.variants || [])[0] || null;
  const optionsById = new Map((freshGroups || []).flatMap(group => (group.options || []).map(option => [String(option.id), { ...option, group_name: group.name }])));
  const options = optionSelections(line).map(selection => { const option = optionsById.get(String(selection.id)); return option ? { ...option, quantity: selection.quantity } : null; }).filter(Boolean);
  const price = effectiveVariantPrice(item, variant) + options.reduce((sum, option) => sum + optionPrice(option, variant?.name) * option.quantity, 0);
  return { ...line, name: item.name, is_pizza: isPizzaProduct(item), category_name: item.category_name, category_slug: item.category_slug, category_id: item.category_id, stock: item.stock, is_active: item.is_active, variants: item.variants, variant_id: variant?.id || null, variant_name: variant?.name || null, options: options.map(option => ({ ...option, price: optionPrice(option, variant?.name) })), price };
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
  manage_staff_bogo: false,
  apply_free_pizza: false,
  free_pizza_cross_category: false,
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
  if (order.source === 'customer_online') {
    if (order.status === 'received') return ['accepted'];
    if (order.status === 'accepted') return ['preparing'];
    if (order.status === 'preparing') return ['ready'];
    if (order.status === 'ready' && order.order_type !== 'delivery') return ['picked_up'];
    return [];
  }
  if (order.status === 'received') return ['accepted'];
  if (order.status === 'accepted') return ['ready'];
  if (order.status === 'ready') return ['delivered'];
  return [];
}

function staffCancellable(order) {
  return order && !['delivered', 'cancelled'].includes(order.status) && !(order.status === 'picked_up' && ['takeaway', 'dine_in'].includes(order.order_type));
}

function StaffBogoModal({ unlock, items, categories, weekday, onClose, onAdd }) {
  const dialogRef = useDialogFocus(Boolean(unlock), onClose);
  const eligibleItems = useMemo(() => {
    if (!unlock) return [];
    return items.filter(item => (item.variants || []).some(variant => staffBogoPairAllowed(unlock.offer, unlock.line, { ...item, variant_id: variant.id, variant_name: variant.name, price: effectiveVariantPrice(item, variant) }, weekday)));
  }, [items, unlock, weekday]);
  const [categoryId, setCategoryId] = useState('all');
  const [productId, setProductId] = useState('');
  if (!unlock) return null;
  const allowedFreeSizes = staffBogoAllowedFreeSizes(unlock.offer, unlock.line.variant_name, weekday);
  const visibleItems = eligibleItems.filter(item => categoryId === 'all' || String(item.category_id) === String(categoryId));
  const selectedItem = visibleItems.find(item => String(item.id) === String(productId)) || visibleItems[0] || null;
  const eligibleCategories = categories.filter(category => eligibleItems.some(item => Number(item.category_id) === Number(category.id)));
  const eligibleCategoryNames = eligibleCategories.map(category => category.name).join(', ') || 'Configured eligible pizza categories';
  const eligibleProductNames = eligibleItems.slice(0, 6).map(item => item.name).join(', ');

  function addFree(variant) {
    const variantPrice = effectiveVariantPrice(selectedItem, variant);
    if (!selectedItem || !staffBogoPairAllowed(unlock.offer, unlock.line, { ...selectedItem, variant_id: variant.id, variant_name: variant.name, price: variantPrice }, weekday)) return;
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
    <div className="option-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="option-modal bogo-modal" role="dialog" aria-modal="true" aria-labelledby="staff-bogo-title" tabIndex={-1}>
        <div className="option-modal-header">
          <div><span className="eyebrow">BOGO offer</span><h2 id="staff-bogo-title">Choose free pizza</h2><p>{unlock.offer?.staff_always_available ? `Every day, all 7 days: buy Medium, get ${allowedFreeSizes.map(staffSizeLabel).join(' or ')} free.` : unlock.offer?.name || 'Active BOGO'} · Eligible size price must be {inr(unlock.line.price)} or less.</p></div>
          <button className="icon-button" aria-label="Close free pizza selection" onClick={onClose}><X size={18} /></button>
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
          {visibleItems.map(item => <button key={item.id} className={String(selectedItem?.id) === String(item.id) ? 'bogo-product-card active' : 'bogo-product-card'} onClick={() => setProductId(item.id)}><OptimizedImage src={productImage(item)} alt={item.name} width={54} height={54} sizes="54px" /><span>{item.name}</span></button>)}
        </div>
        {selectedItem ? <div className="bogo-size-grid">{(selectedItem.variants || []).filter(variant => ['S', 'M', 'L'].includes(staffBogoSizeCode(variant.name)) && (variant.is_active === undefined || Number(variant.is_active) === 1)).map(variant => {
          const variantPrice = effectiveVariantPrice(selectedItem, variant);
          const disabled = !staffBogoPairAllowed(unlock.offer, unlock.line, { ...selectedItem, variant_id: variant.id, variant_name: variant.name, price: variantPrice }, weekday);
          const reason = !allowedFreeSizes.includes(staffBogoSizeCode(variant.name)) ? 'Not included in this offer' : 'Higher than the paid pizza price';
          return <button key={variant.id} className={disabled ? 'bogo-size-option disabled' : 'bogo-size-option'} disabled={disabled} onClick={() => addFree(variant)}><strong>{staffSizeLabel(variant.name)}</strong><span>{inr(variantPrice)} {disabled ? '' : 'FREE'}</span><small>{disabled ? reason : 'Eligible free size'}</small></button>;
        })}</div> : <p className="notice warning">No eligible pizzas configured.</p>}
      </div>
    </div>
  );
}

function StaffManualFreeModal({ parent, items, categories, crossCategory, onClose, onAdd }) {
  const dialogRef = useDialogFocus(Boolean(parent), onClose);
  const [categoryId, setCategoryId] = useState('all');
  const [productId, setProductId] = useState('');
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);
  if (!parent) return null;
  const eligible = eligibleManualProducts(items, parent, crossCategory);
  const visible = eligible.filter(item => categoryId === 'all' || String(item.category_id) === String(categoryId));
  const selected = visible.find(item => String(item.id) === String(productId)) || visible[0];
  const categoryRows = categories.filter(category => eligible.some(item => Number(item.category_id) === Number(category.id)));
  function addFree(variant) {
    if (!selected || addingRef.current) return;
    addingRef.current = true;
    setAdding(true);
    onAdd({ ...selected, key: `manual:${crypto.randomUUID()}`, variant_id: variant.id, variant_name: variant.name, option_ids: [], option_selections: [], options: [], price: effectiveVariantPrice(selected, variant), quantity: 1, is_manual_free: true, manual_parent_key: parent.key });
  }
  return <div className="option-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="option-modal bogo-modal" role="dialog" aria-modal="true" aria-labelledby="staff-manual-free-title" tabIndex={-1}>
    <div className="option-modal-header"><div><span className="eyebrow">Staff promotion</span><h2 id="staff-manual-free-title">Add Free Pizza</h2><p>For {parent.name} · {staffSizeLabel(parent.variant_name)}. Select the free pizza and its size independently.</p></div><button className="icon-button" aria-label="Close manual free pizza selection" onClick={onClose}><X size={18} /></button></div>
    <p className="small-note">{crossCategory ? 'Your permission allows eligible pizzas from other categories.' : 'Choose an available pizza in the paid pizza’s category.'} One manual free pizza per paid pizza. The regular price is recorded as a full discount.</p>
    {crossCategory ? <div className="bogo-category-strip"><button className={categoryId === 'all' ? 'active' : ''} onClick={() => { setCategoryId('all'); setProductId(''); }}>All eligible</button>{categoryRows.map(category => <button key={category.id} className={String(categoryId) === String(category.id) ? 'active' : ''} onClick={() => { setCategoryId(category.id); setProductId(''); }}>{category.name}</button>)}</div> : null}
    <div className="bogo-product-grid">{visible.map(item => <button key={item.id} className={String(selected?.id) === String(item.id) ? 'bogo-product-card active' : 'bogo-product-card'} onClick={() => setProductId(item.id)}><OptimizedImage src={productImage(item)} alt="" width={54} height={54} sizes="54px" /><span>{item.name}</span></button>)}</div>
    {selected ? <div className="bogo-size-grid">{(selected.variants || []).filter(variant => ['S', 'M', 'L'].includes(variant.name) && (variant.is_active === undefined || Number(variant.is_active) === 1)).map(variant => <button key={variant.id} className="bogo-size-option" disabled={adding} onClick={() => addFree(variant)}><strong>{staffSizeLabel(variant.name)}</strong><span><s>{inr(effectiveVariantPrice(selected, variant))}</s> FREE</span><small>Discount {inr(effectiveVariantPrice(selected, variant))}</small></button>)}</div> : <p className="notice warning" role="status">No active, in-stock pizza with a valid size is available in the permitted categories.</p>}
  </section></div>;
}

export default function StaffPage() {
  const [login, setLogin] = useState({ email: '', password: '' });
  const [staff, setStaff] = useState(null);
  const [permissions, setPermissions] = useState(defaultStaffPermissions);
  const [staffDashboard, setStaffDashboard] = useState({ today: { orders: 0 }, current_orders: [] });
  const [items, setItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState('');
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [categories, setCategories] = useState([]);
  const [optionGroups, setOptionGroups] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [offers, setOffers] = useState([]);
  const [activeBogoOffers, setActiveBogoOffers] = useState([]);
  const [activeBogoWeekday, setActiveBogoWeekday] = useState('');
  const [staffOffersLoading, setStaffOffersLoading] = useState(true);
  const [staffOffersError, setStaffOffersError] = useState('');
  const [bogoPolicyOpen, setBogoPolicyOpen] = useState(false);
  const [bogoPicker, setBogoPicker] = useState(null);
  const [manualFreeParent, setManualFreeParent] = useState(null);
  const [modalItem, setModalItem] = useState(null);
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState(false);
  const categoryDialogRef = useDialogFocus(mobileCategoryOpen, () => setMobileCategoryOpen(false));
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const cartDialogRef = useDialogFocus(mobileCartOpen, () => setMobileCartOpen(false));
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
  const [delivery, setDelivery] = useState({ address: '' });
  const [customerLookup, setCustomerLookup] = useState(null);
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [customerHistoryOpen, setCustomerHistoryOpen] = useState(false);
  const [message, setMessage, messageTone] = useToastMessage();
  const [createdOrder, setCreatedOrder] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [lastOrderAction, setLastOrderAction] = useState('created');
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef('');
  const [posEnabled, setPosEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [themeMode, setStaffThemeMode] = useState('system');
  const [onlineAlerts, setOnlineAlerts] = useState([]);
  const [soundBlocked, setSoundBlocked] = useState(true);
  const seenOnlineOrdersRef = useRef(null);
  const dashboardLoadingRef = useRef(false);
  const soundSettingsRef = useRef({});

  const loadStaffDashboard = useCallback(async () => {
    if (!token('staff') || dashboardLoadingRef.current) return;
    dashboardLoadingRef.current = true;
    try {
      const data = await api('/staff/dashboard');
      setStaffDashboard({ today: data.today || { orders: 0 }, current_orders: (data.current_orders || []).filter(staffCancellable) });
      setDashboardError('');
      setPermissions({ ...defaultStaffPermissions, ...(data.permissions || {}) });
      const eligible = data.online_alerts || [];
      const previous = seenOnlineOrdersRef.current;
      if (previous) {
        const fresh = eligible.filter(order => !previous.has(String(order.id)));
        if (fresh.length) {
          setOnlineAlerts(current => [...current, ...fresh.filter(order => !current.some(row => row.id === order.id))]);
          playStaffOrderAlert(soundSettingsRef.current).then(() => setSoundBlocked(false)).catch(() => setSoundBlocked(true));
        }
      }
      seenOnlineOrdersRef.current = new Set([...(previous || []), ...eligible.map(order => String(order.id))]);
      setOnlineAlerts(current => current.filter(order => eligible.some(row => row.id === order.id)));
    } catch (err) {
      setDashboardError('Your current orders could not be refreshed. Please try again.');
      if (!String(err.message || '').toLowerCase().includes('permission')) setMessage(err.message);
    } finally {
      dashboardLoadingRef.current = false;
      setDashboardLoading(false);
    }
  }, [setMessage]);

  const loadStaffMenu = useCallback(async () => {
    setMenuLoading(true);
    setMenuError('');
    try {
      const menu = await api('/menu');
      setCategories(menu.categories || []);
      setItems(menu.items || menu.products || []);
      setOptionGroups(menu.option_groups || []);
    } catch {
      setMenuError('The counter menu could not be loaded. Your current order has been preserved.');
    } finally {
      setMenuLoading(false);
    }
  }, []);

  const loadStaffOffers = useCallback(async () => {
    if (!token('staff')) return;
    setStaffOffersLoading(true);
    try {
      const data = await api('/staff/offers', { authScope: 'staff' });
      setOffers(data.offers || []);
      setActiveBogoOffers(data.bogo_offers || []);
      setActiveBogoWeekday(data.weekday || '');
      const nextOffers = data.bogo_offers || [];
      const weekday = data.weekday || '';
      setCart(current => reconcileManualFreeCart(reconcileStaffBogoCart(current, line => staffBogoOfferForLine(line, nextOffers, weekday), weekday, (paid, free) => staffBogoOfferForPair(paid, free, nextOffers, weekday))));
      setStaffOffersError('');
      return data;
    } catch {
      setStaffOffersError('Staff BOGO rules could not be refreshed. Retry before choosing a new free pizza.');
      return null;
    } finally {
      setStaffOffersLoading(false);
    }
  }, []);

  async function staffBogoPolicySaved() {
    const data = await loadStaffOffers();
    setMessage(data ? 'Staff BOGO rules saved for future orders. The current cart has been refreshed.' : 'Staff BOGO rules saved. Retry loading the rules before adding a free pizza.', data ? 'success' : 'warning');
  }

  useEffect(() => {
    const mode = storedThemeMode('pizza_house_staff_theme_mode') || 'system';
    setStaffThemeMode(mode);
    applyTheme({}, mode, 'pizza_house_staff_theme_mode');
    if (token('staff')) api('/auth/me', { authScope: 'staff' }).then(data => {
      if (data.user?.role === 'staff') {
        setStaff(data.user);
        setPermissions({ ...defaultStaffPermissions, ...(data.user.permissions || {}) });
        loadStaffDashboard();
        loadStaffOffers();
      }
    }).catch(() => {});
    loadStaffMenu();
    api('/settings').then(settingsResponse => {
      setPosEnabled((settingsResponse.settings?.staff_pos_enabled || '1') === '1');
      soundSettingsRef.current = settingsResponse.settings || {};
    }).catch(err => setMessage(current => current || `Unable to load Staff POS settings: ${err.message}`));
  }, [loadStaffDashboard, loadStaffMenu, loadStaffOffers, setMessage]);

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

  const offerForLine = useCallback(line => staffBogoOfferForLine(line, activeBogoOffers, activeBogoWeekday), [activeBogoOffers, activeBogoWeekday]);
  const offerForPair = useCallback((paid, free) => staffBogoOfferForPair(paid, free, activeBogoOffers, activeBogoWeekday), [activeBogoOffers, activeBogoWeekday]);

  const subtotal = cart.reduce((sum, line) => sum + Number(line.price) * Number(line.quantity), 0);
  const explicitBogoDiscount = cart.filter(line => line.is_bogo_free).reduce((sum, line) => sum + Number(line.price) * Number(line.quantity), 0);
  const manualFreeDiscount = cart.filter(line => line.is_manual_free).reduce((sum, line) => sum + Number(line.price) * Number(line.quantity), 0);
  const cartCount = cart.reduce((sum, line) => sum + Number(line.quantity), 0);
  const bogoUnlocks = useMemo(() => cart
    .filter(line => !isFreeLine(line))
    .map(line => ({ line, offer: offerForLine(line), chosen: cart.filter(row => row.is_bogo_free && row.bogo_parent_key === line.key).reduce((sum, row) => sum + Number(row.quantity), 0) }))
    .filter(unlock => unlock.offer && unlock.chosen < staffBogoCapacity(unlock.offer, unlock.line.quantity)), [cart, offerForLine]);
  const staffMenuFingerprintRef = useRef('');
  const refreshStaffMenu = useCallback(() => {
    const offersRequest = loadStaffOffers();
    api('/settings').then(data => { soundSettingsRef.current = data.settings || {}; }).catch(() => {});
    api('/menu').then(async menu => {
      const freshOffers = await offersRequest;
      const nextWeekday = freshOffers?.weekday || activeBogoWeekday;
      const nextOfferForLine = freshOffers ? line => staffBogoOfferForLine(line, freshOffers.bogo_offers || [], nextWeekday) : offerForLine;
      const nextOfferForPair = freshOffers ? (paid, free) => staffBogoOfferForPair(paid, free, freshOffers.bogo_offers || [], nextWeekday) : offerForPair;
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
        const fresh = menuItems.find(item => String(item.id) === String(current.id));
        return fresh ? { ...fresh, _editLine: current._editLine } : current;
      });
      setCart(current => {
        if (!current.length) return current;
        const next = reconcileManualFreeCart(reconcileStaffBogoCart(current.map(line => repriceStaffLine(line, menuItems, groups)), nextOfferForLine, nextWeekday, nextOfferForPair));
        return JSON.stringify(current) === JSON.stringify(next) ? current : next;
      });
      if (catalogChanged && !editingOrderId) setMessage('Menu updated with the latest saved prices.', 'info');
    }).catch(() => {});
  }, [offerForLine, offerForPair, activeBogoWeekday, editingOrderId, loadStaffOffers, setMessage]);
  const selectedOffer = offers.find(offer => String(offer.id) === String(selectedOfferId));
  const bogoPreview = useMemo(() => {
    if (discountType !== 'bogo' || !selectedOffer) return { amount: 0, freeQty: 0, label: '' };
    const scopedBuyProducts = (selectedOffer.product_ids || []).map(Number);
    const scopedBuyCategories = (selectedOffer.category_ids || []).map(Number);
    const previewMatchesBuy = (line) => {
      if (isFreeLine(line)) return false;
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
    const freeLine = (scopedBuyProducts.length || scopedBuyCategories.length) ? cart.find(previewMatchesBuy) : cart.find(line => !isFreeLine(line) && Number(line.id) === freeId);
    const freeQty = Math.min(freeLine ? Number(freeLine.quantity) : 0, Math.floor(matchingBuyQty / buyQtyNeeded) * getQty);
    return {
      amount: freeLine ? Math.min(subtotal, Number(freeLine.price) * freeQty) : 0,
      freeQty,
      label: freeQty > 0 ? `${freeQty} × ${selectedOffer.free_product_name || freeLine?.name || 'item'} free` : 'Offer requirements not met'
    };
  }, [cart, discountType, selectedOffer, subtotal]);
  const payableSubtotal = Math.max(subtotal - explicitBogoDiscount - manualFreeDiscount, 0);
  const manualDiscount = discountType === 'fixed'
    ? Math.min(Math.max(Number(fixedDiscount || 0), 0), payableSubtotal)
    : discountType === 'percent'
      ? Math.min(payableSubtotal, payableSubtotal * Math.min(Math.max(Number(fixedDiscount || 0), 0), 100) / 100)
    : discountType === 'bogo' ? Math.min(payableSubtotal, bogoPreview.amount) : 0;
  const totalDiscount = manualDiscount + explicitBogoDiscount + manualFreeDiscount;
  const discountedSubtotal = Math.max(subtotal - totalDiscount, 0);
  const quotedDeliveryCharge = orderType === 'delivery' && editingOrder?.order_type === 'delivery' ? Number(editingOrder.delivery_charge || 0) : 0;
  const finalTotal = orderType === 'delivery' ? Math.max(discountedSubtotal + quotedDeliveryCharge, 0) : discountedSubtotal;
  const cashAmount = editingOrderId ? Number(editingOrder?.cash_received || 0) : paymentMethod === 'cash' ? finalTotal : paymentMethod === 'split' ? Number(cashReceived || 0) : 0;
  const onlineAmount = editingOrderId ? Number(editingOrder?.online_received || 0) : paymentMethod === 'online' ? finalTotal : paymentMethod === 'split' ? Number(onlineReceived || 0) : 0;
  const totalReceived = editingOrderId ? Number(editingOrder?.paid_amount || 0) : cashAmount + onlineAmount;
  const change = editingOrderId ? Number(editingOrder?.change_amount ?? editingOrder?.cash_change ?? 0) : Math.max(totalReceived - finalTotal, 0);
  const paidNow = editingOrderId ? totalReceived : Math.min(totalReceived, finalTotal);
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

  async function staffLogin(event) {
    event.preventDefault();
    if (signingIn) return;
    setSigningIn(true);
    setMessage('');
    try {
      const data = await api('/auth/staff-login', { method: 'POST', body: JSON.stringify(login) });
      setToken(data.token, 'staff');
      setStaff(data.user);
      setMessage('Welcome back.', 'success');
      setPermissions({ ...defaultStaffPermissions, ...(data.user.permissions || {}) });
      loadStaffDashboard();
      loadStaffOffers();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSigningIn(false);
    }
  }

  function addLine(line) {
    setCart(current => {
      if (line.is_manual_free) {
        const parent = current.find(row => row.key === line.manual_parent_key && !isFreeLine(row));
        if (!permissions.apply_free_pizza || !parent || manualFreeRemaining(current, parent.key) < 1 || !eligibleManualProducts(items, parent, permissions.free_pizza_cross_category).some(item => Number(item.id) === Number(line.id))) return current;
      }
      if (line._editLine) {
        const old = line._editLine;
        const updated = { ...old, ...line, key: old.key, _editLine: undefined };
        const next = current.map(row => row.key === old.key ? updated : row);
        return reconcileManualFreeCart(reconcileStaffBogoCart(next, offerForLine, activeBogoWeekday, offerForPair));
      }
      // Separate selections stay separate, even for the same pizza and toppings.
      const existing = current.find(row => row.key === line.key);
      const next = existing && line.is_bogo_free
        ? current.map(row => row.key === line.key ? { ...row, quantity: Number(row.quantity) + Number(line.quantity) } : row)
        : existing ? current : [...current, line];
      return reconcileManualFreeCart(reconcileStaffBogoCart(next, offerForLine, activeBogoWeekday, offerForPair));
    });
    setModalItem(null);
    setBogoPicker(null);
    setManualFreeParent(null);
    setMessage(line.name + (line._editLine ? ' updated in' : ' added to') + ' the order.', 'success');
  }

  function qty(key, delta) {
    setCart(current => {
      const target = current.find(line => (line.key || line.id) === key);
      if (!target) return current;
      const maximum = Math.max(Number(target.quantity), Number(target.stock ?? 9999) + Number(target.reserved_quantity || 0));
      const nextQuantity = Math.min(maximum, Number(target.quantity) + delta);
      const next = current.map(line => (line.key || line.id) === key ? { ...line, quantity: nextQuantity } : line).filter(line => line.quantity > 0);
      return reconcileManualFreeCart(reconcileStaffBogoCart(next, offerForLine, activeBogoWeekday, offerForPair));
    });
  }

  function add(item) {
    const variants = item.variants || [];
    if (variants.length > 1 || ['S', 'M', 'L'].includes(variants[0]?.name) || optionGroups.some(group => group.options?.some(option => option.applies_to === 'all'))) {
      setModalItem(item);
      return;
    }
    const variant = variants.find(v => Number(v.is_default) === 1) || variants[0] || null;
    addLine({ ...item, key: `staff:${crypto.randomUUID()}`, variant_id: variant?.id || null, variant_name: variant?.name || null, option_ids: [], options: [], price: effectiveVariantPrice(item, variant), quantity: 1 });
  }

  function resetOrderForm() {
    setCart([]);
    setEditingOrder(null);
    setEditingOrderId(null);
    idempotencyKeyRef.current = '';
    setOrderType('takeaway');
    setDelivery({ address: '' });
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
    setManualFreeParent(null);
    setModalItem(null);
    setMobileCartOpen(false);
  }

  function cartLineFromOrderItem(item) {
    const product = items.find(row => Number(row.id) === Number(item.menu_item_id));
    const optionIds = (item.selection_meta?.options || []).map(option => Number(option.id)).filter(Boolean);
    const key = item.client_key || item.selection_meta?.client_key || `edit:${item.id}`;
    const line = {
      ...(product || {}),
      id: Number(item.menu_item_id),
      key,
      order_item_id: Number(item.id),
      name: item.name_snapshot,
      stock: Number(product?.stock ?? 9999),
      reserved_quantity: Math.max(1, Number(item.quantity || 1)),
      variant_id: item.variant_id || null,
      variant_name: item.variant_snapshot || null,
      option_ids: optionIds,
      option_selections: optionSelections({ options: item.selection_meta?.options || [] }),
      options: item.selection_meta?.options || [],
      price: Number(item.unit_price || 0),
      quantity: Math.max(1, Number(item.quantity || 1)),
      is_bogo_free: Boolean(item.is_bogo_free),
      bogo_parent_key: item.bogo_parent_key || '',
      is_manual_free: Boolean(item.is_manual_free || item.selection_meta?.manual_free),
      manual_parent_key: item.manual_parent_key || item.selection_meta?.manual_free?.parent_key || ''
    };
    return { ...line, saved_bogo_signature: staffBogoSelectionSignature(line) };
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
      const editPaidLines = mappedLines.filter(line => !isFreeLine(line));
      const editUsedFree = new Map();
      setCart(mappedLines.map(line => {
        if (!line.is_bogo_free) return line;
        const canPair = paid => {
          const offer = offerForPair(paid, line);
          if (!offer) return false;
          return (editUsedFree.get(paid.key) || 0) + Number(line.quantity) <= staffBogoCapacity(offer, paid.quantity);
        };
        const fallback = editPaidLines.find(paid => paid.key === line.bogo_parent_key && canPair(paid)) || editPaidLines.find(canPair);
        if (!fallback) return line;
        editUsedFree.set(fallback.key, (editUsedFree.get(fallback.key) || 0) + Number(line.quantity));
        return { ...line, bogo_parent_key: fallback.key };
      }));
      setCustomer({ name: data.order.customer_name || '', phone: data.order.customer_phone || '', email: data.order.customer_email || '' });
      setOrderType(['takeaway', 'delivery', 'dine_in'].includes(data.order.order_type) ? data.order.order_type : 'takeaway');
      setDelivery({ address: data.order.delivery_address || '' });
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
      setMessage(`Editing ${data.order.order_number}. Add, remove, or adjust items, then save changes.`, 'info');
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
        ...(orderType === 'delivery' ? { delivery_address: delivery.address } : {}),
        payment_method: paymentMethod,
        cash_received: paymentMethod === 'split' ? cashReceived : undefined,
        online_received: paymentMethod === 'split' ? onlineReceived : undefined,
        items: cart.map(staffCartPayload)
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
      setMessage(`Order ${data.order.order_number} updated successfully. Total ${inr(data.order.total_amount)} · Paid ${inr(data.order.paid_amount || 0)} · Remaining ${inr(data.order.remaining_amount || 0)}.`, 'success');
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
    document.querySelector('.staff-menu-panel')?.scrollTo({ top: 0, behavior: scrollBehavior() });
  }

  function selectSuggestion(item) {
    setActiveCategory(item.category_id);
    setSearch(item.name);
    setDebouncedSearch(item.name);
    setHighlightedProductId(item.id);
    setTimeout(() => {
      document.getElementById(`staff-product-${item.id}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
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
    }
    if (cashAmount < 0 || onlineAmount < 0 || Number.isNaN(cashAmount) || Number.isNaN(onlineAmount)) return setMessage('Enter valid payment amounts.');
    if (discountType === 'fixed' && Number(fixedDiscount || 0) > payableSubtotal) return setMessage('Discount cannot exceed the subtotal remaining after free-pizza discounts.');
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
        ...(orderType === 'delivery' ? { delivery_address: delivery.address } : {}),
        payment_method: paymentMethod,
        items: cart.map(staffCartPayload),
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
      if (data.duplicate) setMessage(`Order ${data.order.order_number} was already created. Retry detected — no duplicate order was made.`, 'info');
      else setMessage(`Order ${data.order.order_number} created successfully.`, 'success');
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
      setMessage(`Order ${order.order_number} updated.`, 'success');
      if (['cancelled', 'delivered'].includes(status) || (status === 'picked_up' && ['takeaway', 'dine_in'].includes(order.order_type))) {
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
      setMessage(`Order ${order.order_number} deleted.`, 'success');
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
          {category.image_url ? <OptimizedImage src={productImage(category)} alt="" width={34} height={34} sizes="34px" /> : <Utensils size={20} />}
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
          <label>Delivery address, landmark and additional details<textarea className="staff-input staff-textarea" placeholder="Full delivery address, landmark or additional details" maxLength={4000} value={delivery.address} onChange={e => setDelivery({ ...delivery, address: e.target.value })} /></label>

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
          <div className={isFreeLine(line) ? 'staff-cart-line free-cart-line' : 'staff-cart-line'} key={line.key || line.id}>
            <div>
              <strong>{line.name} {isFreeLine(line) ? <span className="bogo-free-badge">FREE</span> : null}</strong>
              {line.variant_name ? <p>{staffSizeLabel(line.variant_name)}{line.is_manual_free ? ' · Staff promotion' : line.is_bogo_free ? ' · Automatic BOGO' : ''}</p> : null}
              {line.options?.length ? <ul className="small-note">{line.options.map(option => <li key={option.id}>{option.name} × {Number(option.quantity || 1)} · +{inr(Number(option.price || 0) * Number(option.quantity || 1))} per pizza</li>)}</ul> : null}
              {isFreeLine(line) ? <p className="small-note">Regular {inr(Number(line.price) * Number(line.quantity))} · Discount −{inr(Number(line.price) * Number(line.quantity))} · Payable {inr(0)}</p> : null}
            </div>
            <div className="staff-cart-actions">
              <div className="quantity-control small"><button aria-label={`Decrease ${line.name} quantity`} onClick={() => qty(line.key || line.id, -1)}><Minus size={14} /></button><strong>{line.quantity}</strong><button aria-label={`Increase ${line.name} quantity`} onClick={() => qty(line.key || line.id, 1)} disabled={isFreeLine(line)}><Plus size={14} /></button></div>
              <strong>{isFreeLine(line) ? 'FREE' : inr(Number(line.price) * Number(line.quantity))}</strong>
              {!line.is_bogo_free ? <button className="ghost" onClick={() => { const product = items.find(item => Number(item.id) === Number(line.id)); if (product) setModalItem({ ...product, _editLine: line }); }}>Add Toppings / Add-Ons · Edit</button> : null}
              {permissions.apply_free_pizza && !isFreeLine(line) && ['S', 'M', 'L'].includes(line.variant_name) ? <button className="ghost" disabled={manualFreeRemaining(cart, line.key) < 1} onClick={() => setManualFreeParent(line)}>{manualFreeRemaining(cart, line.key) > 0 ? 'Add Free Pizza' : 'Manual free pizza added'}</button> : null}
              <button className="icon-button tiny" onClick={() => qty(line.key || line.id, -line.quantity)} aria-label={`Remove ${line.name}`}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      <section className="staff-payment-section" aria-labelledby="staff-bogo-heading">
        <div className="staff-discount-head"><div><span className="eyebrow">Staff promotion</span><strong id="staff-bogo-heading">Staff BOGO rules</strong></div>{permissions.manage_staff_bogo ? <button type="button" className="ghost" onClick={() => setBogoPolicyOpen(true)}>Manage Staff BOGO rules</button> : null}</div>
        {staffOffersLoading ? <p className="small-note" role="status">Refreshing Staff BOGO rules…</p> : null}
        {staffOffersError ? <div className="notice warning" role="alert"><p>{staffOffersError}</p><button type="button" className="ghost" disabled={staffOffersLoading} onClick={loadStaffOffers}>Retry Staff BOGO rules</button></div> : null}
        {!staffOffersLoading && !staffOffersError && !activeBogoOffers.some(offer => offer.staff_always_available) ? <div className="notice warning" role="status"><p>Staff BOGO rules are unavailable. Retry loading the saved rules.</p><button type="button" className="ghost" onClick={loadStaffOffers}>Retry Staff BOGO rules</button></div> : null}
        {bogoUnlocks.length ? <div className="bogo-unlock-list">{bogoUnlocks.map(unlock => <div className="bogo-unlock-card" key={unlock.line.key}><div><strong>Free pizza unlocked</strong><span>{unlock.offer.staff_always_available ? `Every day · ${staffBogoAllowedFreeSizes(unlock.offer, unlock.line.variant_name, activeBogoWeekday).map(staffSizeLabel).join(' or ')}` : 'Choose 1 pizza'} up to {inr(unlock.line.price)}</span></div><button type="button" className="ghost" disabled={Boolean(staffOffersError)} onClick={() => setBogoPicker(unlock)}>Choose Free Pizza</button></div>)}</div> : null}
      </section>

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
              <option value="bogo">Scheduled BOGO offer</option>
            </select>
            {['fixed', 'percent'].includes(discountType) ? (
              <>
                <input className="staff-input" type="number" min="0" max={discountType === 'percent' ? 100 : payableSubtotal} step="0.01" placeholder={discountType === 'percent' ? 'Discount percent' : 'Discount amount'} value={fixedDiscount} onChange={e => setFixedDiscount(e.target.value)} />
                <input className="staff-input" placeholder="Reason / note optional" value={discountReason} onChange={e => setDiscountReason(e.target.value)} />
                {discountType === 'percent' ? <p className="small-note">Calculated discount: {inr(manualDiscount)}</p> : null}
              </>
            ) : null}
            {discountType === 'bogo' ? (
              <>
                <p className="small-note">These are scheduled offers. The everyday Staff BOGO rules and free-pizza choices are shown above.</p>
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
            <strong>{inr(editingOrderId ? cashAmount : finalTotal)}</strong>
            <small>{editingOrderId ? `Recorded cash · ${inr(remaining)} Remaining after edit` : `Paid · ${inr(0)} Remaining`}</small>
          </div>
        ) : null}
        {paymentMethod === 'online' ? (
          <div className="staff-auto-payment-card">
            <span>Online</span>
            <strong>{inr(editingOrderId ? onlineAmount : finalTotal)}</strong>
            <small>{editingOrderId ? `Recorded online · ${inr(remaining)} Remaining after edit` : `Counter digital payment · ${inr(0)} Remaining`}</small>
          </div>
        ) : null}
        {paymentMethod === 'split' ? (
          <>
            <input className="staff-input" type="number" min="0" step="0.01" aria-label="Cash received" placeholder="Cash received" value={cashReceived} disabled={editingOrderId != null} onChange={e => setCashReceived(e.target.value)} />
            <input className="staff-input" type="number" min="0" step="0.01" aria-label="Online received" placeholder="Online received" value={onlineReceived} disabled={editingOrderId != null} onChange={e => setOnlineReceived(e.target.value)} />
            <p className="small-note">Only split payment uses manual amounts. Counter online means UPI/card/bank app collected at the counter.{editingOrderId != null ? ' Recorded received amounts stay unchanged while editing; only the remaining balance is recomputed.' : ''}</p>
          </>
        ) : null}
      </div>

      {paymentMethod === 'split' ? (
        <div className="payment-breakdown staff-payment-breakdown">
          <div><span>Subtotal</span><strong>{inr(subtotal)}</strong></div>
          {explicitBogoDiscount > 0 ? <div><span>BOGO Discount</span><strong>-{inr(explicitBogoDiscount)}</strong></div> : null}
          {manualFreeDiscount > 0 ? <div><span>Staff Free Pizza Discount</span><strong>-{inr(manualFreeDiscount)}</strong></div> : null}
          <div><span>Discount</span><strong>{manualDiscount > 0 ? `-${inr(manualDiscount)}` : inr(0)}</strong></div>
          {quotedDeliveryCharge > 0 ? <div><span>Recorded delivery charge</span><strong>{inr(quotedDeliveryCharge)}</strong></div> : null}
          <div className="grand"><span>Grand Total</span><strong>{inr(finalTotal)}</strong></div>
          <div><span>Total Received</span><strong>{inr(totalReceived)}</strong></div>
          <div><span>Paid</span><strong>{inr(paidNow)}</strong></div>
          <div><span>Remaining</span><strong>{inr(remaining)}</strong></div>
          <div><span>Change</span><strong>{inr(change)}</strong></div>
        </div>
      ) : null}
      {paymentMethod !== 'split' && (editingOrderId || orderType === 'delivery' || explicitBogoDiscount > 0 || manualFreeDiscount > 0 || manualDiscount > 0) ? (
        <div className="payment-breakdown staff-payment-breakdown">
          <div><span>Subtotal</span><strong>{inr(subtotal)}</strong></div>
          {explicitBogoDiscount > 0 ? <div><span>BOGO Discount</span><strong>-{inr(explicitBogoDiscount)}</strong></div> : null}
          {manualFreeDiscount > 0 ? <div><span>Staff Free Pizza Discount</span><strong>-{inr(manualFreeDiscount)}</strong></div> : null}
          <div><span>Discount</span><strong>{manualDiscount > 0 ? `-${inr(manualDiscount)}` : inr(0)}</strong></div>
          {quotedDeliveryCharge > 0 ? <div><span>Recorded delivery charge</span><strong>{inr(quotedDeliveryCharge)}</strong></div> : null}
          <div className="grand"><span>Grand Total</span><strong>{inr(finalTotal)}</strong></div>
          {editingOrderId ? <><div><span>Previously Paid</span><strong>{inr(totalReceived)}</strong></div><div><span>Remaining after edit</span><strong>{inr(remaining)}</strong></div></> : null}
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
          {message ? <Toast tone={messageTone} onDismiss={() => setMessage('')}>{message}</Toast> : null}
          <input aria-label="Staff email" type="email" autoComplete="username" placeholder="Email / username" value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} />
          <input aria-label="Password" type="password" autoComplete="current-password" placeholder="Password" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} />
          <button disabled={signingIn}>{signingIn ? 'Signing in…' : 'Login to POS'}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="staff-pos-shell">
      <header className="staff-pos-header">
        <div><strong>The Pizza House POS</strong><span>{new Date().toLocaleString()}</span></div>
        <div className="staff-header-status">
          <select aria-label="Staff theme" value={themeMode} onChange={e => { setStaffThemeMode(e.target.value); setThemeMode(e.target.value, 'pizza_house_staff_theme_mode'); }}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select>
          <button className="ghost" onClick={() => playStaffOrderAlert(soundSettingsRef.current, true).then(() => setSoundBlocked(false)).catch(() => setSoundBlocked(true))}>{soundBlocked ? 'Enable alert sound' : 'Test alert sound'}</button>
          <span className="badge success">{staff.name}</span>
          <span className="badge warning">{orderType === 'dine_in' ? 'DINE-IN' : orderType === 'delivery' ? 'DELIVERY' : 'TAKEAWAY'}</span>
          <button className="ghost" onClick={() => { clearToken('staff'); setStaff(null); setOffers([]); setActiveBogoOffers([]); setActiveBogoWeekday(''); seenOnlineOrdersRef.current = null; setOnlineAlerts([]); }}><LogOut size={16} /> Logout</button>
        </div>
      </header>
      {onlineAlerts.length ? <section className="notice success"><div role="status" aria-live="polite" aria-atomic="true"><strong>New online customer orders</strong><p>{onlineAlerts.map(order => order.order_number).join(', ')}</p></div><button className="ghost" onClick={() => { setOnlineAlerts([]); document.getElementById('staff-current-orders')?.scrollIntoView({ behavior: scrollBehavior() }); }}>View orders</button></section> : null}
      {message ? <Toast tone={messageTone} onDismiss={() => setMessage('')}>{message}</Toast> : null}
      {createdOrder ? <section className="staff-success-card"><h2>{lastOrderAction === 'updated' ? 'Order Updated Successfully' : 'Order Created Successfully'}</h2><p><strong>{createdOrder.order_number}</strong></p><p>Subtotal: {inr(createdOrder.subtotal)} · Discount: {inr(createdOrder.discount_amount || 0)}{createdOrder.order_type === 'delivery' ? ` · Delivery: ${inr(createdOrder.delivery_charge || 0)}` : ''} · Total: {inr(createdOrder.total_amount)}</p>{createdOrder.discount_description ? <p>{createdOrder.discount_description}</p> : null}{createdOrder.order_type === 'delivery' && createdOrder.delivery_address ? <p>Deliver to: {createdOrder.delivery_address}</p> : null}<p>Payment: {createdOrder.payment_method || createdOrder.payment_mode} · {createdOrder.payment_status}</p><p>Cash: {inr(createdOrder.cash_received || 0)} · Online: {inr(createdOrder.online_received || 0)} · Paid: {inr(createdOrder.paid_amount || 0)} · Remaining: {inr(createdOrder.remaining_amount || 0)} · Change: {inr(createdOrder.change_amount || createdOrder.cash_change || 0)}</p><div className="action-row"><button className="ghost" onClick={() => openInvoice(`/staff/orders/${createdOrder.id}/invoice`)}><Printer size={16} /> Generate / Download Bill</button><button onClick={() => { setCreatedOrder(null); resetOrderForm(); }}>New Order</button></div></section> : null}
      <section className="staff-dashboard-strip">
        {permissions.view_today_orders ? <article className="staff-today-card"><span>Today</span><strong>{staffDashboard.today?.orders || 0}</strong><small>Orders</small></article> : null}
        {permissions.view_current_orders ? (
          <article id="staff-current-orders" className="staff-current-orders-panel">
            <div className="staff-section-head"><div><span className="eyebrow">Current Orders</span><h2>Active orders</h2></div><button className="ghost" onClick={loadStaffDashboard}>Refresh</button></div>
            {dashboardLoading ? <LoadingState label="Loading current orders…" rows={3} /> : null}
            {dashboardError ? <ErrorState title="Current orders are unavailable" message={dashboardError} onRetry={loadStaffDashboard} /> : null}
            <div className="staff-current-order-list">
              {(staffDashboard.current_orders || []).length ? staffDashboard.current_orders.map(order => {
                const next = nextStaffStatuses(order);
                return (
                  <div className="staff-current-order-card" key={order.id}>
                    <div><strong>{order.order_number}</strong><span>{order.customer_name || 'Walk-in customer'} {order.customer_phone ? `· ${order.customer_phone}` : ''}</span></div>
                    <div><span>{order.order_type === 'dine_in' ? 'Dine-in' : order.order_type === 'delivery' ? 'Delivery' : 'Takeaway'} · {order.source === 'customer_online' ? 'Online customer' : 'Staff'}</span><strong>{inr(order.total_amount)}</strong>{order.order_type === 'delivery' && order.delivery_address ? <small>{order.delivery_address}</small> : null}</div>
                    <div><span>{order.payment_status}</span><small>Paid {inr(order.paid_amount || 0)} · Remaining {inr(order.remaining_amount || 0)}</small></div>
                    <div><span>Status</span><strong>{order.status === 'received' ? 'Created' : order.status === 'accepted' ? 'Confirmed' : order.status === 'delivered' ? 'Completed' : order.status.replaceAll('_', ' ')}</strong></div>
                    <div className="action-row">
                      {next.includes('accepted') && permissions.confirm_orders ? <button className="ghost" onClick={() => updateStaffOrder(order, 'accepted')}>{staffOrderActionLabel('accepted')}</button> : null}
                      {next.includes('ready') && permissions.mark_order_ready_complete ? <button className="ghost" onClick={() => updateStaffOrder(order, 'ready')}>{staffOrderActionLabel('ready')}</button> : null}
                      {next.includes('preparing') && permissions.mark_order_ready_complete ? <button className="ghost" onClick={() => updateStaffOrder(order, 'preparing')}>Start preparing</button> : null}
                      {next.includes('picked_up') && permissions.mark_order_ready_complete ? <button className="ghost" onClick={() => updateStaffOrder(order, 'picked_up')}>Picked up</button> : null}
                      {next.includes('delivered') && permissions.mark_order_ready_complete ? <button className="ghost" onClick={() => updateStaffOrder(order, 'delivered')}>{staffOrderActionLabel('delivered')}</button> : null}
                      {permissions.edit_orders && order.source === 'staff_offline' ? <button className="ghost" onClick={() => editStaffOrder(order)}><Save size={15} /> Edit Order</button> : null}
                      {permissions.cancel_orders && staffCancellable(order) ? <button className="ghost danger" onClick={() => { if (window.confirm(`Cancel ${order.order_number}?`)) updateStaffOrder(order, 'cancelled'); }}><X size={15} /> Cancel</button> : null}
                      {permissions.delete_orders && order.source === 'staff_offline' ? <button className="ghost danger" onClick={() => deleteStaffOrder(order)}><Trash2 size={15} /> Delete</button> : null}
                      <button className="ghost" onClick={() => openInvoice(`/staff/orders/${order.id}/invoice`)}><Printer size={15} /> Bill</button>
                    </div>
                  </div>
                );
              }) : !dashboardLoading && !dashboardError ? <p className="small-note" role="status">No active staff orders right now.</p> : null}
            </div>
          </article>
        ) : null}
      </section>
      {editingOrderId && editingOrder ? <section className="staff-success-card staff-editing-banner"><h2>Editing {editingOrder.order_number}</h2><p>Update products, customer details, order type, delivery address, or payment method. The backend will recalculate totals, stock, coupons, BOGO, delivery charge, and remaining amount when you save. Verified payments stay unchanged; only the remaining balance is recomputed. Use the item edit control to change a size or toppings without adding another order line.</p><div className="action-row"><button className="ghost" onClick={resetOrderForm}>Cancel Edit</button></div></section> : null}
      <section className="staff-pos-layout">
        <aside className="staff-category-panel">
          <h2>Categories</h2>
          {categoryButtons}
        </aside>
        <section className="staff-menu-panel">
          <div className="staff-menu-toolbar">
            <button className="ghost staff-mobile-category-trigger" onClick={() => setMobileCategoryOpen(true)}><Menu size={18} /> Categories</button>
            <div className="search-box staff-search-box"><Search size={20} /><input aria-label="Search counter menu" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products, categories or descriptions" /></div>
            {suggestions.length ? <div className="staff-search-suggestions">{suggestions.map(({ item, category }) => <button key={item.id} onClick={() => selectSuggestion(item)}><strong>{item.name}</strong><span>{category?.name || 'Menu'} · {inr(staffStartingPrice(item))}</span></button>)}</div> : debouncedSearch ? <div className="staff-search-suggestions muted"><p>No matching items found</p></div> : null}
          </div>
          <div className="staff-feed-heading">
            <div>
              <span className="eyebrow">{activeCategory === 'all' ? 'All Categories' : 'Selected Category'}</span>
              <h1>{activeCategory === 'all' ? 'Counter Menu' : categories.find(category => String(category.id) === String(activeCategory))?.name}</h1>
            </div>
            <span className="badge">{visibleItems.length} products</span>
          </div>
          {menuLoading ? <LoadingState label="Loading counter menu…" cards={2} rows={3} /> : menuError ? <ErrorState title="Counter menu is unavailable" message={menuError} onRetry={loadStaffMenu} /> : !visibleItems.length ? <EmptyState title={search ? "No matching products" : "No products available"} message={search ? "Try a different search or choose another category." : "Ask an administrator to add active menu products."}>{search || activeCategory !== "all" ? <button className="ghost" onClick={() => { setSearch(""); setActiveCategory("all"); }}>Show all products</button> : null}</EmptyState> : null}
          <div className="staff-product-grid" style={menuLoading || menuError ? { display: "none" } : undefined}>{visibleItems.map((item, index) => <article id={`staff-product-${item.id}`} className={highlightedProductId === item.id ? 'staff-product-card highlighted' : 'staff-product-card'} key={item.id}><OptimizedImage src={productImage(item, index)} alt={item.name} width={480} height={320} sizes="(max-width: 600px) 44vw, 240px" /><div className="staff-product-copy"><h3>{item.name}</h3><p>{item.description}</p><strong>From {inr(staffStartingPrice(item))}</strong></div><button onClick={() => add(item)} disabled={Number(item.stock) <= 0}>{Number(item.stock) <= 0 ? 'Sold Out' : 'Add'}</button></article>)}</div>
        </section>
        {cartPanel}
      </section>
      <button className="staff-mobile-cart-bar" onClick={() => setMobileCartOpen(true)}>
        <span>{cartCount} item{cartCount === 1 ? '' : 's'}</span>
        <strong>{inr(finalTotal)}</strong>
        <em>View Cart</em>
      </button>
      {mobileCategoryOpen ? <div className="staff-mobile-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setMobileCategoryOpen(false); }}><aside ref={categoryDialogRef} className="staff-mobile-category-drawer" role="dialog" aria-modal="true" aria-label="Menu categories" tabIndex={-1}><div className="staff-drawer-head"><h2>Categories</h2><button className="icon-button" aria-label="Close categories" onClick={() => setMobileCategoryOpen(false)}><X size={18} /></button></div>{categoryButtons}</aside></div> : null}
      {mobileCartOpen ? <div className="staff-mobile-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setMobileCartOpen(false); }}><section ref={cartDialogRef} className="staff-mobile-cart-sheet" role="dialog" aria-modal="true" aria-labelledby="staff-cart-title" tabIndex={-1}><div className="staff-drawer-head"><h2 id="staff-cart-title">Checkout</h2><button className="icon-button" aria-label="Close checkout" onClick={() => setMobileCartOpen(false)}><X size={18} /></button></div>{cartPanel}</section></div> : null}
      <StaffOptionModal key={modalItem ? `staff-product-${modalItem.id}` : 'staff-product-none'} item={modalItem} optionGroups={optionGroups} onClose={() => setModalItem(null)} onAdd={addLine} />
      <StaffManualFreeModal key={manualFreeParent?.key || 'manual-free-closed'} parent={manualFreeParent} items={items} categories={categories} crossCategory={permissions.free_pizza_cross_category} onClose={() => setManualFreeParent(null)} onAdd={addLine} />
      <StaffBogoModal key={bogoPicker ? `staff-bogo-${bogoPicker.line?.key}-${bogoPicker.offer?.id}` : 'staff-bogo-none'} unlock={bogoPicker} items={items} categories={categories} weekday={activeBogoWeekday} onClose={() => setBogoPicker(null)} onAdd={addLine} />
      {bogoPolicyOpen ? <StaffBogoPolicyEditor items={items} categories={categories} onClose={() => setBogoPolicyOpen(false)} onSaved={staffBogoPolicySaved} /> : null}
    </main>
  );
}
