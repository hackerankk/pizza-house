'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, CreditCard, LogOut, Menu, Minus, Plus, Printer, Search, Trash2, Utensils, X } from 'lucide-react';
import { api, clearToken, inr, openInvoice, productImage, setToken, token } from '../lib';

function optionPrice(option, variantName) {
  if (variantName === 'S') return Number(option.small_price || option.fixed_price || 0);
  if (variantName === 'M') return Number(option.medium_price || option.fixed_price || 0);
  if (variantName === 'L') return Number(option.large_price || option.fixed_price || 0);
  return Number(option.fixed_price || option.small_price || 0);
}

function StaffOptionModal({ item, optionGroups, onClose, onAdd }) {
  const variants = item?.variants || [];
  const firstVariant = variants.find(v => Number(v.is_default) === 1) || variants[0] || null;
  const [variantId, setVariantId] = useState(firstVariant?.id || null);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [quantity, setQuantity] = useState(1);
  if (!item) return null;
  const variant = variants.find(v => Number(v.id) === Number(variantId)) || firstVariant;
  const isPizza = ['S', 'M', 'L'].includes(variant?.name);
  const allowedGroups = isPizza ? optionGroups : optionGroups.filter(group => !group.name?.toLowerCase().includes('crust') && !group.name?.toLowerCase().includes('topping'));
  const optionRows = allowedGroups.flatMap(group => (group.options || []).map(option => ({ ...option, group_name: group.name })));
  const chosen = optionRows.filter(option => selectedOptions.includes(Number(option.id)));
  const unitPrice = Number(variant?.price ?? item.price) + chosen.reduce((sum, option) => sum + optionPrice(option, variant?.name), 0);
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
        {variants.length ? <section className="option-section"><h3>Variant / Size</h3><div className="choice-list">{variants.map(v => <label className="choice-row" key={v.id}><input type="radio" checked={Number(variant?.id) === Number(v.id)} onChange={() => { setVariantId(v.id); setSelectedOptions([]); }} /><span>{v.name === 'S' ? 'Small' : v.name === 'M' ? 'Medium' : v.name === 'L' ? 'Large' : v.name}</span><strong>{inr(v.price)}</strong></label>)}</div></section> : null}
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

function staffSizeLabel(name) {
  if (name === 'S') return 'Small';
  if (name === 'M') return 'Medium';
  if (name === 'L') return 'Large';
  return name || 'Regular';
}

function StaffBogoModal({ unlock, items, categories, onClose, onAdd }) {
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
  const visibleItems = eligibleItems.filter(item => categoryId === 'all' || String(item.category_id) === String(categoryId));
  const selectedItem = visibleItems.find(item => String(item.id) === String(productId)) || visibleItems[0] || null;
  const eligibleCategories = categories.filter(category => eligibleItems.some(item => Number(item.category_id) === Number(category.id)));
  const eligibleCategoryNames = eligibleCategories.map(category => category.name).join(', ') || 'Configured eligible pizza categories';
  const eligibleProductNames = eligibleItems.slice(0, 6).map(item => item.name).join(', ');

  function addFree(variant) {
    if (!selectedItem || Number(variant.price) > Number(unlock.line.price)) return;
    onAdd({
      ...selectedItem,
      key: `bogo:${unlock.line.key}:${selectedItem.id}:${variant.id}`,
      variant_id: variant.id,
      variant_name: variant.name,
      option_ids: [],
      options: [],
      price: Number(variant.price),
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
          const disabled = Number(variant.price) > Number(unlock.line.price);
          return <button key={variant.id} className={disabled ? 'bogo-size-option disabled' : 'bogo-size-option'} disabled={disabled} onClick={() => addFree(variant)}><strong>{staffSizeLabel(variant.name)}</strong><span>{inr(variant.price)} {disabled ? '' : 'FREE'}</span><small>{disabled ? 'Not eligible: higher than paid pizza' : 'Eligible free size'}</small></button>;
        })}</div> : <p className="notice warning">No eligible pizzas configured.</p>}
      </div>
    </div>
  );
}

export default function StaffPage() {
  const [login, setLogin] = useState({ email: '', password: '' });
  const [staff, setStaff] = useState(null);
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
  const [orderType, setOrderType] = useState('dine_in');
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
  const [message, setMessage] = useState('');
  const [createdOrder, setCreatedOrder] = useState(null);
  const [posEnabled, setPosEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token()) api('/auth/me').then(data => {
      if (data.user?.role === 'staff') {
        setStaff(data.user);
        api('/staff/offers').then(offerData => setOffers(offerData.offers || [])).catch(() => {});
      }
    }).catch(() => {});
    Promise.all([api('/menu'), api('/settings'), api('/offers/active-bogo')]).then(([menu, settingsResponse, bogo]) => {
      setCategories(menu.categories || []);
      setItems(menu.items || []);
      setOptionGroups(menu.option_groups || []);
      setPosEnabled((settingsResponse.settings?.staff_pos_enabled || '1') === '1');
      setActiveBogoOffers(bogo.offers || []);
      setActiveBogoWeekday(bogo.weekday || '');
    }).catch(err => setMessage(err.message));
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => clearTimeout(handle);
  }, [search]);

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
    .filter(unlock => unlock.offer && unlock.chosen < Number(unlock.line.quantity)), [cart, offerForLine]);
  const selectedOffer = offers.find(offer => String(offer.id) === String(selectedOfferId));
  const bogoPreview = useMemo(() => {
    if (discountType !== 'bogo' || !selectedOffer) return { amount: 0, freeQty: 0, label: '' };
    const buyId = Number(selectedOffer.buy_product_id || (selectedOffer.scope === 'item' ? selectedOffer.scope_id : 0));
    const freeId = Number(selectedOffer.free_product_id || (selectedOffer.scope === 'item' ? selectedOffer.scope_id : buyId));
    const buyQtyNeeded = Math.max(1, Number(selectedOffer.buy_qty || 1));
    const getQty = Math.max(1, Number(selectedOffer.get_qty || 1));
    const matchingBuyQty = cart.filter(line => buyId ? Number(line.id) === buyId : Number(line.category_id) === Number(selectedOffer.scope_id)).reduce((sum, line) => sum + Number(line.quantity), 0);
    const freeLine = cart.find(line => Number(line.id) === freeId);
    const freeQty = Math.min(freeLine ? Number(freeLine.quantity) : 0, Math.floor(matchingBuyQty / buyQtyNeeded) * getQty);
    return {
      amount: freeLine ? Math.min(subtotal, Number(freeLine.price) * freeQty) : 0,
      freeQty,
      label: freeQty > 0 ? `${freeQty} × ${selectedOffer.free_product_name || freeLine?.name || 'item'} free` : 'Offer requirements not met'
    };
  }, [cart, discountType, selectedOffer, subtotal]);
  const manualDiscount = discountType === 'fixed'
    ? Math.min(Math.max(Number(fixedDiscount || 0), 0), subtotal)
    : discountType === 'bogo' ? bogoPreview.amount : 0;
  const totalDiscount = manualDiscount + explicitBogoDiscount;
  const finalTotal = Math.max(subtotal - totalDiscount, 0);
  const cashAmount = ['cash', 'split'].includes(paymentMethod) ? Number(cashReceived || 0) : 0;
  const onlineAmount = ['online', 'split'].includes(paymentMethod) ? Number(onlineReceived || 0) : 0;
  const totalReceived = cashAmount + onlineAmount;
  const change = Math.max(cashAmount - Math.max(finalTotal - onlineAmount, 0), 0);
  const paidNow = Math.min(Math.max(totalReceived - change, 0), finalTotal);
  const remaining = Math.max(finalTotal - paidNow, 0);

  async function staffLogin(event) {
    event.preventDefault();
    setMessage('');
    try {
      const data = await api('/auth/staff-login', { method: 'POST', body: JSON.stringify(login) });
      setToken(data.token);
      setStaff(data.user);
      api('/staff/offers').then(offerData => setOffers(offerData.offers || [])).catch(() => {});
    } catch (err) {
      setMessage(err.message);
    }
  }

  function addLine(line) {
    setCart(current => {
      const existing = current.find(row => row.key === line.key);
      if (existing) return current.map(row => row.key === line.key ? { ...row, quantity: Math.min(Number(row.stock), Number(row.quantity) + Number(line.quantity)) } : row);
      return [...current, line];
    });
    setModalItem(null);
    setBogoPicker(null);
  }

  function qty(key, delta) {
    setCart(current => current.map(line => (line.key || line.id) === key ? { ...line, quantity: Number(line.quantity) + delta } : line).filter(line => line.quantity > 0));
  }

  function add(item) {
    const variants = item.variants || [];
    if (variants.length > 1 || ['S', 'M', 'L'].includes(variants[0]?.name)) {
      setModalItem(item);
      return;
    }
    const variant = variants.find(v => Number(v.is_default) === 1) || variants[0] || null;
    addLine({ ...item, key: `${item.id}:${variant?.id || ''}:`, variant_id: variant?.id || null, variant_name: variant?.name || null, option_ids: [], options: [], price: Number(variant?.price ?? item.price), quantity: 1 });
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
    if (!cart.length) return setMessage('Cart is empty.');
    if (cashAmount < 0 || onlineAmount < 0 || Number.isNaN(cashAmount) || Number.isNaN(onlineAmount)) return setMessage('Enter valid payment amounts.');
    if (paymentMethod === 'cash' && cashAmount <= 0) return setMessage('Enter cash received.');
    if (paymentMethod === 'online' && onlineAmount <= 0) return setMessage('Enter online received amount.');
    if (paymentMethod === 'split' && (cashAmount <= 0 || onlineAmount <= 0)) return setMessage('Split payment needs both cash and online amounts.');
    if (discountType === 'fixed' && Number(fixedDiscount || 0) > subtotal) return setMessage('Discount cannot exceed subtotal.');
    if (discountType === 'bogo' && (!selectedOfferId || bogoPreview.freeQty <= 0)) return setMessage('Select a valid BOGO offer for this cart.');
    setLoading(true);
    setMessage('');
    try {
      const idempotency = crypto.randomUUID();
      const body = {
        order_type: orderType,
        payment_method: paymentMethod,
        items: cart.map(line => ({ id: line.id, variant_id: line.variant_id, option_ids: line.option_ids || [], quantity: line.quantity, client_key: line.key || '', is_bogo_free: Boolean(line.is_bogo_free), bogo_parent_key: line.bogo_parent_key || '' })),
        cash_received: ['cash', 'split'].includes(paymentMethod) ? cashReceived : undefined,
        online_received: ['online', 'split'].includes(paymentMethod) ? onlineReceived : undefined,
        table_number: orderType === 'dine_in' ? tableNumber : undefined,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email,
        discount_type: discountType,
        discount_amount: discountType === 'fixed' ? fixedDiscount : undefined,
        discount_reason: discountType === 'fixed' ? discountReason : undefined,
        offer_id: discountType === 'bogo' ? selectedOfferId : undefined,
        idempotency_key: idempotency
      };
      const data = await api('/staff/orders', { method: 'POST', headers: { 'X-Idempotency-Key': idempotency }, body: JSON.stringify(body) });
      setCreatedOrder(data.order);
      setCart([]);
      setDiscountOpen(false);
      setDiscountType('none');
      setFixedDiscount('');
      setDiscountReason('');
      setSelectedOfferId('');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
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
        <button className={orderType === 'dine_in' ? 'active' : ''} onClick={() => setOrderType('dine_in')}>Dine-In</button>
        <button className={orderType === 'takeaway' ? 'active' : ''} onClick={() => setOrderType('takeaway')}>Takeaway</button>
      </div>
      {orderType === 'dine_in' ? <input className="staff-input" placeholder="Table number / seat optional" value={tableNumber} onChange={e => setTableNumber(e.target.value)} /> : null}

      <div className="staff-customer-grid">
        <input className="staff-input" placeholder="Customer name optional" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
        <input className="staff-input" placeholder="Phone optional" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} />
        <input className="staff-input" placeholder="Email optional" value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })} />
      </div>

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
          <button className="ghost" onClick={() => setDiscountOpen(open => !open)}>{discountOpen ? 'Hide' : 'Add Discount'}</button>
        </div>
        {discountOpen ? (
          <div className="staff-discount-panel">
            <select className="staff-input" value={discountType} onChange={e => setDiscountType(e.target.value)}>
              <option value="none">No discount</option>
              <option value="fixed">Fixed amount</option>
            </select>
            {discountType === 'fixed' ? (
              <>
                <input className="staff-input" type="number" min="0" max={subtotal} step="0.01" placeholder="Discount amount" value={fixedDiscount} onChange={e => setFixedDiscount(e.target.value)} />
                <input className="staff-input" placeholder="Reason / note optional" value={discountReason} onChange={e => setDiscountReason(e.target.value)} />
              </>
            ) : null}
            {discountType === 'bogo' ? (
              <>
                <select className="staff-input" value={selectedOfferId} onChange={e => setSelectedOfferId(e.target.value)}>
                  <option value="">Select active offer</option>
                  {offers.filter(offer => (offer.offer_type || 'bogo') === 'bogo').map(offer => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
                </select>
                <p className={bogoPreview.freeQty > 0 ? 'small-note success-text' : 'small-note'}>{selectedOfferId ? `${bogoPreview.label} · Discount ${inr(bogoPreview.amount)}` : 'Choose an active BOGO offer.'}</p>
              </>
            ) : null}
          </div>
        ) : null}
        <span className="eyebrow">Payment</span>
        <div className="payment-options staff-payment-options">
          <label className={paymentMethod === 'cash' ? 'payment-card selected' : 'payment-card'}><input type="radio" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} />Cash</label>
          <label className={paymentMethod === 'online' ? 'payment-card selected' : 'payment-card'}><input type="radio" checked={paymentMethod === 'online'} onChange={() => setPaymentMethod('online')} />Online</label>
          <label className={paymentMethod === 'split' ? 'payment-card selected' : 'payment-card'}><input type="radio" checked={paymentMethod === 'split'} onChange={() => setPaymentMethod('split')} />Split</label>
        </div>
        {['cash', 'split'].includes(paymentMethod) ? <input className="staff-input" type="number" min="0" step="0.01" placeholder="Cash received" value={cashReceived} onChange={e => setCashReceived(e.target.value)} /> : null}
        {['online', 'split'].includes(paymentMethod) ? <><input className="staff-input" type="number" min="0" step="0.01" placeholder="Online received manually" value={onlineReceived} onChange={e => setOnlineReceived(e.target.value)} /><p className="small-note">Counter online payment only. Collect via UPI/card/bank app and enter the received amount here.</p></> : null}
      </div>

      <div className="payment-breakdown staff-payment-breakdown">
        <div><span>Subtotal</span><strong>{inr(subtotal)}</strong></div>
          {explicitBogoDiscount > 0 ? <div><span>BOGO Discount</span><strong>-{inr(explicitBogoDiscount)}</strong></div> : null}
          <div><span>Discount</span><strong>{manualDiscount > 0 ? `-${inr(manualDiscount)}` : inr(0)}</strong></div>
        <div className="grand"><span>Final Total</span><strong>{inr(finalTotal)}</strong></div>
        <div><span>Total Received</span><strong>{inr(totalReceived)}</strong></div>
        <div><span>Paid</span><strong>{inr(paidNow)}</strong></div>
        <div><span>Remaining</span><strong>{inr(remaining)}</strong></div>
        <div><span>Change</span><strong>{inr(change)}</strong></div>
      </div>
      <button className="full-width staff-place-order" onClick={createOrder} disabled={loading || !cart.length}><CreditCard size={18} /> {loading ? 'Creating...' : 'Place Order'}</button>
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
          {message ? <p className="notice error">{message}</p> : null}
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
          <span className="badge warning">{orderType === 'dine_in' ? 'DINE-IN' : 'TAKEAWAY'}</span>
          <button className="ghost" onClick={() => { clearToken(); setStaff(null); }}><LogOut size={16} /> Logout</button>
        </div>
      </header>
      {message ? <p className="notice error">{message}</p> : null}
      {createdOrder ? <section className="staff-success-card"><h2>Order Created Successfully</h2><p><strong>{createdOrder.order_number}</strong></p><p>Subtotal: {inr(createdOrder.subtotal)} · Discount: {inr(createdOrder.discount_amount || 0)} · Total: {inr(createdOrder.total_amount)}</p>{createdOrder.discount_description ? <p>{createdOrder.discount_description}</p> : null}<p>Payment: {createdOrder.payment_method || createdOrder.payment_mode} · {createdOrder.payment_status}</p><p>Cash: {inr(createdOrder.cash_received || 0)} · Online: {inr(createdOrder.online_received || 0)} · Paid: {inr(createdOrder.paid_amount || 0)} · Remaining: {inr(createdOrder.remaining_amount || 0)} · Change: {inr(createdOrder.change_amount || createdOrder.cash_change || 0)}</p><div className="action-row"><button className="ghost" onClick={() => openInvoice(`/staff/orders/${createdOrder.id}/invoice`)}><Printer size={16} /> Generate / Download Bill</button><button onClick={() => setCreatedOrder(null)}>New Order</button></div></section> : null}
      <section className="staff-pos-layout">
        <aside className="staff-category-panel">
          <h2>Categories</h2>
          {categoryButtons}
        </aside>
        <section className="staff-menu-panel">
          <div className="staff-menu-toolbar">
            <button className="ghost staff-mobile-category-trigger" onClick={() => setMobileCategoryOpen(true)}><Menu size={18} /> Categories</button>
            <div className="search-box staff-search-box"><Search size={20} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products, categories or descriptions" /></div>
            {suggestions.length ? <div className="staff-search-suggestions">{suggestions.map(({ item, category }) => <button key={item.id} onClick={() => selectSuggestion(item)}><strong>{item.name}</strong><span>{category?.name || 'Menu'} · {inr(Math.min(...(item.variants?.length ? item.variants.map(v => Number(v.price)) : [Number(item.price)])))}</span></button>)}</div> : debouncedSearch ? <div className="staff-search-suggestions muted"><p>No matching items found</p></div> : null}
          </div>
          <div className="staff-feed-heading">
            <div>
              <span className="eyebrow">{activeCategory === 'all' ? 'All Categories' : 'Selected Category'}</span>
              <h1>{activeCategory === 'all' ? 'Counter Menu' : categories.find(category => String(category.id) === String(activeCategory))?.name}</h1>
            </div>
            <span className="badge">{visibleItems.length} products</span>
          </div>
          <div className="staff-product-grid">{visibleItems.map((item, index) => <article id={`staff-product-${item.id}`} className={highlightedProductId === item.id ? 'staff-product-card highlighted' : 'staff-product-card'} key={item.id}><img src={productImage(item, index)} alt="" loading="lazy" /><div className="staff-product-copy"><h3>{item.name}</h3><p>{item.description}</p><strong>From {inr(Math.min(...(item.variants?.length ? item.variants.map(v => Number(v.price)) : [Number(item.price)])))}</strong></div><button onClick={() => add(item)} disabled={Number(item.stock) <= 0}>{Number(item.stock) <= 0 ? 'Sold Out' : 'Add'}</button></article>)}</div>
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
      <StaffOptionModal item={modalItem} optionGroups={optionGroups} onClose={() => setModalItem(null)} onAdd={addLine} />
      <StaffBogoModal unlock={bogoPicker} items={items} categories={categories} onClose={() => setBogoPicker(null)} onAdd={addLine} />
    </main>
  );
}
