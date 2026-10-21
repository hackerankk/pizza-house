import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { eligibleManualProducts, eligibleStaffSlabs, isFreeLine, manualFreeRemaining, optionApplies, optionSelections, reconcileManualFreeCart, reconcileStaffBogoCart, savedStaffDeliveryCharge, staffBogoAllowedFreeSizes, staffBogoCapacity, staffBogoOfferForLine, staffBogoOfferForPair, staffBogoPairAllowed, staffBogoPolicyPayload, staffBogoSelectionSignature, staffCartPayload, staffOptionPrice } from '../app/staff/staff-cart.mjs';

const parent = { key: 'paid:a', id: 1, category_id: 3, variant_name: 'M', quantity: 2, price: 200 };
const free = { key: 'free:a', id: 2, category_id: 3, variant_name: 'S', quantity: 1, price: 300, is_manual_free: true, manual_parent_key: parent.key };

test('manual promotion allows independent sizes and regular price above paid price', () => {
  assert.deepEqual(reconcileManualFreeCart([parent, free]), [parent, free]);
  assert.equal(manualFreeRemaining([parent, free], parent.key), 1);
  assert.equal(isFreeLine(free), true);
  assert.equal(isFreeLine({ ...free, is_manual_free: false, is_bogo_free: true }), true);
});

test('manual free capacity cannot duplicate free quantities and removal prunes children', () => {
  const lines = reconcileManualFreeCart([parent, free, { ...free, key: 'free:b', quantity: 2 }, { ...free, key: 'free:c' }]);
  assert.equal(lines.filter(line => line.is_manual_free).reduce((sum, line) => sum + line.quantity, 0), 2);
  assert.equal(manualFreeRemaining(lines, parent.key), 0);
  assert.deepEqual(reconcileManualFreeCart([free]), []);
  assert.deepEqual(reconcileManualFreeCart([{ ...parent, quantity: 0 }, free]), [{ ...parent, quantity: 0 }]);
  const automatic = { ...free, key: 'auto:a', is_manual_free: false, is_bogo_free: true };
  assert.deepEqual(reconcileManualFreeCart([parent, free, automatic]).at(-1), automatic);
});

test('free picker respects availability, valid sizes and separate cross-category permission', () => {
  const pizza = { id: 2, category_id: 3, is_active: 1, stock: 4, variants: [{ id: 11, name: 'S' }, { id: 12, name: 'M' }] };
  const products = [pizza, { ...pizza, id: 3, category_id: 5 }, { ...pizza, id: 4, stock: 0 }, { ...pizza, id: 5, is_active: 0 }, { ...pizza, id: 6, variants: [{ name: 'Premium' }] }];
  assert.deepEqual(eligibleManualProducts(products, parent).map(item => item.id), [2]);
  assert.deepEqual(eligibleManualProducts(products, parent, true).map(item => item.id), [2, 3]);
});

test('topping prices, quantities and scope match chosen pizza independently', () => {
  const option = { id: 8, is_active: 1, applies_to: 'pizza', small_price: 10, medium_price: 20, large_price: 30, product_ids: '[1]', category_ids: '[7]' };
  assert.equal(staffOptionPrice(option, 'M'), 20);
  assert.equal(optionApplies(option, { id: 1, category_id: 9 }, 'M'), true);
  assert.equal(optionApplies(option, { id: 99, category_id: 7 }, 'S'), true);
  assert.equal(optionApplies(option, { id: 99, category_id: 9 }, 'L'), false);
  assert.equal(optionApplies({ ...option, is_active: 0 }, parent, 'M'), false);
  assert.equal(optionApplies(option, parent, 'Premium'), false);
  assert.deepEqual(optionSelections({ options: [{ id: 8, quantity: 3, price: 20 }] }), [{ id: 8, quantity: 3 }]);
  const a = { ...parent, option_selections: [{ id: 8, quantity: 3 }] };
  const b = { ...parent, key: 'paid:b', option_selections: [] };
  assert.deepEqual(staffCartPayload(a).option_selections, [{ id: 8, quantity: 3 }]);
  assert.deepEqual(staffCartPayload(b).option_selections, []);
});

test('existing order identity and manual relationship survive the edit payload', () => {
  const payload = staffCartPayload({ ...free, order_item_id: 501, option_selections: [{ id: 9, quantity: 2 }] });
  assert.equal(payload.order_item_id, 501);
  assert.equal(payload.client_key, free.key);
  assert.equal(payload.manual_parent_key, parent.key);
  assert.equal(payload.is_manual_free, true);
  assert.equal(Object.hasOwn(payload, 'price'), false);
  assert.equal(Object.hasOwn(payload, 'total'), false);
});

test('only configured active delivery charges matching discounted order amount are selectable', () => {
  const slabs = [{ id: 1, is_active: 1, min_order_amount: 0, max_order_amount: 499, charge: 30 }, { id: 2, is_active: 1, min_order_amount: 500, max_order_amount: null, charge: 0 }, { id: 3, is_active: 0, charge: 20 }];
  assert.deepEqual(eligibleStaffSlabs(slabs, 400).map(slab => slab.id), [1]);
  assert.deepEqual(eligibleStaffSlabs(slabs, 500).map(slab => slab.id), [2]);
  assert.deepEqual(eligibleStaffSlabs([], 500), []);
});

test('editing retains actual saved delivery prices without inventing a replacement rule', () => {
  assert.equal(savedStaffDeliveryCharge({ order_type: 'takeaway' }, 100), null);
  assert.equal(savedStaffDeliveryCharge({ order_type: 'delivery', delivery_charge: '45.00' }, 100).charge, 45);
  const order = { order_type: 'delivery', delivery_charge: 45, staff_delivery_snapshot: { id: 9, name: 'Old staff charge', charge: 45, min_order_amount: 100, max_order_amount: 200 } };
  assert.equal(savedStaffDeliveryCharge(order, 150).id, 'saved');
  assert.equal(savedStaffDeliveryCharge(order, 99), null);
  assert.equal(savedStaffDeliveryCharge(order, 201), null);
});

const permanentBogo = { id: 0, name: 'Staff BOGO · Every day', staff_always_available: true, buy_qty: 1, get_qty: 1, allowed_free_sizes: { M: ['M', 'S'] }, product_ids: [], category_ids: [], free_product_ids: [], size_rules: {} };
const automaticSmall = { key: 'bogo:a', id: 2, category_id: 3, variant_name: 'S', quantity: 1, price: 100, stock: 10, is_active: 1, is_bogo_free: true, bogo_parent_key: parent.key };

test('authenticated permanent staff policy offers Medium or Small throughout all seven days', () => {
  for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
    assert.equal(staffBogoOfferForLine(parent, [permanentBogo], day), permanentBogo);
    assert.deepEqual(staffBogoAllowedFreeSizes(permanentBogo, 'Medium', day), ['M', 'S']);
    assert.equal(staffBogoPairAllowed(permanentBogo, parent, automaticSmall, day), true);
    assert.equal(staffBogoPairAllowed(permanentBogo, parent, { ...automaticSmall, variant_name: 'M', price: 200 }, day), true);
  }
  assert.equal(staffBogoOfferForLine(parent, [], 'monday'), null);
  assert.equal(staffBogoOfferForLine(parent, [permanentBogo], 'monday').id, 0);
});

test('permanent BOGO only qualifies paid Medium and rejects Large or manual-free children', () => {
  for (const size of ['S', 'L', 'Normal', 'Premium']) assert.equal(staffBogoOfferForLine({ ...parent, variant_name: size }, [permanentBogo], 'monday'), null);
  assert.equal(staffBogoOfferForLine({ ...parent, is_manual_free: true }, [permanentBogo], 'monday'), null);
  assert.equal(staffBogoPairAllowed(permanentBogo, parent, { ...automaticSmall, variant_name: 'L' }, 'monday'), false);
  assert.equal(staffBogoPairAllowed(permanentBogo, parent, free, 'monday'), false);
});

test('automatic free selection retains category, price and availability safeguards', () => {
  for (const patch of [{ category_id: 9 }, { price: 201 }, { price: NaN }, { stock: 0 }, { is_active: 0 }, { variant_id: 8, variants: [{ id: 8, name: 'S', is_active: 0 }] }]) {
    assert.equal(staffBogoPairAllowed(permanentBogo, parent, { ...automaticSmall, ...patch }, 'monday'), false);
  }
  // An unchanged existing-order snapshot may retain an archived product/size.
  assert.equal(staffBogoPairAllowed(permanentBogo, parent, { ...automaticSmall, stock: 0, is_active: 0, order_item_id: 7 }, 'monday'), true);
});

test('Medium and Small free lines share one total BOGO slot per paid quantity', () => {
  const offerForLine = line => staffBogoOfferForLine(line, [permanentBogo], 'monday');
  const medium = { ...automaticSmall, key: 'bogo:m', variant_name: 'M', price: 180 };
  const extra = { ...automaticSmall, key: 'bogo:extra', quantity: 5 };
  const result = reconcileStaffBogoCart([parent, automaticSmall, medium, extra, free], offerForLine, 'monday');
  assert.deepEqual(result.filter(line => line.is_bogo_free).map(line => line.key), ['bogo:a', 'bogo:m']);
  assert.equal(result.filter(line => line.is_bogo_free).reduce((sum, line) => sum + line.quantity, 0), 2);
  assert.equal(result.at(-1), free);
  assert.equal(staffBogoCapacity(permanentBogo, 2), 2);
  assert.equal(reconcileStaffBogoCart([{ ...parent, quantity: 1 }, automaticSmall, medium], offerForLine, 'monday').length, 2);
  assert.deepEqual(reconcileStaffBogoCart([automaticSmall], offerForLine, 'monday'), []);
  assert.equal(reconcileStaffBogoCart([parent, { ...automaticSmall, variant_name: 'L' }], offerForLine, 'monday').length, 1);
});

test('scheduled public offer sizes and scope remain independent from permanent staff BOGO', () => {
  const publicOffer = { id: 9, buy_qty: 2, get_qty: 1, product_ids: [1, 2], free_product_ids: [1, 2], category_ids: [], size_rules: { monday: { M: 'L', L: 'S' }, tuesday: { M: 'M' } } };
  const offers = [permanentBogo, publicOffer];
  assert.equal(staffBogoOfferForLine(parent, offers, 'monday'), permanentBogo);
  const large = { ...automaticSmall, variant_name: 'L', price: 150 };
  assert.equal(staffBogoOfferForPair(parent, large, offers, 'monday'), publicOffer);
  assert.equal(staffBogoOfferForPair(parent, large, offers, 'tuesday'), null);
  assert.equal(staffBogoOfferForLine({ ...parent, variant_name: 'L' }, offers, 'monday'), publicOffer);
  assert.equal(staffBogoPairAllowed(publicOffer, parent, { ...large, id: 99 }, 'monday'), false);
  const result = reconcileStaffBogoCart([parent, large], line => staffBogoOfferForLine(line, offers, 'monday'), 'monday', (paid, bonus) => staffBogoOfferForPair(paid, bonus, offers, 'monday'));
  assert.equal(result.length, 2);
});

test('saved Staff scopes combine categories and paid products without changing public scope precedence', () => {
  const policy = { ...permanentBogo, category_ids: [8], product_ids: [1] };
  assert.equal(staffBogoOfferForLine(parent, [policy], 'monday'), policy);
  assert.equal(staffBogoOfferForLine({ ...parent, id: 99, category_id: 8 }, [policy], 'monday'), policy);
  assert.equal(staffBogoOfferForLine({ ...parent, id: 99, category_id: 3 }, [policy], 'monday'), null);
  const publicOffer = { ...policy, staff_always_available: false };
  assert.equal(staffBogoOfferForLine({ ...parent, id: 99, category_id: 8 }, [publicOffer], 'monday'), null);
});

test('saved free-product choices and free sizes apply within the paid category and price ceiling', () => {
  const selected = { ...permanentBogo, product_ids: [1], free_product_ids: [2], allowed_free_sizes: { M: ['S'] } };
  assert.equal(staffBogoPairAllowed(selected, parent, automaticSmall, 'monday'), true);
  assert.equal(staffBogoPairAllowed(selected, parent, { ...automaticSmall, id: 3 }, 'monday'), false);
  assert.equal(staffBogoPairAllowed(selected, parent, { ...automaticSmall, category_id: 8 }, 'monday'), false);
  assert.equal(staffBogoPairAllowed(selected, parent, { ...automaticSmall, price: 201 }, 'monday'), false);
  assert.equal(staffBogoPairAllowed(selected, parent, { ...automaticSmall, variant_name: 'M' }, 'monday'), false);
  const sameScope = { ...selected, free_product_ids: [] };
  assert.equal(staffBogoPairAllowed(sameScope, parent, automaticSmall, 'monday'), false);
  assert.equal(staffBogoPairAllowed({ ...sameScope, category_ids: [3] }, parent, automaticSmall, 'monday'), true);
  assert.equal(staffBogoPairAllowed({ ...sameScope, product_ids: [1, 2] }, parent, automaticSmall, 'monday'), true);
  assert.equal(staffBogoPairAllowed(permanentBogo, parent, automaticSmall, 'monday'), true);
});

test('Staff rule payload includes only editable fields and rejects invalid size or ID input', () => {
  const draft = { ...permanentBogo, name: '  Counter pizza offer  ', product_ids: [2, 1, 2], allowed_free_sizes: { M: ['S', 'M', 'S'], L: ['L'] }, buy_qty: 99, weekdays: ['monday'], secret: 'not sent' };
  const payload = staffBogoPolicyPayload(draft);
  assert.deepEqual(payload, { name: 'Counter pizza offer', category_ids: [], product_ids: [1, 2], free_product_ids: [], allowed_free_sizes: { M: ['M', 'S'] } });
  assert.deepEqual(Object.keys(payload), ['name', 'category_ids', 'product_ids', 'free_product_ids', 'allowed_free_sizes']);
  for (const patch of [{ name: '' }, { name: 'x'.repeat(121) }, { product_ids: ['1'] }, { category_ids: [0] }, { free_product_ids: [1.5] }, { allowed_free_sizes: { M: [] } }, { allowed_free_sizes: { M: ['L'] } }]) {
    assert.throws(() => staffBogoPolicyPayload({ ...draft, ...patch }));
  }
});

test('new rules prune unsaved free choices but preserve unchanged placed-order snapshots', () => {
  const saved = line => ({ ...line, order_item_id: line.is_bogo_free ? 82 : 81, reserved_quantity: line.quantity, saved_bogo_signature: staffBogoSelectionSignature(line) });
  const paid = saved(parent);
  const child = saved(automaticSmall);
  const changedPolicy = { ...permanentBogo, product_ids: [999] };
  const reconcile = lines => reconcileStaffBogoCart(lines, line => staffBogoOfferForLine(line, [changedPolicy], 'monday'), 'monday', (paid, free) => staffBogoOfferForPair(paid, free, [changedPolicy], 'monday'));
  assert.equal(reconcile([parent, automaticSmall]).length, 1);
  assert.deepEqual(reconcile([paid, child]), [paid, child]);
  assert.equal(reconcile([{ ...paid, quantity: 1 }, child]).length, 2);
  for (const patch of [{ variant_id: 77 }, { variant_name: 'L' }, { id: 13 }, { price: 205 }, { option_selections: [{ id: 5, quantity: 1 }] }, { quantity: 3 }]) assert.equal(reconcile([{ ...paid, ...patch }, child]).length, 1);
  assert.equal(reconcile([paid, { ...child, quantity: 2 }]).length, 1);
  assert.equal(reconcile([paid, { ...child, variant_name: 'M' }]).length, 1);
  assert.equal(reconcile([paid, { ...child, price: 99 }]).length, 1);
  assert.equal(reconcile([child]).length, 0);
  assert.equal(reconcile([parent, { ...automaticSmall, order_item_id: 82 }]).length, 1);
});

test('Admin and Staff permission defaults do not grant Staff BOGO rule management', () => {
  const admin = readFileSync(new URL('../app/_secure/AdminPanel.jsx', import.meta.url), 'utf8');
  const definitions = admin.slice(admin.indexOf('const staffPermissionLabels ='), admin.indexOf('const featureControlLabels ='));
  assert.equal(vm.runInNewContext(`${definitions}\ndefaultStaffPermissions.manage_staff_bogo`), false);
  const staff = readFileSync(new URL('../app/staff/page.jsx', import.meta.url), 'utf8');
  const start = staff.indexOf('const defaultStaffPermissions =');
  const declaration = staff.slice(start, staff.indexOf('};', start) + 2);
  assert.equal(vm.runInNewContext(`${declaration}\ndefaultStaffPermissions.manage_staff_bogo`), false);
});
