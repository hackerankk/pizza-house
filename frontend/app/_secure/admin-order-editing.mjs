import { isPizzaProduct } from '../product-type.mjs';

// Keep order identities and recorded option quantities intact while Admin edits.
export function idList(value) {
  let list = value;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { list = []; }
  }
  return Array.isArray(list) ? [...new Set(list.map(Number).filter(id => Number.isInteger(id) && id > 0))] : [];
}

export function optionAppliesTo(option, product, variantName) {
  if (!product || Number(option.is_active ?? 1) !== 1) return false;
  if ((option.applies_to || 'pizza') === 'pizza' && (!isPizzaProduct(product) || !['S', 'M', 'L'].includes(variantName))) return false;
  const categories = idList(option.category_ids);
  const products = idList(option.product_ids);
  return (!categories.length && !products.length) || categories.includes(Number(product.category_id)) || products.includes(Number(product.id));
}

export function normalizedSelections(selections = []) {
  return selections.map(option => ({ id: Number(option.id), quantity: Number(option.quantity ?? 1) })).sort((a, b) => a.id - b.id);
}

export function selectionSignature(line) {
  return JSON.stringify([String(line.variant_id || ''), normalizedSelections(line.option_selections)]);
}

export function editableLine(item) {
  const meta = item.selection_meta || {};
  const options = meta.options || [];
  const line = {
    rowKey: item.client_key || meta.client_key || `existing-${item.id}`,
    order_item_id: Number(item.id),
    id: Number(item.menu_item_id),
    name: item.name_snapshot,
    variant_id: item.variant_id || '',
    variant_name: item.variant_snapshot || '',
    option_selections: normalizedSelections(options),
    quantity: Math.max(1, Number(item.quantity || 1)),
    is_bogo_free: Boolean(item.is_bogo_free),
    bogo_parent_key: item.bogo_parent_key || '',
    is_manual_free: Boolean(item.is_manual_free || meta.manual_free?.is_free),
    manual_parent_key: item.manual_parent_key || meta.manual_free?.parent_key || '',
    originalOptions: options,
    originalUnitPrice: Number(item.manual_original_price ?? meta.manual_free?.original_price ?? item.bogo_original_price ?? item.unit_price ?? 0),
  };
  line.originalSignature = selectionSignature(line);
  return line;
}

export function orderLinePayload(line) {
  return {
    id: line.id,
    order_item_id: line.order_item_id || null,
    variant_id: line.variant_id || null,
    option_selections: normalizedSelections(line.option_selections),
    quantity: line.quantity,
    client_key: line.rowKey,
    is_bogo_free: Boolean(line.is_bogo_free),
    bogo_parent_key: line.bogo_parent_key || '',
    is_manual_free: Boolean(line.is_manual_free),
    manual_parent_key: line.manual_parent_key || '',
  };
}

export function removeLineAndFreeChildren(lines, rowKey) {
  return lines.filter(line => line.rowKey !== rowKey && line.bogo_parent_key !== rowKey && line.manual_parent_key !== rowKey);
}
