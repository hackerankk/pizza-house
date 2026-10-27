import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { editableLine, idList, optionAppliesTo, orderLinePayload, removeLineAndFreeChildren, selectionSignature } from '../app/_secure/admin-order-editing.mjs';

const source = readFileSync(new URL('../app/_secure/AdminPanel.jsx', import.meta.url), 'utf8');
function normalize(active, form, editing = null) {
  const body = source.match(/^  function normalizedResourcePayload\([^\n]*\) \{[\s\S]*?^  \}/m)?.[0];
  assert.ok(body);
  return JSON.parse(JSON.stringify(new vm.Script(`(${body})()`).runInNewContext({ active, form, editing, idList })));
}

test('Admin edit payload preserves separate promotion identity and recorded topping quantities', () => {
  const line = editableLine({ id: 81, menu_item_id: 9, name_snapshot: 'Existing pizza', variant_id: 3, variant_snapshot: 'S', quantity: 2, unit_price: 0,
    client_key: 'free-child', is_manual_free: true, manual_parent_key: 'paid-parent', manual_original_price: 135,
    selection_meta: { options: [{ id: 12, name: 'Saved topping', price: 10, quantity: 3 }] } });
  assert.equal(line.originalUnitPrice, 135);
  const payload = orderLinePayload(line);
  assert.equal(payload.order_item_id, 81);
  assert.equal(payload.client_key, 'free-child');
  assert.equal(payload.is_manual_free, true);
  assert.equal(payload.manual_parent_key, 'paid-parent');
  assert.equal(payload.is_bogo_free, false);
  assert.deepEqual(payload.option_selections, [{ id: 12, quantity: 3 }]);
  assert.equal(selectionSignature({ ...line, quantity: 1 }), line.originalSignature, 'Changing item count retains recorded per-unit prices');
  assert.notEqual(selectionSignature({ ...line, option_selections: [{ id: 12, quantity: 2 }] }), line.originalSignature);
  assert.notEqual(selectionSignature({ ...line, variant_id: 8 }), line.originalSignature);
  assert.equal('manual_original_price' in payload, false, 'The server, rather than the submitted price, authorizes the promotion');
});

test('removing a paid line removes only its own linked free children', () => {
  const lines = [{ rowKey: 'paid' }, { rowKey: 'manual', manual_parent_key: 'paid' }, { rowKey: 'auto', bogo_parent_key: 'paid' }, { rowKey: 'other' }, { rowKey: 'other-free', manual_parent_key: 'other' }];
  assert.deepEqual(removeLineAndFreeChildren(lines, 'paid').map(line => line.rowKey), ['other', 'other-free']);
  assert.deepEqual(removeLineAndFreeChildren(lines, 'manual').map(line => line.rowKey), ['paid', 'auto', 'other', 'other-free']);
});

test('option filtering honors pizza type, active status and category or specific-product eligibility', () => {
  const product = { id: 9, is_pizza: true, category_id: 4 };
  assert.equal(optionAppliesTo({ applies_to: 'pizza' }, product, 'M'), true);
  assert.equal(optionAppliesTo({ applies_to: 'pizza' }, product, 'Premium'), false);
  assert.equal(optionAppliesTo({ applies_to: 'all', category_ids: '[4]', product_ids: [9] }, product, 'Premium'), true);
  assert.equal(optionAppliesTo({ applies_to: 'all', category_ids: [5], product_ids: [9] }, product, 'M'), true);
  assert.equal(optionAppliesTo({ applies_to: 'all', category_ids: [4], product_ids: [10] }, product, 'M'), true);
  assert.equal(optionAppliesTo({ applies_to: 'all', category_ids: [5], product_ids: [10] }, product, 'M'), false);
  assert.equal(optionAppliesTo({ applies_to: 'all', is_active: 0 }, product, 'M'), false);
});

test('Staff charge form requires an actual configured charge and supports an open upper bound', () => {
  assert.throws(() => normalize('staff-delivery-slabs', { name: 'Configured zone', charge: '' }), /Enter the configured/);
  assert.throws(() => normalize('staff-delivery-slabs', { name: 'Configured zone', min_order_amount: 200, max_order_amount: 100, charge: 10 }), /Maximum order/);
  assert.throws(() => normalize('staff-delivery-slabs', { name: 'Configured zone', charge: -1 }), /non-negative/);
  const result = normalize('staff-delivery-slabs', { name: ' Actual business rule ', min_order_amount: '0', max_order_amount: '', charge: '0', is_active: '0' });
  assert.equal(result.name, 'Actual business rule');
  assert.equal(result.max_order_amount, null);
  assert.equal(result.charge, 0);
  assert.equal(result.is_active, 0);
});

test('topping form retains independent size prices, type and restricted applicability', () => {
  const result = normalize('toppings', { name: 'Existing option', group_name: 'Add-On', applies_to: 'all', fixed_price: '10', small_price: '0', medium_price: '15', large_price: '', category_ids: [4], product_ids: [9, 9], is_active: '1' });
  assert.equal(result.fixed_price, 10);
  assert.equal(result.small_price, 0);
  assert.equal(result.medium_price, 15);
  assert.equal(result.large_price, null);
  assert.equal(result.group_name, 'Add-On');
  assert.equal(result.category_ids, '[4]');
  assert.equal(result.product_ids, '[9]');
  assert.throws(() => normalize('toppings', { name: 'Unpriced option' }), /base price or at least one size price/);
  assert.throws(() => normalize('toppings', { name: 'Missing price for a size', small_price: 10 }), /Set a base price/);
  assert.throws(() => normalize('toppings', { name: 'Missing base for other products', applies_to: 'all', small_price: 10, medium_price: 15, large_price: 20 }), /Set a base price/);
  assert.equal(normalize('toppings', { name: 'Sizes only', small_price: 10, medium_price: 15, large_price: 20 }).fixed_price, null);
});
