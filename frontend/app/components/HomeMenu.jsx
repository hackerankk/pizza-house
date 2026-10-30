'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Home as HomeIcon, Menu, Minus, Palette, Plus, Search, ShoppingBag, Tag, Trash2, UserRound, Utensils, X } from 'lucide-react';
import { api, applyTheme, inr, productImage, readCart, saveCart, setThemeMode, storedThemeMode, token } from '../lib';
import { Toast, useToastMessage } from './ui';
import { LoadingState, EmptyState, ErrorState } from './AsyncState';
import { scrollBehavior } from '../motion';
import OptimizedImage from './OptimizedImage';
import { trackEvent } from '../analytics';
import useDialogFocus from './useDialogFocus';
import { isPizzaProduct } from '../product-type.mjs';
import { optionAvailableForProduct } from '../option-availability.mjs';
import { menuDescription, publicPickupAddress } from '../customer-copy.mjs';

function destinationHref(item) {
  if (!item || item.destination_type === 'none') return '';
  if (item.destination_type === 'menu') return '#menu';
  if (item.destination_type === 'custom_url') return item.destination_value || '';
  if (item.destination_type === 'category') return `#category-${item.destination_value}`;
  if (item.destination_type === 'product') return `#product-${item.destination_value}`;
  if (item.destination_type === 'offer') return '#offers';
  return '';
}

function safeCustomDestination(value = '') {
  if (!value) return '';
  try {
    const url = new URL(value);
    const localHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
    if (localHosts.includes(url.hostname) && !localHosts.includes(currentHost)) return '';
    return value;
  } catch {
    return '';
  }
}

function customerStoreStatusLabel(storeStatus) {
  if (!storeStatus) return '';
  return storeStatus.is_open ? 'Open - Orders Available' : 'Currently Closed';
}

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

function bogoSizeCode(name = '') {
  if (name === 'S' || String(name).toLowerCase().includes('small')) return 'S';
  if (name === 'M' || String(name).toLowerCase().includes('medium')) return 'M';
  if (name === 'L' || String(name).toLowerCase().includes('large')) return 'L';
  return String(name || '').toUpperCase();
}

function bogoCapacity(offer, paidQty) {
  const buy = Math.max(1, Number(offer?.buy_qty || 1));
  const get = Math.max(1, Number(offer?.get_qty || 1));
  return Math.floor(Math.max(Number(paidQty || 0), 0) / buy) * get;
}

function matchBogoOfferForLine(line, offers, weekday) {
  if (!line || line.is_bogo_free || !['S', 'M', 'L'].includes(bogoSizeCode(line.variant_name))) return null;
  return (offers || []).find(offer => {
    const productIds = (offer.product_ids || []).map(Number);
    const categoryIds = (offer.category_ids || []).map(Number);
    const scoped = productIds.length ? productIds.includes(Number(line.id)) : (categoryIds.length ? categoryIds.includes(Number(line.category_id)) : true);
    if (!scoped) return false;
    const sizeRules = offer.size_rules || {};
    const rules = (weekday && sizeRules[weekday]) || sizeRules.default || sizeRules;
    const size = bogoSizeCode(line.variant_name);
    return !rules || !Object.keys(rules).length || (Object.prototype.hasOwnProperty.call(rules, size) && String(rules[size] || '').trim() !== '');
  }) || null;
}

function bogoMappedFreeSize(offer, paidVariantName, weekday) {
  const rules = offer?.size_rules || {};
  const dayRules = (weekday && rules[weekday]) || rules.default || rules;
  if (!dayRules || !Object.keys(dayRules).length) return '';
  const mapped = dayRules[bogoSizeCode(paidVariantName)];
  return mapped ? bogoSizeCode(mapped) : '';
}

function reconcileBogoCart(lines = [], offerForLine = null) {
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

    if (offerForLine) {
      const offer = offerForLine(paidLine);
      if (!offer || Number(line.price) > Number(paidLine.price)) return;
    }

    const alreadyUsed = usedFreeQty.get(groupId) || 0;
    const capacityOffer = offerForLine ? offerForLine(paidLine) : null;
    const capacity = capacityOffer ? bogoCapacity(capacityOffer, Number(paidLine.quantity || 0)) : Math.floor(Number(paidLine.quantity || 0) / Number(line.bogo_buy_qty || 1)) * Number(line.bogo_get_qty || 1);
    const remaining = Math.max(capacity - alreadyUsed, 0);
    if (remaining <= 0) return;

    const quantity = Math.min(Number(line.quantity || 1), remaining);
    usedFreeQty.set(groupId, alreadyUsed + quantity);
    reconciled.push(ensureFreeBogoGroup({ ...line, quantity }, groupId));
  });

  return reconciled;
}

function cartOptionPrice(option, variantName) {
  if (variantName === 'S') return Number(option.small_price ?? option.fixed_price ?? 0);
  if (variantName === 'M') return Number(option.medium_price ?? option.fixed_price ?? 0);
  if (variantName === 'L') return Number(option.large_price ?? option.fixed_price ?? 0);
  return Number(option.fixed_price ?? option.small_price ?? 0);
}

function repriceCartLine(line, freshItems, freshGroups) {
  const item = (freshItems || []).find(row => String(row.id) === String(line.id));
  if (!item) return line;
  const variant = (item.variants || []).find(v => String(v.id) === String(line.variant_id)) || (item.variants || []).find(v => Number(v.is_default) === 1) || (item.variants || [])[0] || null;
  const optionsById = new Map((freshGroups || []).flatMap(group => (group.options || []).map(option => [String(option.id), { ...option, group_name: group.name }])));
  const priorSelections = Array.isArray(line.option_selections) ? line.option_selections : (line.options?.length ? line.options : (line.option_ids || []).map(id => ({ id, quantity: 1 })));
  const quantitiesById = new Map(priorSelections.map(option => [String(option.id), Math.max(1, Math.min(20, Number(option.quantity || 1)))]));
  const options = (line.option_ids || []).map(id => optionsById.get(String(id))).filter(option => option && optionAvailableForProduct(option, item, variant)).map(option => ({ ...option, quantity: quantitiesById.get(String(option.id)) || 1 }));
  const price = effectiveVariantPrice(item, variant) + options.reduce((sum, option) => sum + cartOptionPrice(option, variant?.name) * option.quantity, 0);
  const optionIds = options.map(option => Number(option.id));
  const optionSelections = options.map(option => ({ id: Number(option.id), quantity: option.quantity }));
  return { ...line, name: item.name, is_pizza: isPizzaProduct(item), category_name: item.category_name, category_slug: item.category_slug, category_id: item.category_id, stock: item.stock, variant_id: variant?.id || null, variant_name: variant?.name || null, option_ids: optionIds, option_selections: optionSelections, options: options.map(option => ({ ...option, price: cartOptionPrice(option, variant?.name) })), price };
}

function sameCart(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function Header({ theme, settings = {}, cartCount, viewer, onCartOpen, storeStatus, themeMode, onThemeMode }) {
  const [open, setOpen] = useState(false);
  const customer = viewer?.role === 'customer' ? viewer : null;
  const close = () => setOpen(false);
  const drawerRef = useDialogFocus(open, close);
  const links = [
    { label: 'Home', href: '/', icon: HomeIcon },
    { label: 'Menu', href: '#menu', icon: Utensils },
    { label: 'Offers', href: '#offers', icon: Tag },
    { label: 'Track Order', href: customer ? '/account' : '/login?return_to=/account', icon: Search }
  ];
  if (customer) links.push({ label: 'My Orders', href: '/account', icon: ShoppingBag }, { label: 'Account', href: '/account', icon: UserRound });
  if (!viewer && (settings.customer_login_enabled || '1') === '1') links.push({ label: 'Login', href: '/login', icon: UserRound });



  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <button className="icon-button hamburger-button" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <Link href="/" className="brand mark">
            {theme.logo_url ? <OptimizedImage src={productImage({ image_url: theme.logo_url })} alt="The Pizza House logo" width={40} height={40} sizes="40px" eager onError={event => { event.currentTarget.src = "/brand/icon-192.png"; }} /> : <span className="brand-icon">TP</span>}
            <span>The Pizza House</span>
          </Link>
          <nav className="desktop-nav">
            {links.map(({ label, href }) => <Link key={label} href={href}>{label}</Link>)}
          </nav>
          <div className="header-actions">
            {storeStatus ? <span className={storeStatus.is_open ? 'store-status-pill open' : 'store-status-pill closed'}>{customerStoreStatusLabel(storeStatus)}</span> : null}
            {(settings.customer_theme_enabled || '1') === '1' ? <select className="theme-mode-select" aria-label="Theme mode" title="Theme mode" value={themeMode} onChange={e => onThemeMode(e.target.value)}>
              <option value="light">Light</option>
              {(settings.customer_dark_mode_enabled || '1') === '1' ? <option value="dark">Dark</option> : null}
              <option value="system">System</option>
            </select> : null}
            <button className="cart-pill desktop-cart-button" onClick={onCartOpen} aria-label={`${cartCount} items in cart`}><ShoppingBag size={18} /><span>{cartCount}</span></button>
          </div>
        </div>
      </header>
      {open ? (
        <div className="mobile-menu-shell" aria-hidden={!open}>
          <button className="mobile-menu-backdrop" onClick={close} aria-label="Close menu backdrop" />
          <div ref={drawerRef} className="mobile-menu-panel" role="dialog" aria-modal="true" aria-label="Navigation menu" tabIndex={-1}>
            <div className="mobile-drawer-header">
              <Link href="/" className="brand mark" onClick={close}>
                {theme.logo_url ? <OptimizedImage src={productImage({ image_url: theme.logo_url })} alt="The Pizza House logo" width={40} height={40} sizes="40px" eager onError={event => { event.currentTarget.src = "/brand/icon-192.png"; }} /> : <span className="brand-icon">TP</span>}
                <span>The Pizza House</span>
              </Link>
              <button className="icon-button" onClick={close} aria-label="Close menu"><X size={20} /></button>
            </div>
            {customer ? <div className="drawer-customer"><UserRound size={18} /><span>{customer.name}</span></div> : null}
            <nav className="mobile-drawer-nav">
              {storeStatus ? <span className={storeStatus.is_open ? 'store-status-pill open' : 'store-status-pill closed'}>{customerStoreStatusLabel(storeStatus)}</span> : null}
              {links.map(({ label, href, icon: Icon }) => <Link key={label} href={href} onClick={close}><Icon size={18} /><span>{label}</span></Link>)}
              <button className="nav-button" onClick={() => { close(); onCartOpen(); }}><ShoppingBag size={18} /><span>Cart ({cartCount})</span></button>
              {(settings.customer_theme_enabled || '1') === '1' ? <label className="mobile-theme-control"><Palette size={18} /><span>Theme</span><select value={themeMode} onChange={e => onThemeMode(e.target.value)}><option value="light">Light</option>{(settings.customer_dark_mode_enabled || '1') === '1' ? <option value="dark">Dark</option> : null}<option value="system">System</option></select></label> : null}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CartPanel({ cart, subtotal, couponCode, onCoupon, onQty, onEdit, onChooseFree, onChangeFree, bogoUnlocks = [], bogoDiscount = 0, onClose, drawer = false }) {
  const dialogRef = useDialogFocus(drawer, onClose);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const unlockByGroup = new Map(bogoUnlocks.map(unlock => [bogoGroupKey(unlock.line), unlock]));
  const groupedCart = cart.filter(line => !line.is_bogo_free).map(line => ({
    line,
    freeLines: cart.filter(row => row.is_bogo_free && bogoGroupKey(row) === bogoGroupKey(line)),
    unlock: unlockByGroup.get(bogoGroupKey(line))
  }));
  function selectionText(line) {
    const parts = [];
    if (line.variant_name) parts.push(sizeLabel(line.variant_name));
    const crust = (line.options || []).find(option => String(option.group_name || '').toLowerCase().includes('crust'));
    const toppings = (line.options || []).filter(option => String(option.group_name || '').toLowerCase().includes('topping'));
    const addons = (line.options || []).filter(option => !String(option.group_name || '').toLowerCase().includes('crust') && !String(option.group_name || '').toLowerCase().includes('topping'));
    if (crust) parts.push(`Crust: ${crust.name}`);
    if (toppings.length) parts.push(`Toppings: ${toppings.map(option => `${option.name}${Number(option.quantity || 1) > 1 ? ` ×${option.quantity}` : ''}`).join(', ')}`);
    if (addons.length) parts.push(`Add-ons: ${addons.map(option => `${option.name}${Number(option.quantity || 1) > 1 ? ` ×${option.quantity}` : ''}`).join(', ')}`);
    return parts.join(' | ');
  }
  return (
    <aside ref={dialogRef} role={drawer ? 'dialog' : undefined} aria-modal={drawer ? true : undefined} aria-label="Your cart" tabIndex={drawer ? -1 : undefined} className={`${drawer ? 'cart-drawer-card flex' : 'order-summary menu-cart-card lg:!self-start'} !min-h-0 !flex-col`} id={drawer ? 'cart-drawer' : 'cart'}>
      <div className="summary-header shrink-0 lg:!pb-2">
        <div>
          <span className="eyebrow">Your Cart</span>
          <h2>{cart.length ? `${cartCount} item${cartCount === 1 ? '' : 's'}` : 'Cart is empty'}</h2>
        </div>
        {onClose ? <button className="icon-button" onClick={onClose} aria-label="Close cart"><X size={18} /></button> : <span className="badge">{cartCount}</span>}
      </div>
      <div className="menu-cart-scroll-area !min-h-0 !flex-1 !overflow-y-auto pr-1 lg:!h-auto lg:!max-h-none">
        {!cart.length ? <div className="empty-state compact"><ShoppingBag size={24} /><strong>Add something tasty</strong><p>Your selected items will appear here.</p></div> : null}
        <div className="summary-items compact-cart-list !grid gap-3">
          {groupedCart.map(({ line, freeLines, unlock }, index) => (
            <div className="grid gap-2" key={line.key || line.id}>
              <div className="cart-line !grid !grid-cols-[44px_minmax(0,1fr)_auto] !items-center gap-2 rounded-lg border border-tph-border bg-tph-surface/90 p-1.5">
                <div className="aspect-square h-11 w-11 overflow-hidden rounded-lg border border-tph-border bg-tph-bg">
                  <OptimizedImage className="h-full w-full object-cover" src={productImage(line, index)} alt={line.name} loading="lazy" />
                </div>
                <div className="min-w-0">
                  <strong className="block truncate text-xs leading-tight">{line.name}</strong>
                  {selectionText(line) ? <p className="!mt-0.5 line-clamp-1 !text-xs">{selectionText(line)}</p> : null}
                  <span className="block !mt-0.5 !text-xs">{inr(line.price)} each</span>
                  {!line.is_bogo_free ? <button className="ghost" onClick={() => onEdit(line)}>Edit size / toppings</button> : null}
                </div>
                <div className="grid justify-items-end gap-1">
                  <div className="flex items-center gap-1">
                    <strong className="text-right text-sm">{inr(Number(line.price) * line.quantity)}</strong>
                    <button className="icon-button tiny" onClick={() => onQty(line.key || line.id, -line.quantity)} aria-label={`Remove ${line.name}`}><Trash2 size={14} /></button>
                  </div>
                  <div className="quantity-control small !grid-cols-[24px_26px_24px]">
                    <button onClick={() => onQty(line.key || line.id, -1)} aria-label={`Decrease ${line.name}`}><Minus size={13} /></button>
                    <strong>{line.quantity}</strong>
                    <button onClick={() => onQty(line.key || line.id, 1)} aria-label={`Increase ${line.name}`}><Plus size={13} /></button>
                  </div>
                </div>
              </div>
              {freeLines.map(freeLine => (
                <div className="free-cart-line ml-5 grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-tph-border bg-tph-surface/90 p-1.5 pl-2 shadow-sm" key={freeLine.key || freeLine.id}>
                  <div className="aspect-square h-9 w-9 overflow-hidden rounded-lg border border-tph-border bg-tph-bg">
                    <OptimizedImage className="h-full w-full object-cover" src={productImage(freeLine, index)} alt={freeLine.name} loading="lazy" />
                  </div>
                  <div className="min-w-0">
                    <strong className="block truncate text-xs leading-tight">🎁 BOGO FREE PIZZA <span className="bogo-free-badge">FREE</span></strong>
                    <p className="!mt-0.5 line-clamp-1 !text-xs">{freeLine.name}{selectionText(freeLine) ? ` · ${selectionText(freeLine)}` : ''}</p>
                    <span className="block !mt-0.5 !text-xs">Linked to this pizza · worth {inr(freeLine.price)} x {freeLine.quantity}</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <button className="ghost !min-h-0 !px-2 !py-1 !text-[11px]" onClick={() => onChangeFree?.(line, freeLine)}>Change Free Pizza</button>
                      <button className="ghost !min-h-0 !px-2 !py-1 !text-[11px]" onClick={() => onQty(freeLine.key || freeLine.id, -freeLine.quantity)}>Remove Free</button>
                    </div>
                  </div>
                  <strong className="text-right text-sm">FREE</strong>
                </div>
              ))}
              {unlock ? <div className="bogo-unlock-card ml-5 !p-2" key={`${line.key}-unlock`}><div><strong>Choose Free Pizza Again</strong><span>BOGO slot available for {line.name}.</span></div><button className="ghost !min-h-0 !px-2 !py-1 !text-xs" onClick={() => onChooseFree(unlock)}>Choose Free Pizza</button></div> : null}
            </div>
          ))}
        </div>
      </div>
      <div className="menu-cart-footer !shrink-0 lg:!gap-2 lg:!pt-2">
        <input aria-label="Coupon code" maxLength={100} className="lg:!min-h-9 lg:!py-1" placeholder="Coupon code" value={couponCode} onChange={e => onCoupon(e.target.value)} />
        <div className="totals compact lg:!grid lg:!grid-cols-2 lg:!gap-2">
          <div className="menu-cart-total-row lg:!grid lg:!gap-1 lg:!py-1"><span>Subtotal</span><strong>{inr(subtotal)}</strong></div>
          {bogoDiscount > 0 ? <div className="menu-cart-total-row lg:!grid lg:!gap-1 lg:!py-1"><span>BOGO Savings</span><strong>-{inr(bogoDiscount)}</strong></div> : null}
          <div className="menu-cart-total-row lg:!grid lg:!gap-1 lg:!py-1"><span>Coupon</span><strong>Checkout</strong></div>
          <div className="menu-cart-total-row lg:!grid lg:!gap-1 lg:!py-1"><span>Delivery</span><strong>Checkout</strong></div>
          <div className="grand lg:!col-span-2 lg:!p-2.5"><span>Estimated Total</span><strong>{inr(Math.max(subtotal, 0))}</strong></div>
        </div>
        <Link className={cart.length ? 'button full-width cart-checkout-button lg:!min-h-9 lg:!py-1.5 lg:!text-sm' : 'button full-width disabled-link cart-checkout-button lg:!min-h-9 lg:!py-1.5 lg:!text-sm'} href={cart.length ? '/checkout' : '#menu'}>Checkout <ChevronRight size={18} /></Link>
      </div>
    </aside>
  );
}

function PromotionMarquee({ messages }) {
  if (!messages.length) return null;
  const content = [...messages, ...messages];
  return (
    <section className="promo-marquee" aria-label="Current offers">
      <div className="promo-marquee-track">
        {content.map((item, index) => {
          const body = <span>{item.message}</span>;
          return item.link
            ? <a href={item.link} key={`${item.id}-${index}`} aria-hidden={index >= messages.length ? true : undefined} tabIndex={index >= messages.length ? -1 : undefined}>{body}</a>
            : <span className="promo-marquee-item" key={`${item.id}-${index}`} aria-hidden={index >= messages.length ? true : undefined}>{body}</span>;
        })}
      </div>
    </section>
  );
}

function PromoBannerCarousel({ banners, onDestination }) {
  const [index, setIndex] = useState(0);
  const [rotationPaused, setRotationPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStartRef = useRef(null);

  useEffect(() => {
    if (banners.length <= 1) return undefined;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer;
    const update = () => {
      clearInterval(timer);
      setReducedMotion(preference.matches);
      if (!preference.matches && !rotationPaused) timer = setInterval(() => setIndex(current => (current + 1) % banners.length), 5000);
    };
    update();
    preference.addEventListener('change', update);
    return () => { clearInterval(timer); preference.removeEventListener('change', update); };
  }, [banners.length, rotationPaused]);

  useEffect(() => {
    setIndex(0);
  }, [banners.length]);

  if (!banners.length) return null;
  const current = banners[index] || banners[0];
  const rawHref = destinationHref(current);
  const href = current.destination_type === 'custom_url' ? safeCustomDestination(rawHref) : rawHref;
  const image = productImage(current);
  const previous = () => setIndex(currentIndex => (currentIndex - 1 + banners.length) % banners.length);
  const next = () => setIndex(currentIndex => (currentIndex + 1) % banners.length);
  const onTouchEnd = event => {
    if (touchStartRef.current === null) return;
    const delta = event.changedTouches[0].clientX - touchStartRef.current;
    touchStartRef.current = null;
    if (Math.abs(delta) < 40) return;
    delta > 0 ? previous() : next();
  };
  const inner = (
    <>
      <OptimizedImage src={image} alt={current.title} width={1200} height={450} sizes="(max-width: 1200px) 100vw, 1180px" eager={index === 0} />
      <div className="promo-banner-copy">
        <span className="eyebrow">Featured offer</span>
        <h2>{current.title}</h2>
        {current.subtitle ? <p>{current.subtitle}</p> : null}
        {current.button_text && href ? <span className="button">{current.button_text}</span> : null}
      </div>
    </>
  );
  const isExternalLink = current.destination_type === 'custom_url' && href;
  return (
    <section className="container promo-carousel" aria-label="Promotional banners">
      <div className="promo-banner" onTouchStart={event => { touchStartRef.current = event.touches[0].clientX; }} onTouchEnd={onTouchEnd}>
        {isExternalLink ? <a className="promo-banner-link" href={href} rel="noopener noreferrer">{inner}</a> : href ? <button type="button" className="promo-banner-link" onClick={() => onDestination?.(current)}>{inner}</button> : <div className="promo-banner-link">{inner}</div>}
        {banners.length > 1 ? (
          <>
            <button className="promo-arrow previous" onClick={previous} aria-label="Previous promotion">‹</button>
            <button className="promo-arrow next" onClick={next} aria-label="Next promotion">›</button>
            {!reducedMotion ? <button type="button" className="ghost" style={{ position: 'absolute', top: 12, right: 12, zIndex: 2, background: 'var(--card-color)' }} aria-pressed={rotationPaused} onClick={() => setRotationPaused(value => !value)}>{rotationPaused ? 'Resume' : 'Pause'} promotions</button> : null}
            <div className="promo-dots">{banners.map((banner, dotIndex) => <button key={banner.id} className={dotIndex === index ? 'active' : ''} onClick={() => setIndex(dotIndex)} aria-label={`Show promotion ${dotIndex + 1}`} />)}</div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function OfferPopup({ popup }) {
  const [visible, setVisible] = useState(false);
  const close = () => {
    if (popup) {
      const key = `pizza_house_popup_${popup.id}`;
      if (popup.display_frequency === 'daily') localStorage.setItem(key, new Date().toISOString().slice(0, 10));
      if (popup.display_frequency !== 'every_visit') sessionStorage.setItem(key, '1');
    }
    setVisible(false);
  };
  const dialogRef = useDialogFocus(Boolean(popup && visible), close);

  useEffect(() => {
    if (!popup) return undefined;
    const key = `pizza_house_popup_${popup.id}`;
    const today = new Date().toISOString().slice(0, 10);
    const seenSession = sessionStorage.getItem(key) === '1';
    const seenDay = localStorage.getItem(key) === today;
    if ((popup.display_frequency === 'session' && seenSession) || (popup.display_frequency === 'daily' && seenDay)) return undefined;
    const timer = setTimeout(() => setVisible(true), 10000);
    return () => {
      clearTimeout(timer);
    };
  }, [popup]);

  if (!popup || !visible) return null;
  const href = destinationHref(popup);
  return (
    <div className="offer-popup-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section ref={dialogRef} className="offer-popup" role="dialog" aria-modal="true" aria-label="Special offer" tabIndex={-1}>
        <button className="icon-button popup-close" onClick={close} aria-label="Close offer"><X size={18} /></button>
        {popup.image_url ? <OptimizedImage src={productImage(popup)} alt={popup.title || "Restaurant offer"} sizes="(max-width: 600px) 90vw, 560px" /> : null}
        <span className="eyebrow">Special offer</span>
        <h2>{popup.title}</h2>
        {popup.description ? <p>{popup.description}</p> : null}
        {popup.offer_text ? <strong className="offer-code">{popup.offer_text}</strong> : null}
        {popup.button_text && href ? <a className="button full-width" href={href} onClick={close}>{popup.button_text}</a> : null}
      </section>
    </div>
  );
}

function OptionModal({ item, optionGroups, onClose, onAdd }) {
  const dialogRef = useDialogFocus(Boolean(item), onClose);
  const variants = useMemo(() => item?.variants || [], [item?.variants]);
  const variantSignature = variants.map(variant => `${variant.id}:${variant.name}:${variant.is_default}`).join('|');
  const firstVariant = variants.find(variant => Number(variant.is_default) === 1) || variants[0] || null;
  const [variantId, setVariantId] = useState(item?._editLine?.variant_id || firstVariant?.id || null);
  const [crustId, setCrustId] = useState(item?._editLine?.options?.find(option => option.group_name?.toLowerCase() === 'crust')?.id || 'regular');
  const [toppingIds, setToppingIds] = useState(item?._editLine?.options?.filter(option => option.group_name?.toLowerCase().includes('topping')).map(option => Number(option.id)) || []);
  const [toppingQuantities, setToppingQuantities] = useState(() => Object.fromEntries((item?._editLine?.options || []).filter(option => option.group_name?.toLowerCase().includes('topping')).map(option => [Number(option.id), Math.max(1, Math.min(20, Number(option.quantity || 1)))])));
  const [quantity, setQuantity] = useState(item?._editLine?.quantity || 1);
  useEffect(() => {
    const selected = variants.find(variant => String(variant.id) === String(item?._editLine?.variant_id)) || variants.find(variant => Number(variant.is_default) === 1) || variants[0];
    setVariantId(selected?.id || null);
    setCrustId(item?._editLine?.options?.find(option => option.group_name?.toLowerCase() === 'crust')?.id || 'regular');
    setToppingIds(item?._editLine?.options?.filter(option => option.group_name?.toLowerCase().includes('topping')).map(option => Number(option.id)) || []);
    setToppingQuantities(Object.fromEntries((item?._editLine?.options || []).filter(option => option.group_name?.toLowerCase().includes('topping')).map(option => [Number(option.id), Math.max(1, Math.min(20, Number(option.quantity || 1)))])));
    setQuantity(item?._editLine?.quantity || 1);
  // Preserve the selection during background price refreshes; reset when choices change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?._editLine, variantSignature]);

  if (!item) return null;

  const variant = variants.find(v => Number(v.id) === Number(variantId)) || firstVariant;
  const isPizza = isPizzaProduct(item) && ['S', 'M', 'L'].includes(variant?.name);
  const crustGroup = optionGroups.find(group => group.name?.toLowerCase() === 'crust');
  const toppingGroup = optionGroups.find(group => group.name?.toLowerCase().includes('topping'));
  const availableToppings = (toppingGroup?.options || []).filter(option => optionAvailableForProduct(option, item, variant));
  const availableCrusts = (crustGroup?.options || []).filter(option => optionAvailableForProduct(option, item, variant));
  const selectedCrust = !isPizza || crustId === 'regular' ? null : availableCrusts.find(option => Number(option.id) === Number(crustId));
  const selectedToppings = availableToppings.filter(option => toppingIds.includes(Number(option.id))).map(option => ({ ...option, quantity: Math.max(1, Math.min(20, Number(toppingQuantities[Number(option.id)] || 1))) }));

  function optionPrice(option) {
    if (variant?.name === 'S') return Number(option.small_price ?? option.fixed_price ?? 0);
    if (variant?.name === 'M') return Number(option.medium_price ?? option.fixed_price ?? 0);
    if (variant?.name === 'L') return Number(option.large_price ?? option.fixed_price ?? 0);
    return Number(option.fixed_price ?? option.small_price ?? 0);
  }

  const selectedOptions = [...(selectedCrust ? [{ ...selectedCrust, group_name: crustGroup?.name || 'Crust' }] : []), ...selectedToppings.map(option => ({ ...option, group_name: toppingGroup?.name || 'Pizza Toppings' }))];
  const unitPrice = effectiveVariantPrice(item, variant) + selectedOptions.reduce((sum, option) => sum + optionPrice(option) * Number(option.quantity || 1), 0);
  const optionIds = selectedOptions.map(option => Number(option.id)).sort((a, b) => a - b);
  const optionSignature = selectedOptions.map(option => `${Number(option.id)}x${Number(option.quantity || 1)}`).sort().join('.');
  const line = {
    ...item,
    key: `${item.id}:${variant?.id || ''}:${optionSignature}`,
    variant_id: variant?.id || null,
    variant_name: variant?.name || null,
    option_ids: optionIds,
    option_selections: selectedOptions.map(option => ({ id: Number(option.id), quantity: Math.max(1, Math.min(20, Number(option.quantity || 1))) })),
    options: selectedOptions.map(option => ({ ...option, quantity: Math.max(1, Math.min(20, Number(option.quantity || 1))), price: optionPrice(option) })),
    price: unitPrice,
    quantity
  };

  function toggleTopping(id, checked) {
    const optionId = Number(id);
    setToppingIds(current => checked ? [...new Set([...current, optionId])] : current.filter(value => value !== optionId));
    setToppingQuantities(current => checked ? { ...current, [optionId]: Math.max(1, Number(current[optionId] || 1)) } : Object.fromEntries(Object.entries(current).filter(([key]) => Number(key) !== optionId)));
  }

  function changeToppingQuantity(id, delta) {
    const optionId = Number(id);
    setToppingQuantities(current => ({ ...current, [optionId]: Math.max(1, Math.min(20, Number(current[optionId] || 1) + delta)) }));
  }

  function variantLabel(name) {
    if (!isPizzaProduct(item)) return name === 'S' ? 'Standard' : name;
    if (name === 'S') return 'Small';
    if (name === 'M') return 'Medium';
    if (name === 'L') return 'Large';
    return name;
  }

  return (
    <div className="option-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="option-modal" role="dialog" aria-modal="true" aria-labelledby="product-options-title" tabIndex={-1}>
        <div className="option-modal-header">
          <div>
            <h2 id="product-options-title">{item.name}</h2>
            {menuDescription(item.description) ? <p>{menuDescription(item.description)}</p> : null}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close options"><X size={18} /></button>
        </div>

        {variants.length > 0 ? (
          <section className="option-section">
            <h3>{isPizzaProduct(item) && variants.some(variant => ['S', 'M', 'L'].includes(variant.name)) ? 'Choose Size' : 'Choose Variant'}</h3>
            <div className="choice-list">
              {variants.map(v => (
                <label className="choice-row" key={v.id}>
                  <input type="radio" name="variant" checked={Number(variant?.id) === Number(v.id)} onChange={() => { setVariantId(v.id); setCrustId('regular'); setToppingIds([]); setToppingQuantities({}); }} />
                  <span>{variantLabel(v.name)}</span>
                  <strong>{inr(effectiveVariantPrice(item, v))}</strong>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {isPizza || availableToppings.length ? (
          <>
            {isPizza ? <section className="option-section">
              <h3>Choose Crust</h3>
              <div className="choice-list">
                <label className="choice-row">
                  <input type="radio" name="crust" checked={crustId === 'regular'} onChange={() => setCrustId('regular')} />
                  <span>Regular</span>
                  <strong>Included</strong>
                </label>
                {availableCrusts.map(option => (
                  <label className="choice-row" key={option.id}>
                    <input type="radio" name="crust" checked={Number(crustId) === Number(option.id)} onChange={() => setCrustId(option.id)} />
                    <span>{option.name}</span>
                    <strong>+{inr(optionPrice(option))}</strong>
                  </label>
                ))}
              </div>
            </section> : null}

            <section className="option-section">
              <h3>Choose Toppings</h3>
              <div className="choice-list">
                {availableToppings.map(option => {
                  const selected = toppingIds.includes(Number(option.id));
                  const toppingQuantity = Math.max(1, Math.min(20, Number(toppingQuantities[Number(option.id)] || 1)));
                  return <div className="choice-row customer-topping-row" key={option.id}>
                    <label className="customer-topping-select"><input type="checkbox" checked={selected} onChange={e => toggleTopping(option.id, e.target.checked)} /><span>{option.name}</span></label>
                    <div className="customer-topping-actions">
                      <strong>+{inr(optionPrice(option))} each</strong>
                      {selected ? <div className="customer-option-stepper" aria-label={`${option.name} quantity per pizza`}>
                        <button type="button" aria-label={`Decrease ${option.name} quantity`} disabled={toppingQuantity <= 1} onClick={() => changeToppingQuantity(option.id, -1)}>−</button>
                        <span aria-live="polite">{toppingQuantity}</span>
                        <button type="button" aria-label={`Increase ${option.name} quantity`} disabled={toppingQuantity >= 20} onClick={() => changeToppingQuantity(option.id, 1)}>+</button>
                      </div> : null}
                    </div>
                  </div>;
                })}
              </div>
            </section>
          </>
        ) : null}

        <div className="option-modal-footer">
          <div className="quantity-control">
            <button onClick={() => setQuantity(value => Math.max(1, value - 1))} aria-label="Decrease quantity"><Minus size={14} /></button>
            <strong>{quantity}</strong>
            <button onClick={() => setQuantity(value => Math.min(Number(item.stock), value + 1))} aria-label="Increase quantity"><Plus size={14} /></button>
          </div>
          <div className="modal-total">
            <span>Total</span>
            <strong>{inr(unitPrice * quantity)}</strong>
          </div>
          <button className="customer-add-button" onClick={() => onAdd(line)} disabled={Number(item.stock) <= 0}><Plus size={16} /> Add to Cart</button>
        </div>
      </div>
    </div>
  );
}

function sizeLabel(name) {
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

function BogoFreePizzaModal({ unlock, items, categories, weekday, onClose, onAdd }) {
  const modalRef = useDialogFocus(Boolean(unlock), onClose);
  const eligibleItems = useMemo(() => {
    if (!unlock) return [];
    const categoryIds = unlock.offer?.category_ids || [];
    const productIds = unlock.offer?.free_product_ids || unlock.offer?.product_ids || [];
    return items.filter(item => {
      const hasPizzaSize = isPizzaProduct(item) && (item.variants || []).some(variant => ['S', 'M', 'L'].includes(variant.name));
      if (!hasPizzaSize) return false;
      if (productIds.length) return productIds.map(Number).includes(Number(item.id));
      if (categoryIds.length) return categoryIds.map(Number).includes(Number(item.category_id));
      return Number(item.category_id) === Number(unlock.line.category_id);
    });
  }, [items, unlock]);
  const [categoryId, setCategoryId] = useState('all');
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');

  if (!unlock) return null;
  const visibleItems = eligibleItems.filter(item => categoryId === 'all' || String(item.category_id) === String(categoryId));
  const selectedItem = visibleItems.find(item => String(item.id) === String(productId)) || visibleItems[0] || null;
  const eligibleCategories = categories.filter(category => eligibleItems.some(item => Number(item.category_id) === Number(category.id)));
  const eligibleCategoryNames = eligibleCategories.map(category => category.name).join(', ') || 'Configured eligible pizza categories';
  const eligibleProductNames = eligibleItems.slice(0, 6).map(item => item.name).join(', ');
  const sizeVariants = (selectedItem?.variants || []).filter(variant => ['S', 'M', 'L'].includes(variant.name));
  const requiredFreeSize = unlock ? bogoMappedFreeSize(unlock.offer, unlock.line.variant_name, weekday) : '';
  const eligibleVariants = sizeVariants.filter(variant => effectiveVariantPrice(selectedItem, variant) <= Number(unlock.line.price) && (!requiredFreeSize || variant.name === requiredFreeSize));
  const selectedVariant = sizeVariants.find(variant => String(variant.id) === String(variantId)) || eligibleVariants[0] || null;

  function addFree() {
    const selectedPrice = effectiveVariantPrice(selectedItem, selectedVariant);
    if (!selectedItem || !selectedVariant || selectedPrice > Number(unlock.line.price)) return;
    const groupId = bogoGroupKey(unlock.line);
    onAdd({
      ...selectedItem,
      key: `bogo:${groupId}:${selectedItem.id}:${selectedVariant.id}`,
      variant_id: selectedVariant.id,
      variant_name: selectedVariant.name,
      option_ids: [],
      options: [],
      price: selectedPrice,
      quantity: 1,
      is_bogo_free: true,
      bogo_buy_qty: Number(unlock.offer.buy_qty || 1),
      bogo_get_qty: Number(unlock.offer.get_qty || 1),
      bogo_parent_key: groupId,
      bogoGroupId: groupId,
      bogo_group_id: groupId,
      bogoRole: 'free',
      bogo_role: 'free'
    });
  }

  return (
    <div ref={modalRef} className="option-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="bogo-free-title" tabIndex={-1}>
      <div className="option-modal bogo-modal !flex !min-h-0 !max-w-4xl flex-col overflow-hidden">
        <div className="option-modal-header shrink-0">
          <div>
            <span className="eyebrow">BOGO offer</span>
            <h2 id="bogo-free-title">🎁 Choose your free pizza</h2>
            <p>{unlock.offer?.name || 'Active BOGO'} unlocked by {unlock.line.name}. Free pizza size price must be {inr(unlock.line.price)} or less.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close BOGO selector"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="bogo-context-grid">
          <div><span>Purchased Pizza</span><strong>{unlock.line.name}</strong></div>
          <div><span>Paid Size / Price</span><strong>{sizeLabel(unlock.line.variant_name)} · {inr(unlock.line.price)}</strong></div>
          <div><span>Eligible Categories</span><strong>{eligibleCategoryNames}</strong></div>
          <div><span>Eligible Products</span><strong>{eligibleProductNames}{eligibleItems.length > 6 ? ` +${eligibleItems.length - 6} more` : ''}</strong></div>
        </div>
        <div className="bogo-category-strip">
          <button className={categoryId === 'all' ? 'active' : ''} onClick={() => setCategoryId('all')}>All eligible</button>
          {eligibleCategories.map(category => <button key={category.id} className={String(categoryId) === String(category.id) ? 'active' : ''} onClick={() => { setCategoryId(category.id); setProductId(''); }}>{category.name}</button>)}
        </div>
        <div className="bogo-product-grid !grid !grid-cols-2 md:!grid-cols-3 xl:!grid-cols-4">
          {visibleItems.map(item => {
            const cheapestEligible = (item.variants || []).filter(variant => ['S', 'M', 'L'].includes(variant.name) && effectiveVariantPrice(item, variant) <= Number(unlock.line.price) && (!requiredFreeSize || variant.name === requiredFreeSize)).sort((a, b) => effectiveVariantPrice(item, a) - effectiveVariantPrice(item, b))[0];
            return <button key={item.id} className={`${String(selectedItem?.id) === String(item.id) ? 'bogo-product-card active' : 'bogo-product-card'} !grid min-h-[156px] !grid-cols-1 content-start gap-2 p-3 text-left`} onClick={() => { setProductId(item.id); setVariantId(''); }}><span className="aspect-square h-20 w-full overflow-hidden rounded-lg border border-tph-border bg-tph-bg"><OptimizedImage className="!h-full !w-full object-cover" src={productImage(item)} alt="" loading="lazy" /></span><span className="grid gap-1"><strong className="line-clamp-2 text-sm leading-tight">{item.name}</strong><small className="font-extrabold text-tph-primary">{cheapestEligible ? `${inr(effectiveVariantPrice(item, cheapestEligible))} FREE` : 'No eligible size'}</small></span></button>;
          })}
        </div>
        {selectedItem ? <section className="option-section">
          <h3>{selectedItem.name}</h3>
          <div className="bogo-size-grid">
            {sizeVariants.map(variant => {
              const variantPrice = effectiveVariantPrice(selectedItem, variant);
              const tooHigh = variantPrice > Number(unlock.line.price) || (requiredFreeSize !== '' && variant.name !== requiredFreeSize);
              return <button type="button" key={variant.id} className={`${tooHigh ? 'bogo-size-option disabled' : 'bogo-size-option'} ${String(selectedVariant?.id) === String(variant.id) ? 'active !border-tph-primary !ring-2 !ring-tph-primary/20' : ''}`} onClick={() => !tooHigh && setVariantId(variant.id)} disabled={tooHigh}><strong>{sizeLabel(variant.name)}</strong><span>{inr(variantPrice)} {tooHigh ? '' : 'FREE'}</span>{tooHigh ? <small>Exceeds {inr(unlock.line.price)} limit</small> : <small>Eligible free size</small>}</button>;
            })}
          </div>
        </section> : <p className="notice warning">No eligible free pizzas are configured for this offer.</p>}
        </div>
        <div className="shrink-0 border-t border-tph-border bg-tph-surface p-4">
          <button className="full-width" onClick={addFree} disabled={!selectedItem || !selectedVariant}>Add Free Pizza</button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [theme, setTheme] = useState({});
  const [settings, setSettings] = useState({});
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [optionGroups, setOptionGroups] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [cartReady, setCartReady] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [message, setMessage, messageType] = useToastMessage('info');
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState('');
  const [modalItem, setModalItem] = useState(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryMoreOpen, setCategoryMoreOpen] = useState(false);
  const categoryDialogRef = useDialogFocus(categoryMoreOpen, () => setCategoryMoreOpen(false));
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [storeStatus, setStoreStatus] = useState(null);
  const [themeMode, setThemeModeState] = useState('system');
  const [promotions, setPromotions] = useState({ banners: [], marquee: [], popup: null });
  const [activeBogoOffers, setActiveBogoOffers] = useState([]);
  const [activeBogoWeekday, setActiveBogoWeekday] = useState('');
  const [bogoRulesLoaded, setBogoRulesLoaded] = useState(false);
  const [bogoPicker, setBogoPicker] = useState(null);
  const menuFingerprintRef = useRef('');
  const previousCartRef = useRef(null);
  const notify = useCallback((text, type = 'info') => setMessage(text, type), [setMessage]);
  const restaurantAddress = /^update restaurant address in admin settings[.!]?$/i.test(String(settings.restaurant_address || '').trim()) ? '' : settings.restaurant_address;

  const loadMenu = useCallback(async () => {
    setMenuLoading(true);
    setMenuError('');
    try {
      const menu = await api('/menu');
      setItems(Array.from(new Map((menu.items || []).map(item => [String(item.id), item])).values()));
      setCategories(menu.categories || []);
      setOptionGroups(menu.option_groups || []);
    } catch {
      setMenuError('We couldn’t load the menu. Please try again.');
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    setThemeModeState(storedThemeMode() || 'system');
    setCart(reconcileBogoCart(readCart()));
    setCartReady(true);
    setCouponCode(localStorage.getItem('pizza_house_coupon') || '');
    Promise.all([
      api('/theme').catch(() => ({ theme: {} })),
      api('/settings').catch(() => ({ settings: {} }))
    ]).then(([t, s]) => {
      setTheme(t.theme || {});
      applyTheme(t.theme || {}, s.settings?.customer_default_theme || 'system');
      setSettings(s.settings || {});
    });
    loadMenu();
    api('/promotions')
      .then(p => setPromotions({ banners: (p.banners || []).filter(banner => ![banner.subtitle, banner.description].some(value => String(value || '').trim().toLowerCase() === 'build verification banner')), marquee: p.marquee || [], popup: p.popup || null }))
      .catch(() => {});
    api('/store/status')
      .then(store => setStoreStatus(store.store || null))
      .catch(() => {});
    api('/offers/active-bogo')
      .then(bogo => {
        setActiveBogoOffers(bogo.offers || []);
        setActiveBogoWeekday(bogo.weekday || '');
        setBogoRulesLoaded(true);
      })
      .catch(() => setBogoRulesLoaded(true));
    if (token()) {
      api('/auth/me').then(data => {
        setViewer(data.user || null);
      }).catch(() => {});
    }
  }, [loadMenu]);

  function changeThemeMode(mode) {
    setThemeModeState(mode);
    setThemeMode(mode);
  }

  useEffect(() => {
    if (cartReady) saveCart(cart);
  }, [cart, cartReady]);

  useEffect(() => {
    if (!cartReady) return;
    const previous = previousCartRef.current;
    previousCartRef.current = cart;
    if (!previous) return;
    const added = cart.reduce((sum, line) => sum + line.quantity, 0) - previous.reduce((sum, line) => sum + line.quantity, 0);
    if (added > 0) {
      const value = cart.reduce((sum, line) => {
        const old = previous.find(row => cartLineKey(row) === cartLineKey(line));
        return sum + Math.max(0, line.quantity - (old?.quantity || 0)) * (line.is_bogo_free ? 0 : Number(line.price || 0));
      }, 0);
      trackEvent('add_to_cart', { item_count: added, value, currency: 'INR' });
    }
  }, [cart, cartReady]);

  const refreshMenu = useCallback(() => {
    api('/offers/active-bogo').then(data => { setActiveBogoOffers(data.offers || []); setActiveBogoWeekday(data.weekday || ''); setBogoRulesLoaded(true); }).catch(() => {});
    api('/menu').then(m => {
      setMenuError('');
      setMenuLoading(false);
      const uniqueItems = Array.from(new Map((m.items || []).map(item => [String(item.id), item])).values());
      const groups = m.option_groups || [];
      const fingerprint = JSON.stringify(uniqueItems.map(item => [item.id, item.price, item.category_id, item.is_active, (item.variants || []).map(v => [v.id, v.name, v.price, v.is_default, v.is_active])])) + JSON.stringify(groups.map(g => [g.id, (g.options || []).map(o => [o.id, o.small_price, o.medium_price, o.large_price, o.fixed_price])]));
      const catalogChanged = menuFingerprintRef.current !== '' && menuFingerprintRef.current !== fingerprint;
      menuFingerprintRef.current = fingerprint;
      setCategories(m.categories || []);
      setItems(uniqueItems);
      setOptionGroups(groups);
      setModalItem(current => {
        if (!current) return current;
        const fresh = uniqueItems.find(item => String(item.id) === String(current.id));
        return fresh ? { ...fresh, _editLine: current._editLine } : current;
      });
      setCart(current => {
        if (!current.length) return current;
        const next = reconcileBogoCart(current.map(line => repriceCartLine(line, uniqueItems, groups)), bogoRulesLoaded ? (line => matchBogoOfferForLine(line, activeBogoOffers, activeBogoWeekday)) : null);
        return sameCart(current, next) ? current : next;
      });
      if (catalogChanged && !message) notify('Menu updated with the latest saved prices.', 'success');
    }).catch(() => {});
  }, [bogoRulesLoaded, activeBogoOffers, activeBogoWeekday, message, notify]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onFocus = () => refreshMenu();
    const timer = setInterval(() => refreshMenu(), 60000);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshMenu]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => clearTimeout(timer);
  }, [search]);

  function defaultVariant(item) {
    return (item.variants || []).find(variant => Number(variant.is_default) === 1) || (item.variants || [])[0] || null;
  }

  function startingPrice(item) {
    const variants = item.variants || [];
    if (!variants.length) return Number(item.price || 0);
    return Math.min(...variants.map(variant => effectiveVariantPrice(item, variant)));
  }

  function categoryFallback() {
    return '/brand/image-unavailable.svg';
  }

  function categoryImage(category) {
    if (category.id === 'all') {
      return '/brand/image-unavailable.svg';
    }
    if (category.image_url) return productImage(category);
    const categoryItems = items.filter(item => String(item.category_id) === String(category.id));
    const withImage = categoryItems.find(item => item.image_url);
    if (withImage) return productImage(withImage);
    const priced = categoryItems.find(item => Number(item.price) > 0) || categoryItems[0];
    return priced?.image_url ? productImage(priced) : categoryFallback(category.name);
  }

  function hasChoices(item) {
    const variant = defaultVariant(item);
    return (item.variants || []).length > 1 || ['S', 'M', 'L'].includes(variant?.name) || optionGroups.some(group => group.options?.some(option => option.applies_to === 'all'));
  }

  function configuredSimpleItem(item) {
    const variant = defaultVariant(item);
    return ensurePaidBogoGroup({
      ...item,
      key: `${item.id}:${variant?.id || ''}:`,
      variant_id: variant?.id || null,
      variant_name: variant?.name || null,
      option_ids: [],
      options: [],
      price: effectiveVariantPrice(item, variant),
      quantity: 1
    });
  }

  function addLine(line) {
    setCart(current => {
      if (line._editLine) {
        const old = line._editLine;
        const updated = ensurePaidBogoGroup({ ...line, _editLine: undefined });
        const remaining = current.filter(row => row.key !== old.key && !(row.is_bogo_free && bogoGroupKey(row) === bogoGroupKey(old)));
        const matching = remaining.find(row => row.key === updated.key);
        const next = matching ? remaining.map(row => row.key === updated.key ? { ...updated, quantity: Math.min(Number(updated.stock), Number(row.quantity) + Number(updated.quantity)) } : row) : [...remaining, updated];
        return reconcileBogoCart(next, bogoRulesLoaded ? offerForLine : null);
      }
      const incoming = line.is_bogo_free ? ensureFreeBogoGroup(line, bogoGroupKey(line)) : ensurePaidBogoGroup(line);
      const parentGroupId = incoming.is_bogo_free ? bogoGroupKey(incoming) : '';
      const parent = parentGroupId ? current.find(row => !row.is_bogo_free && bogoGroupKey(row) === parentGroupId) : null;
      if (incoming.is_bogo_free && !parent) return current;
      const usedFreeQty = incoming.is_bogo_free
        ? current.filter(row => row.is_bogo_free && bogoGroupKey(row) === parentGroupId && row.key !== incoming.key).reduce((sum, row) => sum + row.quantity, 0)
        : 0;
      const allowedFreeQty = incoming.is_bogo_free ? Math.max(bogoCapacity(offerForLine(parent), parent.quantity) - usedFreeQty, 0) : 0;
      const found = current.find(row => row.key === incoming.key);
      let next;
      if (found) {
        next = current.map(row => {
          if (row.key !== incoming.key) return row;
          const maxQty = incoming.is_bogo_free ? allowedFreeQty : Number(row.stock || incoming.stock || row.quantity + incoming.quantity);
          return { ...row, ...incoming, quantity: Math.min(row.quantity + incoming.quantity, maxQty) };
        });
      } else {
        if (incoming.is_bogo_free && allowedFreeQty <= 0) return current;
        next = [...current, incoming.is_bogo_free ? { ...incoming, quantity: Math.min(incoming.quantity, allowedFreeQty) } : incoming];
      }
      return reconcileBogoCart(next, bogoRulesLoaded ? offerForLine : null);
    });
    setModalItem(null);
    setBogoPicker(null);
    notify(`${line.name} added to cart.`, 'success');
  }

  function add(item) {
    if (Number(item.stock) <= 0) return;
    if (hasChoices(item)) {
      setModalItem(item);
      return;
    }
    addLine(configuredSimpleItem(item));
  }

  function editCartLine(line) {
    const product = items.find(item => Number(item.id) === Number(line.id));
    if (product) setModalItem({ ...product, _editLine: line });
  }

  function qty(key, delta) {
    setCart(current => {
      const target = current.find(line => (line.key || line.id) === key);
      if (!target) return current;
      const targetGroup = bogoGroupKey(target);
      const next = !target.is_bogo_free && target.quantity + delta <= 0
        ? current.filter(line => bogoGroupKey(line) !== targetGroup)
        : current
          .map(line => (line.key || line.id) === key ? { ...line, quantity: line.quantity + delta } : line)
          .filter(line => line.quantity > 0);
      return reconcileBogoCart(next, bogoRulesLoaded ? offerForLine : null);
    });
  }

  function saveCoupon(value) {
    const code = value.toUpperCase();
    setCouponCode(code);
    localStorage.setItem('pizza_house_coupon', code);
  }

  function selectCategory(id) {
    setActiveCategory(id);
    setCategoryMoreOpen(false);
    document.getElementById('menu')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }

  function findProductDestination(value) {
    const wanted = String(value || '').trim();
    if (!wanted) return null;
    return items.find(item => String(item.id) === wanted || String(item.slug || '').toLowerCase() === wanted.toLowerCase()) || null;
  }

  function openProductDestination(value, { updateHash = true } = {}) {
    const product = findProductDestination(value);
    if (!product) {
      notify('That promoted product is currently unavailable. Showing the full menu instead.', 'warning');
      document.getElementById('menu')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      if (updateHash && typeof window !== 'undefined') window.history.replaceState(null, '', '#menu');
      return;
    }
    setActiveCategory(product.category_id);
    setSearch('');
    setDebouncedSearch('');
    setHighlightedProductId(product.id);
    setModalItem(product);
    setTimeout(() => document.getElementById(`product-${product.id}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' }), 50);
    setTimeout(() => setHighlightedProductId(null), 1800);
    if (updateHash && typeof window !== 'undefined') window.history.replaceState(null, '', `#product-${product.id}`);
  }

  function openCategoryDestination(value, { updateHash = true } = {}) {
    const category = categories.find(row => String(row.id) === String(value) || String(row.slug || '').toLowerCase() === String(value || '').toLowerCase());
    if (!category) {
      notify('That promoted category is currently unavailable. Showing the full menu instead.', 'warning');
      document.getElementById('menu')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      if (updateHash && typeof window !== 'undefined') window.history.replaceState(null, '', '#menu');
      return;
    }
    selectCategory(category.id);
    if (updateHash && typeof window !== 'undefined') window.history.replaceState(null, '', `#category-${category.id}`);
  }

  function handlePromotionDestination(promo) {
    if (!promo) return;
    if (promo.destination_type === 'product') return openProductDestination(promo.destination_value);
    if (promo.destination_type === 'category') return openCategoryDestination(promo.destination_value);
    if (promo.destination_type === 'menu') {
      document.getElementById('menu')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      if (typeof window !== 'undefined') window.history.replaceState(null, '', '#menu');
      return;
    }
    if (promo.destination_type === 'offer') {
      document.getElementById('offers')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      if (typeof window !== 'undefined') window.history.replaceState(null, '', '#offers');
    }
  }

  useEffect(() => {
    if (!items.length || typeof window === 'undefined') return;
    const applyHash = () => {
      const hash = window.location.hash || '';
      if (hash.startsWith('#product-')) {
        const wanted = decodeURIComponent(hash.replace('#product-', ''));
        const product = items.find(item => String(item.id) === wanted || String(item.slug || '').toLowerCase() === wanted.toLowerCase());
        if (!product) return;
        setActiveCategory(product.category_id);
        setSearch('');
        setDebouncedSearch('');
        setHighlightedProductId(product.id);
        setModalItem(product);
        setTimeout(() => document.getElementById(`product-${product.id}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' }), 50);
        setTimeout(() => setHighlightedProductId(null), 1800);
      } else if (hash.startsWith('#category-')) {
        const wanted = decodeURIComponent(hash.replace('#category-', ''));
        const category = categories.find(row => String(row.id) === wanted || String(row.slug || '').toLowerCase() === wanted.toLowerCase());
        if (!category) return;
        setActiveCategory(category.id);
        setCategoryMoreOpen(false);
        document.getElementById('menu')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      } else if (hash === '#menu') {
        document.getElementById('menu')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [items, categories]);

  function selectSuggestion(item) {
    setActiveCategory(item.category_id);
    setSearch(item.name);
    setDebouncedSearch(item.name);
    setHighlightedProductId(item.id);
    setTimeout(() => document.getElementById(`product-${item.id}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' }), 50);
    setTimeout(() => setHighlightedProductId(null), 1800);
  }

  function pizzaSizeCode(name = '') {
    if (name === 'S' || String(name).toLowerCase().includes('small')) return 'S';
    if (name === 'M' || String(name).toLowerCase().includes('medium')) return 'M';
    if (name === 'L' || String(name).toLowerCase().includes('large')) return 'L';
    return String(name || '').toUpperCase();
  }

  const offerForLine = useCallback((line) => {
    if (!isPizzaProduct(line) || line.is_bogo_free || !['S', 'M', 'L'].includes(pizzaSizeCode(line.variant_name))) return null;
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

  useEffect(() => {
    if (!cartReady || !bogoRulesLoaded) return;
    setCart(current => {
      const next = reconcileBogoCart(current, offerForLine);
      return sameCart(current, next) ? current : next;
    });
  }, [cartReady, bogoRulesLoaded, offerForLine]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const bogoDiscount = cart.filter(line => line.is_bogo_free).reduce((sum, line) => sum + Number(line.price) * line.quantity, 0);
  const subtotal = cart.filter(line => !line.is_bogo_free).reduce((sum, line) => sum + Number(line.price) * line.quantity, 0);
  const bogoUnlocks = cart
    .filter(line => !line.is_bogo_free)
    .map(line => ({ line, offer: offerForLine(line), chosen: cart.filter(row => row.is_bogo_free && bogoGroupKey(row) === bogoGroupKey(line)).reduce((sum, row) => sum + row.quantity, 0) }))
    .filter(unlock => unlock.offer && unlock.chosen < bogoCapacity(unlock.offer, unlock.line.quantity));

  function changeFreePizza(paidLine, freeLine) {
    qty(freeLine.key || freeLine.id, -freeLine.quantity);
    const offer = offerForLine(paidLine);
    if (offer) setBogoPicker({ line: paidLine, offer });
  }
  const selectedItems = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return items.filter(item => {
      const categoryMatch = activeCategory === 'all' || String(item.category_id) === String(activeCategory);
      const category = categories.find(cat => Number(cat.id) === Number(item.category_id));
      const optionText = (optionGroups || []).flatMap(group => group.options || []).map(option => option.name).join(' ');
      const queryMatch = !q || item.name.toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q) || (category?.name || '').toLowerCase().includes(q) || optionText.toLowerCase().includes(q);
      return categoryMatch && queryMatch;
    });
  }, [items, debouncedSearch, activeCategory, categories, optionGroups]);
  const categoryItems = [{ id: 'all', name: 'All' }, ...categories];
  const primaryCategories = categoryItems.slice(0, 10);
  const overflowCategories = categoryItems.slice(10);
  const suggestions = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    if (!q) return [];
    return items
      .map(item => ({ item, category: categories.find(cat => Number(cat.id) === Number(item.category_id)) }))
      .filter(({ item, category }) => `${item.name} ${item.description || ''} ${category?.name || ''}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [items, categories, debouncedSearch]);

  return (
    <div className="shell food-shell">
      <Header theme={theme} settings={settings} cartCount={cartCount} viewer={viewer} onCartOpen={() => setCartDrawerOpen(true)} storeStatus={storeStatus} themeMode={themeMode} onThemeMode={changeThemeMode} />
      <main>
        <section className="food-hero">
          <div className="container food-hero-inner">
            <div>
              <span className="eyebrow">Fresh pizza, sides and drinks</span>
              <h1>{settings.restaurant_name || 'The Pizza House'}</h1>
              <p>{restaurantAddress || 'Order favourites for delivery or takeaway.'}</p>
              {storeStatus && !storeStatus.is_open ? <p className="notice warning">{storeStatus.message || 'Orders are currently closed.'} {storeStatus.manual_override === 'auto' && storeStatus.next_opening ? `Next opening: ${storeStatus.next_opening.day} ${storeStatus.next_opening.open}-${storeStatus.next_opening.close}` : ''}</p> : null}
            </div>
            {(settings.online_ordering_enabled || '1') === '1' ? <a className="button" href="#menu">Start Order <ChevronRight size={18} /></a> : <span className="status-badge danger">Online ordering off</span>}
          </div>
        </section>

        <section className="menu-sticky-bar menu-search-bar" id="categories">
          <div className="container menu-toolbar single">
            <div className="search-shell">
              <div className="search-box"><Search size={18} aria-hidden="true" /><input aria-label="Search the menu" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search pizza, pasta, burgers..." /></div>
              {debouncedSearch ? <div className="search-suggestions">
                {suggestions.length ? suggestions.map(({ item, category }) => <button key={item.id} onClick={() => selectSuggestion(item)}><strong>{item.name}</strong><span>{category?.name || 'Menu'} · {inr(startingPrice(item))}</span></button>) : <p>No matching items found</p>}
              </div> : null}
            </div>
            <button className="ghost mobile-category-button" onClick={() => setCategoryMoreOpen(true)}>Categories</button>
          </div>
        </section>

        <section id="offers" aria-label="Current offers" style={{ scrollMarginTop: 100 }}>
          <PromotionMarquee messages={promotions.marquee} />
          <PromoBannerCarousel banners={promotions.banners} onDestination={handlePromotionDestination} />
          {!promotions.marquee.length && !promotions.banners.length ? <div className="container"><p className="small-note">Browse the menu for current prices and availability.</p></div> : null}
        </section>

        <div className="container">{message ? <Toast tone={messageType} onDismiss={() => setMessage('')}>{message}</Toast> : null}</div>

        <section className="container food-layout" id="menu">
          <aside className="menu-category-sidebar" aria-label="Menu categories">
            <h2>Categories</h2>
            {primaryCategories.map(category => (
              <button id={`category-${category.id}`} className={String(activeCategory) === String(category.id) ? 'vertical-category active' : 'vertical-category'} onClick={() => selectCategory(category.id)} key={category.id}>
                {category.id === 'all' ? <Utensils size={16} /> : <OptimizedImage src={categoryImage(category)} alt="" width={40} height={40} sizes="40px" />}
                <span>{category.name}</span>
              </button>
            ))}
            {overflowCategories.length ? <button className="vertical-category" onClick={() => setCategoryMoreOpen(true)}><Menu size={16} /><span>View More</span></button> : null}
          </aside>
          <div className="menu-feed">
            <div className="feed-heading">
              <div>
                <span className="eyebrow">Menu</span>
                <h2>{activeCategory === 'all' ? 'Recommended for you' : categories.find(category => String(category.id) === String(activeCategory))?.name}</h2>
              </div>
              <span className="muted">{menuLoading ? 'Loading menu…' : `${selectedItems.length} items`}</span>
            </div>

            <div className="food-list">
              {menuLoading ? <LoadingState label="Loading the menu" rows={4} /> : menuError ? <ErrorState title="Menu unavailable" message={menuError} onRetry={loadMenu} /> : !selectedItems.length ? <EmptyState title={search ? 'No matching items' : 'No items available'} message={search ? 'Try another name or browse all categories.' : 'Please check back soon for the latest menu.'}>{search || activeCategory !== 'all' ? <button type="button" className="ghost" onClick={() => { setSearch(''); setDebouncedSearch(''); setActiveCategory('all'); }}>Clear search and filters</button> : <button type="button" className="ghost" onClick={loadMenu}>Refresh menu</button>}</EmptyState> : null}
              {selectedItems.map((item, index) => {
                const from = startingPrice(item);
                const inCart = cart.filter(line => Number(line.id) === Number(item.id)).reduce((sum, line) => sum + line.quantity, 0);
                return (
                  <article className={highlightedProductId === item.id ? 'food-card highlighted' : 'food-card'} id={`product-${item.id}`} key={item.id}>
                    <div className="food-card-copy">
                      <h3>{item.name}</h3>
                      <strong className="price">{(item.variants || []).length > 1 ? `From ${inr(from)}` : inr(from)}</strong>
                      {menuDescription(item.description) ? <p>{menuDescription(item.description)}</p> : null}
                      <span className={Number(item.stock) > 0 ? 'stock-note' : 'stock-note sold-out'}>{Number(item.stock) > 0 ? 'Available now' : 'Sold out'}</span>
                    </div>
                    <div className="food-card-media">
                      <OptimizedImage src={productImage(item, index)} alt={item.name} eager={index === 0} />
                      <button className="add-float" onClick={() => add(item)} disabled={Number(item.stock) <= 0}>{inCart ? `ADD (${inCart})` : 'ADD'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <CartPanel cart={cart} subtotal={subtotal} couponCode={couponCode} onCoupon={saveCoupon} onQty={qty} onEdit={editCartLine} bogoUnlocks={bogoUnlocks} bogoDiscount={bogoDiscount} onChooseFree={setBogoPicker} onChangeFree={changeFreePizza} />
        </section>
      </main>

      {cartCount > 0 ? (
        <button className="mobile-cart-bar" onClick={() => setCartDrawerOpen(true)}>
          <span>{cartCount} item{cartCount === 1 ? '' : 's'} | {inr(subtotal)}</span>
          <strong>View Cart</strong>
        </button>
      ) : null}

      {cartDrawerOpen ? (
        <div className="cart-drawer-backdrop">
          <CartPanel cart={cart} subtotal={subtotal} couponCode={couponCode} onCoupon={saveCoupon} onQty={qty} onEdit={editCartLine} bogoUnlocks={bogoUnlocks} bogoDiscount={bogoDiscount} onChooseFree={setBogoPicker} onChangeFree={changeFreePizza} onClose={() => setCartDrawerOpen(false)} drawer />
        </div>
      ) : null}

      <OptionModal key={modalItem ? `product-${modalItem.id}` : 'product-none'} item={modalItem} optionGroups={optionGroups} onClose={() => setModalItem(null)} onAdd={addLine} />
      <BogoFreePizzaModal key={bogoPicker ? `bogo-${bogoGroupKey(bogoPicker.line)}-${bogoPicker.offer?.id}` : 'bogo-none'} unlock={bogoPicker} items={items} categories={categories} weekday={activeBogoWeekday} onClose={() => setBogoPicker(null)} onAdd={addLine} />
      <OfferPopup popup={promotions.popup} />
      {categoryMoreOpen ? (
        <div className="category-more-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setCategoryMoreOpen(false); }}>
          <section ref={categoryDialogRef} className="category-more-panel" role="dialog" aria-modal="true" aria-labelledby="more-categories-title" tabIndex={-1}>
            <div className="summary-header"><h2 id="more-categories-title">Categories</h2><button className="icon-button" aria-label="Close categories" onClick={() => setCategoryMoreOpen(false)}><X size={18} /></button></div>
            <div className="category-more-grid">{categoryItems.map(category => <button key={category.id} className={String(activeCategory) === String(category.id) ? 'vertical-category active' : 'vertical-category'} onClick={() => selectCategory(category.id)}>{category.name}</button>)}</div>
          </section>
        </div>
      ) : null}
      <footer className="footer"><div className="container footer-grid"><strong>The Pizza House</strong><span>{publicPickupAddress(restaurantAddress) || 'Order for delivery or takeaway'}</span><Link href="/privacy">Privacy and cookies</Link></div></footer>
    </div>
  );
}
