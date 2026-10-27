import { isPizzaProduct } from '../product-type.mjs';

export const isFreeLine = line => Boolean(line?.is_bogo_free || line?.is_manual_free);

export function staffBogoSizeCode(name = '') {
  const value = String(name).trim().toLowerCase();
  if (value === 's' || value.includes('small')) return 'S';
  if (value === 'm' || value.includes('medium')) return 'M';
  if (value === 'l' || value.includes('large')) return 'L';
  return String(name).toUpperCase();
}

export function staffBogoCapacity(offer, paidQty) {
  const buy = Math.max(1, Number(offer?.buy_qty || 1));
  const get = Math.max(1, Number(offer?.get_qty || 1));
  return Math.floor(Math.max(Number(paidQty || 0), 0) / buy) * get;
}

export function staffBogoAllowedFreeSizes(offer, paidName, weekday) {
  const paidSize = staffBogoSizeCode(paidName);
  if (offer?.staff_always_available) {
    return paidSize === 'M' ? (offer.allowed_free_sizes?.M || []).filter(size => ['M', 'S'].includes(size)) : [];
  }
  const rules = offer?.size_rules || {};
  const dayRules = (weekday && rules[weekday]) || rules.default || rules;
  if (!dayRules || !Object.keys(dayRules).length) return ['S', 'M', 'L'];
  const mapped = dayRules[paidSize];
  return mapped && ['S', 'M', 'L'].includes(staffBogoSizeCode(mapped)) ? [staffBogoSizeCode(mapped)] : [];
}

export function staffBogoOfferForLine(line, offers, weekday) {
  if (!line || !isPizzaProduct(line) || isFreeLine(line) || !['S', 'M', 'L'].includes(staffBogoSizeCode(line.variant_name))) return null;
  return (offers || []).find(offer => {
    const products = (offer.product_ids || []).map(Number);
    const categories = (offer.category_ids || []).map(Number);
    const scoped = offer.staff_always_available
      ? (!products.length && !categories.length) || products.includes(Number(line.id)) || categories.includes(Number(line.category_id))
      : products.length ? products.includes(Number(line.id)) : !categories.length || categories.includes(Number(line.category_id));
    return scoped && staffBogoAllowedFreeSizes(offer, line.variant_name, weekday).length > 0;
  }) || null;
}

export function staffBogoPairAllowed(offer, paid, free, weekday) {
  if (!offer || !paid || !free || !isPizzaProduct(free) || isFreeLine(paid) || free.is_manual_free) return false;
  if (!staffBogoOfferForLine(paid, [offer], weekday)) return false;
  if (!staffBogoAllowedFreeSizes(offer, paid.variant_name, weekday).includes(staffBogoSizeCode(free.variant_name))) return false;
  if (!Number.isFinite(Number(free.price)) || Number(free.price) > Number(paid.price)) return false;
  if (!free.order_item_id) {
    if (free.is_active !== undefined && Number(free.is_active) !== 1) return false;
    if (free.stock !== undefined && Number(free.stock) <= 0) return false;
    const variant = (free.variants || []).find(row => String(row.id) === String(free.variant_id) || row.name === free.variant_name);
    if (variant?.is_active !== undefined && Number(variant.is_active) !== 1) return false;
  }
  const products = (offer.free_product_ids || offer.product_ids || []).map(Number);
  const categories = (offer.category_ids || []).map(Number);
  if (offer.staff_always_available) {
    if (Number(free.category_id) !== Number(paid.category_id)) return false;
    const freeProducts = (offer.free_product_ids || []).map(Number);
    if (freeProducts.length) return freeProducts.includes(Number(free.id));
    const paidProducts = (offer.product_ids || []).map(Number);
    return (!paidProducts.length && !categories.length) || paidProducts.includes(Number(free.id)) || categories.includes(Number(free.category_id));
  }
  if (products.length) return products.includes(Number(free.id));
  if (categories.length) return categories.includes(Number(free.category_id));
  return Number(free.category_id) === Number(paid.category_id);
}

export function staffBogoOfferForPair(paid, free, offers, weekday) {
  return (offers || []).find(offer => staffBogoPairAllowed(offer, paid, free, weekday)) || null;
}

export function staffBogoPolicyPayload(draft) {
  if (typeof draft?.name !== 'string' || !draft.name.trim() || draft.name.trim().length > 120) throw new Error('Enter a Staff BOGO name of up to 120 characters.');
  const ids = (value, label) => {
    if (!Array.isArray(value) || value.some(id => !Number.isInteger(id) || id <= 0)) throw new Error(`Select valid ${label}.`);
    return [...new Set(value)].sort((a, b) => a - b);
  };
  const sizes = draft.allowed_free_sizes?.M;
  if (!Array.isArray(sizes) || !sizes.length || sizes.some(size => !['M', 'S'].includes(size))) throw new Error('Select Medium free, Small free, or both.');
  return {
    name: draft.name.trim(),
    category_ids: ids(draft.category_ids, 'pizza categories'),
    product_ids: ids(draft.product_ids, 'paid pizzas'),
    free_product_ids: ids(draft.free_product_ids, 'free pizzas'),
    allowed_free_sizes: { M: ['M', 'S'].filter(size => sizes.includes(size)) }
  };
}

export function staffBogoSelectionSignature(line) {
  return JSON.stringify([Number(line.id), String(line.variant_id || ''), String(line.variant_name || ''), Number(line.price), optionSelections(line)]);
}

function unchangedSavedBogoLine(line) {
  return line?.order_item_id && line.saved_bogo_signature === staffBogoSelectionSignature(line)
    && Number(line.quantity) > 0 && Number(line.quantity) <= Number(line.reserved_quantity || 0);
}

export function reconcileStaffBogoCart(lines = [], offerForLine = null, weekday = '', offerForPair = null) {
  const parents = new Map(lines.filter(line => !isFreeLine(line)).map(line => [String(line.key || line.id), line]));
  const used = new Map();
  return lines.flatMap(line => {
    if (!line.is_bogo_free) return [line];
    const key = String(line.bogo_parent_key || '');
    const parent = parents.get(key);
    if (!parent) return [];
    const offer = offerForPair ? offerForPair(parent, line) : offerForLine?.(parent);
    const savedPair = unchangedSavedBogoLine(parent) && unchangedSavedBogoLine(line);
    if (offerForLine && !staffBogoPairAllowed(offer, parent, line, weekday) && !savedPair) return [];
    const savedQuantity = lines.filter(row => row.is_bogo_free && String(row.bogo_parent_key) === key && unchangedSavedBogoLine(row)).reduce((sum, row) => sum + Number(row.reserved_quantity), 0);
    const capacity = savedPair
      ? Math.min(savedQuantity, Number(parent.quantity))
      : offer ? staffBogoCapacity(offer, parent.quantity) : Number(parent.quantity || 0);
    const quantity = Math.min(Number(line.quantity || 0), capacity - (used.get(key) || 0));
    if (quantity <= 0) return [];
    used.set(key, (used.get(key) || 0) + quantity);
    return [{ ...line, quantity }];
  });
}

export function staffOptionPrice(option, variantName) {
  if (variantName === 'S') return Number(option.small_price ?? option.fixed_price ?? 0);
  if (variantName === 'M') return Number(option.medium_price ?? option.fixed_price ?? 0);
  if (variantName === 'L') return Number(option.large_price ?? option.fixed_price ?? 0);
  return Number(option.fixed_price ?? option.small_price ?? 0);
}

export function optionSelections(line) {
  const selections = Array.isArray(line?.option_selections) ? line.option_selections : (line?.options?.length ? line.options : (line?.option_ids || []).map(id => ({ id })));
  return selections.map(option => ({ id: Number(option.id), quantity: Math.max(1, Number(option.quantity || 1)) })).filter(option => option.id > 0).sort((a, b) => a.id - b.id);
}

export function optionApplies(option, item, variantName) {
  if (option.is_active !== undefined && Number(option.is_active) !== 1) return false;
  if ((!isPizzaProduct(item) || !['S', 'M', 'L'].includes(variantName)) && option.applies_to !== 'all') return false;
  const ids = value => {
    if (Array.isArray(value)) return value.map(Number);
    try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.map(Number) : []; } catch { return []; }
  };
  const products = ids(option.product_ids);
  const categories = ids(option.category_ids);
  return (!products.length && !categories.length) || products.includes(Number(item.id)) || categories.includes(Number(item.category_id));
}

export function eligibleManualProducts(items, parent, crossCategory = false) {
  return (items || []).filter(item => isPizzaProduct(item) && (item.is_active === undefined || Number(item.is_active) === 1) && Number(item.stock) > 0 && (crossCategory || Number(item.category_id) === Number(parent?.category_id)) && (item.variants || []).some(variant => ['S', 'M', 'L'].includes(variant.name) && (variant.is_active === undefined || Number(variant.is_active) === 1)));
}

export function manualFreeRemaining(cart, parentKey) {
  const parent = cart.find(line => String(line.key) === String(parentKey) && !isFreeLine(line));
  if (!parent || !isPizzaProduct(parent) || !['S', 'M', 'L'].includes(parent.variant_name)) return 0;
  const used = cart.filter(line => line.is_manual_free && String(line.manual_parent_key) === String(parentKey)).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  return Math.max(0, Number(parent.quantity || 0) - used);
}

// Keep manual promotions independent of automatic BOGO limits and price caps.
export function reconcileManualFreeCart(lines) {
  const parents = new Map(lines.filter(line => !isFreeLine(line)).map(line => [String(line.key), line]));
  const used = new Map();
  return lines.flatMap(line => {
    if (!line.is_manual_free) return [line];
    const key = String(line.manual_parent_key || '');
    const parent = parents.get(key);
    if (!parent || !isPizzaProduct(parent) || !isPizzaProduct(line) || !['S', 'M', 'L'].includes(parent.variant_name) || !['S', 'M', 'L'].includes(line.variant_name)) return [];
    const remaining = Number(parent.quantity || 0) - (used.get(key) || 0);
    const quantity = Math.min(Number(line.quantity || 0), remaining);
    if (quantity <= 0) return [];
    used.set(key, (used.get(key) || 0) + quantity);
    return [{ ...line, quantity }];
  });
}

export function staffCartPayload(line) {
  return {
    id: line.id, variant_id: line.variant_id || null,
    option_selections: optionSelections(line), quantity: line.quantity,
    client_key: line.key || '', order_item_id: line.order_item_id || undefined,
    is_bogo_free: Boolean(line.is_bogo_free), bogo_parent_key: line.bogo_parent_key || '',
    is_manual_free: Boolean(line.is_manual_free), manual_parent_key: line.manual_parent_key || ''
  };
}

export function eligibleStaffSlabs(slabs, amount) {
  return (slabs || []).filter(slab => Number(slab.is_active) === 1 && Number(amount) >= Number(slab.min_order_amount || 0) && (slab.max_order_amount === null || slab.max_order_amount === undefined || slab.max_order_amount === '' || Number(amount) <= Number(slab.max_order_amount)));
}

export function savedStaffDeliveryCharge(order, amount) {
  if (order?.order_type !== 'delivery') return null;
  const snapshot = order.staff_delivery_snapshot;
  if (snapshot && typeof snapshot === 'object') {
    if (Number(amount) < Number(snapshot.min_order_amount || 0) || (snapshot.max_order_amount !== null && snapshot.max_order_amount !== undefined && Number(amount) > Number(snapshot.max_order_amount))) return null;
    return { ...snapshot, id: 'saved', name: `Saved: ${snapshot.name || 'Delivery charge'}`, charge: Number(snapshot.charge), is_saved: true };
  }
  // Legacy staff orders can retain their actual recorded charge, without a new rule.
  return { id: 'saved', name: 'Saved delivery charge', charge: Number(order.delivery_charge || 0), is_saved: true };
}
