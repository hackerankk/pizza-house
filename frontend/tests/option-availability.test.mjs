import test from 'node:test';
import assert from 'node:assert/strict';
import { optionAvailableForProduct } from '../app/option-availability.mjs';

test('customer option choices follow the same existing-product/category restrictions as staff and PHP', () => {
  const pizza = { id: 5, category_id: 2 }, medium = { name: 'M' };
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza' }, pizza, medium), true);
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza', product_ids: '[5]' }, pizza, medium), true);
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza', category_ids: [2], product_ids: [9] }, pizza, medium), true);
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza', category_ids: '[8]', product_ids: [9] }, pizza, medium), false);
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza', product_ids: [5], is_active: 0 }, pizza, medium), false);
  assert.equal(optionAvailableForProduct({ applies_to: 'pizza' }, pizza, { name: 'Premium' }), false);
  assert.equal(optionAvailableForProduct({ applies_to: 'all' }, pizza, { name: 'Premium' }), true);
});
