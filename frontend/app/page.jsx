'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Menu, Minus, Plus, Search, ShoppingBag, Trash2, UserRound, X } from 'lucide-react';
import { api, applyTheme, inr, productImage, readCart, saveCart, token } from './lib';

function Header({ theme, cartCount, customer, onCartOpen }) {
  const [open, setOpen] = useState(false);
  const links = (
    <>
      <a href="#menu">Menu</a>
      <button className="nav-button" onClick={onCartOpen}>Cart</button>
      {customer ? <Link href="/account">My Account</Link> : <Link href="/login">Login</Link>}
      <Link href="/admin">Admin</Link>
    </>
  );

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand mark">
          {theme.logo_url ? <img src={theme.logo_url} alt="The Pizza House logo" /> : <span className="brand-icon">TP</span>}
          <span>The Pizza House</span>
        </Link>
        <nav className="desktop-nav">{links}</nav>
        <div className="header-actions">
          {customer ? <Link className="nav-account-pill" href="/account"><UserRound size={16} /> {customer.name}</Link> : <Link className="nav-account-pill login-pill" href="/login">Login</Link>}
          <button className="cart-pill" onClick={onCartOpen} aria-label={`${cartCount} items in cart`}><ShoppingBag size={18} /><span>{cartCount}</span></button>
          <button className="icon-button mobile-only" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
        </div>
      </div>
      {open ? (
        <div className="mobile-menu">
          <div className="mobile-menu-panel">
            <div className="row"><strong>Navigation</strong><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button></div>
            <nav onClick={() => setOpen(false)}>{links}</nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function CartPanel({ cart, subtotal, couponCode, onCoupon, onQty, onClose, drawer = false }) {
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <aside className={drawer ? 'cart-drawer-card' : 'order-summary menu-cart-card'} id="cart">
      <div className="summary-header">
        <div>
          <span className="eyebrow">Your Cart</span>
          <h2>{cart.length ? `${cartCount} item${cartCount === 1 ? '' : 's'}` : 'Cart is empty'}</h2>
        </div>
        {onClose ? <button className="icon-button" onClick={onClose} aria-label="Close cart"><X size={18} /></button> : <span className="badge">{cartCount}</span>}
      </div>
      {!cart.length ? <div className="empty-state compact"><ShoppingBag size={24} /><strong>Add something tasty</strong><p>Your selected items will appear here.</p></div> : null}
      <div className="summary-items compact-cart-list">
        {cart.map((line) => (
          <div className="cart-line" key={line.key || line.id}>
            <div>
              <strong>{line.name}</strong>
              {line.variant_name ? <p>{line.variant_name}{line.options?.length ? ` | ${line.options.map(option => option.name).join(', ')}` : ''}</p> : null}
              <span>{inr(line.price)} each</span>
            </div>
            <div className="cart-line-actions">
              <div className="quantity-control small">
                <button onClick={() => onQty(line.key || line.id, -1)} aria-label={`Decrease ${line.name}`}><Minus size={13} /></button>
                <strong>{line.quantity}</strong>
                <button onClick={() => onQty(line.key || line.id, 1)} aria-label={`Increase ${line.name}`}><Plus size={13} /></button>
              </div>
              <strong>{inr(Number(line.price) * line.quantity)}</strong>
              <button className="icon-button tiny" onClick={() => onQty(line.key || line.id, -line.quantity)} aria-label={`Remove ${line.name}`}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      <input placeholder="Coupon code" value={couponCode} onChange={e => onCoupon(e.target.value)} />
      <div className="totals compact">
        <div><span>Subtotal</span><strong>{inr(subtotal)}</strong></div>
        <div><span>Discount</span><strong>Validated at checkout</strong></div>
        <div><span>Delivery</span><strong>Calculated at checkout</strong></div>
      </div>
      <Link className={cart.length ? 'button full-width' : 'button full-width disabled-link'} href={cart.length ? '/checkout' : '#menu'}>Checkout <ChevronRight size={18} /></Link>
    </aside>
  );
}

function OptionModal({ item, optionGroups, onClose, onAdd }) {
  const variants = item?.variants || [];
  const firstVariant = variants.find(variant => Number(variant.is_default) === 1) || variants[0] || null;
  const [variantId, setVariantId] = useState(firstVariant?.id || null);
  const [crustId, setCrustId] = useState('regular');
  const [toppingIds, setToppingIds] = useState([]);
  const [quantity, setQuantity] = useState(1);

  if (!item) return null;

  const variant = variants.find(v => Number(v.id) === Number(variantId)) || firstVariant;
  const isPizza = ['S', 'M', 'L'].includes(variant?.name);
  const crustGroup = optionGroups.find(group => group.name?.toLowerCase() === 'crust');
  const toppingGroup = optionGroups.find(group => group.name?.toLowerCase().includes('topping'));
  const selectedCrust = crustId === 'regular' ? null : (crustGroup?.options || []).find(option => Number(option.id) === Number(crustId));
  const selectedToppings = (toppingGroup?.options || []).filter(option => toppingIds.includes(Number(option.id)));

  function optionPrice(option) {
    if (variant?.name === 'S') return Number(option.small_price || option.fixed_price || 0);
    if (variant?.name === 'M') return Number(option.medium_price || option.fixed_price || 0);
    if (variant?.name === 'L') return Number(option.large_price || option.fixed_price || 0);
    return Number(option.fixed_price || option.small_price || 0);
  }

  const selectedOptions = [...(selectedCrust ? [{ ...selectedCrust, group_name: crustGroup?.name || 'Crust' }] : []), ...selectedToppings.map(option => ({ ...option, group_name: toppingGroup?.name || 'Pizza Toppings' }))];
  const unitPrice = Number(variant?.price ?? item.price) + selectedOptions.reduce((sum, option) => sum + optionPrice(option), 0);
  const optionIds = selectedOptions.map(option => Number(option.id)).sort((a, b) => a - b);
  const line = {
    ...item,
    key: `${item.id}:${variant?.id || ''}:${optionIds.join('.')}`,
    variant_id: variant?.id || null,
    variant_name: variant?.name || null,
    option_ids: optionIds,
    options: selectedOptions.map(option => ({ ...option, price: optionPrice(option) })),
    price: unitPrice,
    quantity
  };

  function toggleTopping(id, checked) {
    setToppingIds(current => checked ? [...current, Number(id)] : current.filter(value => value !== Number(id)));
  }

  function variantLabel(name) {
    if (name === 'S') return 'Small';
    if (name === 'M') return 'Medium';
    if (name === 'L') return 'Large';
    return name;
  }

  return (
    <div className="option-modal-backdrop" role="dialog" aria-modal="true">
      <div className="option-modal">
        <div className="option-modal-header">
          <div>
            <h2>{item.name}</h2>
            <p>{item.description}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close options"><X size={18} /></button>
        </div>

        {variants.length > 1 ? (
          <section className="option-section">
            <h3>Choose Size</h3>
            <div className="choice-list">
              {variants.map(v => (
                <label className="choice-row" key={v.id}>
                  <input type="radio" name="variant" checked={Number(variant?.id) === Number(v.id)} onChange={() => { setVariantId(v.id); setCrustId('regular'); setToppingIds([]); }} />
                  <span>{variantLabel(v.name)}</span>
                  <strong>{inr(v.price)}</strong>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {isPizza ? (
          <>
            <section className="option-section">
              <h3>Choose Crust</h3>
              <div className="choice-list">
                <label className="choice-row">
                  <input type="radio" name="crust" checked={crustId === 'regular'} onChange={() => setCrustId('regular')} />
                  <span>Regular</span>
                  <strong>Included</strong>
                </label>
                {(crustGroup?.options || []).map(option => (
                  <label className="choice-row" key={option.id}>
                    <input type="radio" name="crust" checked={Number(crustId) === Number(option.id)} onChange={() => setCrustId(option.id)} />
                    <span>{option.name}</span>
                    <strong>+{inr(optionPrice(option))}</strong>
                  </label>
                ))}
              </div>
            </section>

            <section className="option-section">
              <h3>Choose Toppings</h3>
              <div className="choice-list">
                {(toppingGroup?.options || []).map(option => (
                  <label className="choice-row" key={option.id}>
                    <input type="checkbox" checked={toppingIds.includes(Number(option.id))} onChange={e => toggleTopping(option.id, e.target.checked)} />
                    <span>{option.name}</span>
                    <strong>+{inr(optionPrice(option))}</strong>
                  </label>
                ))}
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
          <button onClick={() => onAdd(line)} disabled={Number(item.stock) <= 0}><Plus size={16} /> Add to Cart</button>
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
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [modalItem, setModalItem] = useState(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [customer, setCustomer] = useState(null);

  useEffect(() => {
    setCart(readCart());
    setCartReady(true);
    setCouponCode(localStorage.getItem('pizza_house_coupon') || '');
    Promise.all([api('/theme'), api('/settings'), api('/menu')])
      .then(([t, s, m]) => {
        const uniqueItems = Array.from(new Map((m.items || []).map(item => [String(item.id), item])).values());
        setTheme(t.theme || {});
        applyTheme(t.theme || {});
        setSettings(s.settings || {});
        setCategories(m.categories || []);
        setItems(uniqueItems);
        setOptionGroups(m.option_groups || []);
      })
      .catch(err => notify(err.message, 'error'));
    if (token()) {
      api('/auth/me').then(data => {
        if (data.user?.role === 'customer') setCustomer(data.user);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (cartReady) saveCart(cart);
  }, [cart, cartReady]);

  function notify(text, type = 'info') {
    setMessage(text);
    setMessageType(type);
  }

  function defaultVariant(item) {
    return (item.variants || []).find(variant => Number(variant.is_default) === 1) || (item.variants || [])[0] || null;
  }

  function startingPrice(item) {
    const variants = item.variants || [];
    if (!variants.length) return Number(item.price || 0);
    return Math.min(...variants.map(variant => Number(variant.price)));
  }

  function categoryFallback(name = '') {
    const lower = name.toLowerCase();
    if (lower.includes('pizza') || lower.includes('veg') || lower.includes('sauce')) {
      return 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=300&q=80';
    }
    if (lower.includes('burger')) {
      return 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=300&q=80';
    }
    if (lower.includes('pasta')) {
      return 'https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5?auto=format&fit=crop&w=300&q=80';
    }
    if (lower.includes('coffee') || lower.includes('tea') || lower.includes('drink') || lower.includes('beverage') || lower.includes('mocktail') || lower.includes('shake')) {
      return 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=300&q=80';
    }
    if (lower.includes('dessert') || lower.includes('sweet')) {
      return 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=300&q=80';
    }
    return 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=300&q=80';
  }

  function categoryImage(category) {
    if (category.id === 'all') {
      return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=300&q=80';
    }
    const categoryItems = items.filter(item => String(item.category_id) === String(category.id));
    const withImage = categoryItems.find(item => item.image_url);
    if (withImage) return productImage(withImage);
    const priced = categoryItems.find(item => Number(item.price) > 0) || categoryItems[0];
    return priced?.image_url ? productImage(priced) : categoryFallback(category.name);
  }

  function hasChoices(item) {
    const variant = defaultVariant(item);
    return (item.variants || []).length > 1 || ['S', 'M', 'L'].includes(variant?.name);
  }

  function configuredSimpleItem(item) {
    const variant = defaultVariant(item);
    return {
      ...item,
      key: `${item.id}:${variant?.id || ''}:`,
      variant_id: variant?.id || null,
      variant_name: variant?.name || null,
      option_ids: [],
      options: [],
      price: Number(variant?.price ?? item.price),
      quantity: 1
    };
  }

  function addLine(line) {
    setCart(current => {
      const found = current.find(row => row.key === line.key);
      if (found) {
        return current.map(row => row.key === line.key ? { ...row, quantity: Math.min(row.quantity + line.quantity, Number(line.stock)) } : row);
      }
      return [...current, line];
    });
    setModalItem(null);
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

  function qty(key, delta) {
    setCart(current => current.map(line => (line.key || line.id) === key ? { ...line, quantity: line.quantity + delta } : line).filter(line => line.quantity > 0));
  }

  function saveCoupon(value) {
    const code = value.toUpperCase();
    setCouponCode(code);
    localStorage.setItem('pizza_house_coupon', code);
  }

  function selectCategory(id) {
    setActiveCategory(id);
    document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0);
  const selectedItems = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(item => {
      const categoryMatch = activeCategory === 'all' || String(item.category_id) === String(activeCategory);
      const queryMatch = item.name.toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q);
      return categoryMatch && queryMatch;
    });
  }, [items, search, activeCategory]);

  return (
    <div className="shell food-shell">
      <Header theme={theme} cartCount={cartCount} customer={customer} onCartOpen={() => setCartDrawerOpen(true)} />
      <main>
        <section className="food-hero">
          <div className="container food-hero-inner">
            <div>
              <span className="eyebrow">Fresh pizza, sides and drinks</span>
              <h1>{settings.restaurant_name || 'The Pizza House'}</h1>
              <p>{settings.restaurant_address || 'Order favourites for delivery or takeaway.'}</p>
            </div>
            <a className="button" href="#menu">Start Order <ChevronRight size={18} /></a>
          </div>
        </section>

        <section className="menu-sticky-bar" id="menu">
          <div className="container menu-toolbar">
            <div className="search-box"><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu" /></div>
            <div className="category-rail" aria-label="Menu categories">
              {[{ id: 'all', name: 'All' }, ...categories].map(category => (
                <button className={String(activeCategory) === String(category.id) ? 'category-tile active' : 'category-tile'} onClick={() => selectCategory(category.id)} key={category.id}>
                  <img src={categoryImage(category)} alt="" onError={event => { event.currentTarget.src = categoryFallback(category.name); }} />
                  <span>{category.name}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="container">{message ? <p className={`notice ${messageType}`}>{message}</p> : null}</div>

        <section className="container food-layout">
          <div className="menu-feed">
            <div className="feed-heading">
              <div>
                <span className="eyebrow">Menu</span>
                <h2>{activeCategory === 'all' ? 'Recommended for you' : categories.find(category => String(category.id) === String(activeCategory))?.name}</h2>
              </div>
              <span className="muted">{selectedItems.length} items</span>
            </div>

            <div className="food-list">
              {selectedItems.map((item, index) => {
                const from = startingPrice(item);
                const inCart = cart.filter(line => Number(line.id) === Number(item.id)).reduce((sum, line) => sum + line.quantity, 0);
                return (
                  <article className="food-card" key={item.id}>
                    <div className="food-card-copy">
                      <h3>{item.name}</h3>
                      <strong className="price">{(item.variants || []).length > 1 ? `From ${inr(from)}` : inr(from)}</strong>
                      <p>{item.description}</p>
                      <span className={Number(item.stock) > 0 ? 'stock-note' : 'stock-note sold-out'}>{Number(item.stock) > 0 ? 'Available now' : 'Sold out'}</span>
                    </div>
                    <div className="food-card-media">
                      <img src={productImage(item, index)} alt={item.name} />
                      <button className="add-float" onClick={() => add(item)} disabled={Number(item.stock) <= 0}>{inCart ? `ADD (${inCart})` : 'ADD'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <CartPanel cart={cart} subtotal={subtotal} couponCode={couponCode} onCoupon={saveCoupon} onQty={qty} />
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
          <CartPanel cart={cart} subtotal={subtotal} couponCode={couponCode} onCoupon={saveCoupon} onQty={qty} onClose={() => setCartDrawerOpen(false)} drawer />
        </div>
      ) : null}

      <OptionModal item={modalItem} optionGroups={optionGroups} onClose={() => setModalItem(null)} onAdd={addLine} />
      <footer className="footer"><div className="container footer-grid"><strong>The Pizza House</strong><span>{settings.restaurant_address || 'Fresh pizza delivered locally'}</span></div></footer>
    </div>
  );
}
