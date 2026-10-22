import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Intentionally creates isolated test orders; never point this at business data.
// Credentials must be supplied explicitly and are never logged.
const base = process.env.PIZZA_STAFF_FEATURE_API_URL;
if (!base || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base)
  || process.env.PIZZA_STAFF_FEATURE_DISPOSABLE !== 'yes') {
  throw new Error('Set a loopback PIZZA_STAFF_FEATURE_API_URL and PIZZA_STAFF_FEATURE_DISPOSABLE=yes for an isolated database.');
}
const email = process.env.PIZZA_TEST_ADMIN_EMAIL;
const password = process.env.PIZZA_TEST_ADMIN_PASSWORD;
assert.ok(email && password, 'Explicit disposable admin credentials required');
const seed = randomBytes(6).toString('hex');
const created = { products: [], toppings: [], slabs: [], offers: [], staff: null };
let adminToken = '', staffToken = '';
let checks = 0;
async function request(path, method = 'GET', body, token = adminToken, status = 200, key) {
  const response = await fetch(base + path, {
    method, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'X-Idempotency-Key': key } : {}),
    }, body: body ? JSON.stringify(body) : undefined,
  });
  const value = (response.headers.get('content-type') || '').includes('application/json')
    ? await response.json() : await response.text();
  assert.equal(response.status, status, `${method} ${path}: ${typeof value === 'string' ? value.slice(0, 120) : `${value.error || ''} ${value.field || ''}`}`);
  return value;
}
function pass(label) { ++checks; console.log(`PASS: ${label}`); }
const permissions = { create_orders: true, edit_orders: true, view_reports: true, apply_free_pizza: false, free_pizza_cross_category: false };
async function setPermissions(patch) {
  Object.assign(permissions, patch);
  await request(`/admin/staff/${created.staff}`, 'PUT', { permissions });
}
async function createOrder(items, patch = {}, status = 201, key = `feature-${randomBytes(8).toString('hex')}`) {
  const payload = { order_type: 'takeaway', payment_method: 'cash', items, ...patch };
  return { result: await request('/staff/orders', 'POST', payload, staffToken, status, key), payload, key };
}
function itemPayload(item) {
  return {
    id: Number(item.menu_item_id), order_item_id: Number(item.id), variant_id: Number(item.variant_id),
    quantity: Number(item.quantity), client_key: item.client_key || item.selection_meta?.client_key || `existing-${item.id}`,
    option_selections: (item.selection_meta?.options || []).map(option => ({ id: Number(option.id), quantity: Number(option.quantity || 1) })),
    is_bogo_free: Boolean(item.is_bogo_free), bogo_parent_key: item.bogo_parent_key || '',
    is_manual_free: Boolean(item.is_manual_free), manual_parent_key: item.manual_parent_key || '',
  };
}
try {
  adminToken = (await request('/auth/admin-login', 'POST', { email, password }, '', 200)).token;
  const menu = await request('/menu');
  const categories = menu.categories || [];
  assert.ok(categories.length >= 2, 'Fixture needs two existing categories');
  const staffPassword = randomBytes(16).toString('hex');
  const staffEmail = `staff-feature-${seed}@example.test`;
  const newStaff = await request('/admin/staff', 'POST', { name: `Staff feature ${seed}`, phone: '0000000000', email: staffEmail, password: staffPassword, permissions }, adminToken, 201);
  created.staff = Number(newStaff.staff.id);
  staffToken = (await request('/auth/staff-login', 'POST', { email: staffEmail, password: staffPassword }, '', 200)).token;
  async function product(label, category, prices) {
    const result = await request('/admin/products', 'POST', { name: `${label} ${seed}`, category_id: Number(category.id), price: prices.S, size_prices: prices, stock: 500, is_active: 1 }, adminToken, 201);
    created.products.push(result.id);
    const fresh = await request('/menu');
    return fresh.items.find(row => Number(row.id) === Number(result.id));
  }
  const paid = await product('Paid feature pizza', categories[0], { S: 100, M: 200, L: 300 });
  const free = await product('Free feature pizza', categories[0], { S: 80, M: 180, L: 500 });
  const cross = await product('Cross category pizza', categories[1], { S: 75, M: 150, L: 250 });
  const variant = (product, size) => Number(product.variants.find(row => row.name === size).id);
  const paidLine = () => ({ id: Number(paid.id), variant_id: variant(paid, 'M'), quantity: 1, client_key: 'paid-feature' });
  const freeLine = (size = 'M', product = free) => ({ id: Number(product.id), variant_id: variant(product, size), quantity: 1, client_key: `manual-${product.id}-${size}`, is_manual_free: true, manual_parent_key: 'paid-feature' });
  const slab = await request('/admin/staff-delivery-slabs', 'POST', { name: `Feature delivery ${seed}`, min_order_amount: 0, max_order_amount: null, charge: 37, priority: 987, is_active: 1 }, adminToken, 201);
  created.slabs.push(slab.id);
  const topping = await request('/admin/toppings', 'POST', { name: `Feature cheese ${seed}`, group_name: 'Pizza Topping', fixed_price: 3, small_price: 5, medium_price: 10, large_price: 15, applies_to: 'pizza', product_ids: JSON.stringify([Number(paid.id)]), category_ids: '[]', is_active: 1 }, adminToken, 201);
  created.toppings.push(topping.id);
  const addon = await request('/admin/toppings', 'POST', { name: `Feature add-on ${seed}`, group_name: 'Add-On', fixed_price: 4, applies_to: 'all', category_ids: JSON.stringify([Number(categories[0].id)]), product_ids: '[]', is_active: 1 }, adminToken, 201);
  created.toppings.push(addon.id);
  const available = await request('/staff/delivery-slabs', 'GET', undefined, staffToken);
  assert.ok((available.items || available.slabs || []).some(row => Number(row.id) === Number(slab.id)));
  pass('Admin configures separate staff delivery slabs and existing topping/add-on groups');
  await setPermissions({ create_orders: false });
  await request('/staff/delivery-slabs', 'GET', undefined, staffToken);
  await createOrder([paidLine()], {}, 403);
  await setPermissions({ create_orders: true });
  pass('Edit-only Staff can read configured charges without gaining create-order access');

  await createOrder([paidLine(), freeLine()], {}, 403);
  await setPermissions({ apply_free_pizza: true });
  await createOrder([paidLine(), freeLine('M', cross)], {}, 403);
  pass('API enforces manual free and cross-category permissions');
  for (const size of ['M', 'S', 'L']) {
    const { result } = await createOrder([paidLine(), freeLine(size)], { order_type: 'delivery', delivery_address: 'Isolated test address, landmark', staff_delivery_slab_id: Number(slab.id) });
    assert.equal(Number(result.order.total_amount), 237);
    assert.equal(Number(result.order.delivery_charge), 37);
    assert.equal(result.order.latitude, null); assert.equal(result.order.longitude, null); assert.equal(result.order.distance_km, null);
    const details = await request(`/staff/orders/${result.order.id}/edit`, 'GET', undefined, staffToken);
    const bonus = details.items.find(row => row.is_manual_free);
    assert.ok(bonus); assert.equal(Number(bonus.unit_price), Number(free.variants.find(row => row.name === size).price));
    assert.equal(Number(bonus.payable_line_total), 0);
    assert.equal(Number(result.order.discount_amount), Number(bonus.unit_price));
    pass(`Medium paid + ${size} free uses independent size, regular price and zero payable with coordinate-free delivery`);
  }
  await setPermissions({ free_pizza_cross_category: true });
  const crossResult = await createOrder([paidLine(), freeLine('M', cross)]);
  assert.equal(Number(crossResult.result.order.total_amount), 200);
  pass('Authorized cross-category manual free pizza succeeds');
  await setPermissions({ apply_manual_discount: true });
  const offer = await request('/admin/offers', 'POST', { name: `Manual exclusion ${seed}`, offer_type: 'bogo', scope: 'category', scope_id: Number(categories[0].id), category_ids: JSON.stringify([Number(categories[0].id)]), product_ids: '[]', weekdays: '[]', size_rules: '{}', buy_qty: 2, get_qty: 1, is_active: 1 }, adminToken, 201);
  created.offers.push(offer.id);
  await createOrder([paidLine(), freeLine()], { discount_type: 'bogo', offer_id: Number(offer.id) }, 422);
  await request(`/admin/offers/${offer.id}`, 'PUT', { is_active: 0 });
  pass('Manual free pizzas cannot count as paid qualifiers for existing Staff BOGO discounts');
  await createOrder([paidLine(), freeLine(), { ...freeLine('S'), client_key: 'extra-bonus' }], {}, 422);
  await createOrder([paidLine(), { ...paidLine() }], {}, 422);
  await createOrder([freeLine()], {}, 422);
  pass('Duplicate capacity, duplicate paid keys and orphan free items are rejected');
  await request('/cart/validate', 'POST', { order_type: 'takeaway', items: [paidLine(), freeLine()] }, '', 403);
  pass('Customer cart cannot apply staff-only free-item flags');

  const toppingLine = { ...paidLine(), option_selections: [{ id: Number(topping.id), quantity: 2 }, { id: Number(addon.id), quantity: 1 }] };
  const first = await createOrder([toppingLine, freeLine('S')], { order_type: 'delivery', delivery_address: 'Isolated address', staff_delivery_slab_id: Number(slab.id), payment_method: 'split', cash_received: 25, online_received: 75 });
  const orderId = Number(first.result.order.id);
  assert.equal(Number(first.result.order.total_amount), 261);
  assert.equal(Number(first.result.order.paid_amount), 100); assert.equal(Number(first.result.order.remaining_amount), 161);
  const repeated = await request('/staff/orders', 'POST', first.payload, staffToken, 200, first.key);
  assert.equal(Number(repeated.order.id), orderId); assert.equal(repeated.duplicate, true);
  let details = await request(`/staff/orders/${orderId}/edit`, 'GET', undefined, staffToken);
  const beforePaid = details.items.find(row => !row.is_manual_free);
  const selected = beforePaid.selection_meta.options.find(row => Number(row.id) === Number(topping.id));
  assert.equal(Number(selected.price), 10); assert.equal(Number(selected.quantity), 2);
  pass('Topping quantities and add-on prices are server-calculated; repeated create is idempotent');
  await request(`/admin/toppings/${topping.id}`, 'PUT', { medium_price: 25 });
  await request(`/admin/staff-delivery-slabs/${slab.id}`, 'PUT', { charge: 49 });
  const unchanged = await request(`/staff/orders/${orderId}/edit`, 'PUT', { items: details.items.map(itemPayload) }, staffToken);
  assert.equal(Number(unchanged.order.id), orderId);
  assert.equal(Number(unchanged.order.total_amount), 261);
  assert.equal(Number(unchanged.order.paid_amount), 100);
  const another = await createOrder([toppingLine], { order_type: 'delivery', delivery_address: 'New test address', staff_delivery_slab_id: Number(slab.id) });
  assert.equal(Number(another.result.order.total_amount), 303);
  pass('Price changes affect new orders while unchanged existing snapshots and delivery charges remain stable');
  await request(`/admin/staff-delivery-slabs/${slab.id}`, 'PUT', { is_active: 0 });
  await createOrder([paidLine()], { order_type: 'delivery', delivery_address: 'New address', staff_delivery_slab_id: Number(slab.id) }, 422);
  pass('Archived delivery charges cannot be selected for new orders');

  details = await request(`/staff/orders/${orderId}/edit`, 'GET', undefined, staffToken);
  const modifiedItems = details.items.map(itemPayload);
  modifiedItems.find(row => !row.is_manual_free).option_selections = [{ id: Number(topping.id), quantity: 1 }];
  const updated = await request(`/staff/orders/${orderId}/edit`, 'PUT', { items: modifiedItems }, staffToken);
  assert.equal(Number(updated.order.id), orderId); assert.equal(Number(updated.order.total_amount), 262);
  assert.equal(Number(updated.order.paid_amount), 100); assert.equal(Number(updated.order.remaining_amount), 162);
  assert.equal(updated.order.payment_status, 'Partially Paid');
  const replay = await request(`/staff/orders/${orderId}/edit`, 'GET', undefined, staffToken);
  assert.equal(replay.items.length, 2);
  pass('Editing toppings preserves saved archived delivery charge, same order and verified payments');
  const remove = replay.items.map(itemPayload);
  remove.find(row => !row.is_manual_free).option_selections = [];
  const removed = await request(`/staff/orders/${orderId}/edit`, 'PUT', { items: remove }, staffToken);
  assert.equal(Number(removed.order.total_amount), 237); assert.equal(Number(removed.order.paid_amount), 100);
  pass('Removing toppings recalculates without duplicate lines or lost payments');

  await request(`/admin/toppings/${topping.id}`, 'PUT', { is_active: 0 });
  await createOrder([toppingLine], {}, 422);
  const archivedOrder = await request(`/staff/orders/${another.result.order.id}/edit`, 'GET', undefined, staffToken);
  const archivedPayload = archivedOrder.items.map(itemPayload);
  const retained = await request(`/staff/orders/${another.result.order.id}/edit`, 'PUT', { items: archivedPayload }, staffToken);
  assert.equal(Number(retained.order.total_amount), 303);
  const freshArchived = await request(`/staff/orders/${another.result.order.id}/edit`, 'GET', undefined, staffToken);
  const increased = freshArchived.items.map(itemPayload); increased[0].quantity = 2;
  await request(`/staff/orders/${another.result.order.id}/edit`, 'PUT', { items: increased }, staffToken, 422);
  await request(`/staff/orders/${another.result.order.id}/edit`, 'PUT', { items: [itemPayload(freshArchived.items[0]), itemPayload(freshArchived.items[0])] }, staffToken, 422);
  await request(`/staff/orders/${orderId}/edit`, 'PUT', { items: freshArchived.items.map(itemPayload) }, staffToken, 422);
  pass('Existing archived toppings retain history while quantity increases, reused IDs and foreign-order IDs are rejected');
  await createOrder([{ ...freeLine(), is_manual_free: false, manual_parent_key: '', option_selections: [{ id: Number(addon.id), quantity: 101 }] }], {}, 422);
  const badOption = await request('/admin/toppings', 'POST', { name: `Restricted ${seed}`, group_name: 'Pizza Topping', fixed_price: 10, medium_price: 10, applies_to: 'pizza', product_ids: JSON.stringify([Number(paid.id)]), is_active: 1 }, adminToken, 201);
  created.toppings.push(badOption.id);
  await createOrder([{ id: Number(free.id), variant_id: variant(free, 'M'), quantity: 1, client_key: 'restricted', option_selections: [{ id: Number(badOption.id), quantity: 1 }] }], {}, 422);
  pass('Inactive, excessive-quantity and product-inapplicable toppings are rejected');
  const invalidSlab = await request('/admin/staff-delivery-slabs', 'POST', { name: `Threshold ${seed}`, min_order_amount: 1000, charge: 5, priority: 1, is_active: 1 }, adminToken, 201);
  created.slabs.push(invalidSlab.id);
  await createOrder([paidLine()], { order_type: 'delivery', delivery_address: 'Isolated address', staff_delivery_slab_id: Number(invalidSlab.id) }, 422);
  pass('Staff cannot choose a delivery slab outside its configured amount range');
  const invoice = await request(`/staff/orders/${orderId}/invoice`, 'GET', undefined, staffToken);
  assert.ok(invoice.startsWith('%PDF')); assert.match(invoice, /FREE/); assert.match(invoice, /Delivery Charge/);
  const report = await request('/staff/reports/sales?preset=today', 'GET', undefined, staffToken);
  assert.ok(report.report.orders.some(row => Number(row.id) === orderId && Number(row.total_amount) === 237 && Number(row.paid_amount) === 100));
  const adminDetails = await request(`/admin/orders/${orderId}/tracking`);
  assert.ok(adminDetails.items.some(row => row.is_manual_free));
  pass('Invoice, staff sales report and Admin details reflect manual free items and final totals');
  console.log(`PASS staff POS integration: ${checks} checks; isolated test orders intentionally retained.`);
} finally {
  for (const id of created.products) { try { await request(`/admin/products/${id}`, 'DELETE'); } catch (error) { console.error(`Cleanup product ${id}: ${error.message}`); } }
  for (const id of created.toppings) { try { await request(`/admin/toppings/${id}`, 'DELETE'); } catch (error) { console.error(`Cleanup option ${id}: ${error.message}`); } }
  for (const id of created.slabs) { try { await request(`/admin/staff-delivery-slabs/${id}`, 'PUT', { is_active: 0 }); } catch (error) { console.error(`Cleanup slab ${id}: ${error.message}`); } }
  for (const id of created.offers) { try { await request(`/admin/offers/${id}`, 'PUT', { is_active: 0 }); } catch (error) { console.error(`Cleanup offer ${id}: ${error.message}`); } }
  if (created.staff) { try { await request(`/admin/staff/${created.staff}`, 'PUT', { is_active: 0 }); } catch (error) { console.error(`Cleanup staff: ${error.message}`); } }
}
