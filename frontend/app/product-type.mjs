const pizzaCategories = new Set(['pizza', 'pizzas', 'simply-veg', 'classic-veg', 'veg-special', 'different-sauce', 'premium-pizza', 'pizza-mania']);
const normalize = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function isPizzaProduct(product = {}) {
  if (product.is_pizza !== undefined) return product.is_pizza === true || Number(product.is_pizza) === 1;
  const category = normalize(product.category_slug || product.category_name);
  if (pizzaCategories.has(category)) return true;
  if (/(^|-)(burger|burgers|beverages|drinks|coffee|tea|shakes|mocktails|dessert|desserts|ice-cream|momos|dip|fries|bread|pasta|combo|combos)(-|$)/.test(category)) return false;
  // Variant letters alone are not product types: drinks and ice cream also use S/M/L.
  return /(^|[^a-z])pizzas?([^a-z]|$)/i.test(`${product.name || ''} ${product.category_name || ''} ${category}`);
}
