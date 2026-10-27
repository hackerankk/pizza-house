import test from 'node:test';
import assert from 'node:assert/strict';
import { optionAvailableForProduct } from '../app/option-availability.mjs';

test('customer option choices follow the same existing-product/category restrictions as staff and PHP', () => {
  const pizza = { id: 5, is_pizza: true, category_id: 2 }, medium = { name: 'M' };
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza' }, pizza, medium), true);
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza', product_ids: '[5]' }, pizza, medium), true);
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza', category_ids: [2], product_ids: [9] }, pizza, medium), true);
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza', category_ids: '[8]', product_ids: [9] }, pizza, medium), false);
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza', product_ids: [5], is_active: 0 }, pizza, medium), false);
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza' }, pizza, { name: 'Premium' }), false);
  assert.equal(optionAvailableForProduct({ applies_to: 'all' }, pizza, { name: 'Premium' }), true);
});

 test('legacy S/M/L variants never turn burgers or ice cream into pizza', () => {
  for (const product of [{ name: 'Spicy Burger', category_slug: 'burgers' }, { name: 'Vanilla Cone', category_slug: 'ice-cream' }, { name: 'Fresh Veggie', category_slug: 'classic-veg', is_pizza: false }]) {
    for (const name of ['S', 'M', 'L']) assert.equal(optionAvailableForProduct({ applies_to: 'pizza' }, product, { name }), false);
    assert.equal(optionAvailableForProduct({ applies_to: 'all' }, product, { name: 'S' }), true);
  }
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza' }, { name: 'Fresh Veggie', category_slug: 'classic-veg' }, { name: 'M' }), true);
 });
