import { isPizzaProduct } from './product-type.mjs';

function ids(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value.map(Number).filter(id => Number.isInteger(id) && id > 0) : [];
}

export function optionAvailableForProduct(option, product, variant) {
  if (Number(option.is_active ?? 1) !== 1) return false;
  if ((option.applies_to || 'pizza') === 'pizza' && (!isPizzaProduct(product) || !['S', 'M', 'L'].includes(variant?.name))) return false;
  const categories = ids(option.category_ids);
  const products = ids(option.product_ids);
  return (!categories.length && !products.length)
    || products.includes(Number(product.id)) || categories.includes(Number(product.category_id));
}
