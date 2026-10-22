import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

// Explicitly disposable only: this creates test orders, then archives fixtures.
const base = process.env.PIZZA_STAFF_BOGO_API_URL;
if (!base || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base)
    || process.env.PIZZA_STAFF_BOGO_DISPOSABLE !== 'yes') {
  throw new Error('Confirm a loopback PIZZA_STAFF_BOGO_API_URL and PIZZA_STAFF_BOGO_DISPOSABLE=yes for an isolated database.');
}
const email = process.env.PIZZA_TEST_ADMIN_EMAIL;
const password = process.env.PIZZA_TEST_ADMIN_PASSWORD;
assert.ok(email && password, 'Explicit disposable admin credentials required');
const keepFixtures = process.env.PIZZA_STAFF_BOGO_KEEP_FIXTURES === 'yes';
assert.ok(!keepFixtures || process.env.PIZZA_STAFF_BOGO_FIXTURE_PATH, 'An ignored fixture output path is required when retaining browser fixtures');
const seed = randomBytes(6).toString('hex');
const created = { products: [], categories: [], offers: [], staff: null };
const permissions = { create_orders: true, edit_orders: true, view_reports: true, apply_free_pizza: false, free_pizza_cross_category: false, apply_manual_discount: false };
let adminToken = '', staffToken = '';
let checks = 0, completed = false;
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
  assert.equal(response.status, status, `${method} ${path}: ${typeof value === 'string' ? value.slice(0,120) : `${value.error || ''} ${value.field || ''}`}`);
  return value;
}
function pass(label) { ++checks; console.log(`PASS: ${label}`); }
async function createOrder(items, status = 201, patch = {}, key = `staff-bogo-${randomBytes(8).toString('hex')}`) {
  const payload = { order_type: 'takeaway', payment_method: 'cash', items, ...patch };
  return { result: await request('/staff/orders','POST',payload,staffToken,status,key), payload, key };
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
  adminToken = (await request('/auth/admin-login','POST',{ email,password },'',200)).token;
  await request('/staff/offers','GET',undefined,'',401);
  pass('Permanent Staff offer endpoint requires authentication');
  const staffEmail = `always-bogo-${seed}@example.test`;
  const staffPassword = randomBytes(16).toString('hex');
  const newStaff = await request('/admin/staff','POST',{ name: `Everyday BOGO ${seed}`,phone:'0000000000',email:staffEmail,password:staffPassword,permissions },adminToken,201);
  created.staff = Number(newStaff.staff.id);
  staffToken = (await request('/auth/staff-login','POST',{email:staffEmail,password:staffPassword},'',200)).token;
  async function category(name) {
    const response = await request('/admin/categories','POST',{name:`${name} ${seed}`,slug:`${name.toLowerCase().replaceAll(' ','-')}-${seed}`,is_active:1},adminToken,201);
    created.categories.push(Number(response.id)); return Number(response.id);
  }
  const sameCategory = await category('Everyday BOGO fixture');
  const otherCategory = await category('Other BOGO fixture');
  async function product(label,categoryId,prices) {
    const result = await request('/admin/products','POST',{name:`${label} ${seed}`,category_id:categoryId,price:prices.S,size_prices:prices,stock:500,is_active:1},adminToken,201);
    created.products.push(Number(result.id));
    return (await request('/menu')).items.find(row=>Number(row.id)===Number(result.id));
  }
  const paid = await product('Paid medium fixture',sameCategory,{S:100,M:200,L:300});
  const free = await product('Free selection fixture',sameCategory,{S:80,M:180,L:250});
  const expensive = await product('Expensive fixture',sameCategory,{S:201,M:220,L:400});
  const cross = await product('Cross category fixture',otherCategory,{S:70,M:150,L:300});
  const variant = (product,size)=>Number(product.variants.find(row=>row.name===size).id);
  const paidLine = (size='M',quantity=1)=>({id:Number(paid.id),variant_id:variant(paid,size),quantity,client_key:'paid'});
  const freeLine = (size='M',product=free,key='bonus')=>({id:Number(product.id),variant_id:variant(product,size),quantity:1,client_key:key,is_bogo_free:true,bogo_parent_key:'paid'});
  const publicBefore = await request('/offers/active-bogo','GET',undefined,'');
  assert.ok(!(publicBefore.offers || []).some(offer=>offer.staff_always_available));
  const staffOffers = await request('/staff/offers','GET',undefined,staffToken);
  const permanent = staffOffers.bogo_offers.find(offer=>offer.staff_always_available);
  assert.ok(permanent); assert.equal(permanent.id,0);
  assert.deepEqual(permanent.allowed_free_sizes,{M:['M','S']});
  assert.equal(Number(permanent.buy_qty),1); assert.equal(Number(permanent.get_qty),1);
  pass('Authenticated Staff receive permanent M to M/S policy without publishing it to customer offers');
  const expired = await request('/admin/offers','POST',{name:`Expired BOGO ${seed}`,offer_type:'bogo',scope:'category',scope_id:sameCategory,category_ids:JSON.stringify([sameCategory]),product_ids:'[]',weekdays:'["monday"]',size_rules:'{"monday":{"M":"M"}}',buy_qty:1,get_qty:1,starts_at:'2020-01-01 00:00:00',expires_at:'2020-01-02 00:00:00',is_active:1},adminToken,201);
  created.offers.push(Number(expired.id));
  const expiredPublic = await request('/offers/active-bogo','GET',undefined,'');
  assert.ok(!expiredPublic.offers.some(offer=>Number(offer.id)===Number(expired.id)));
  assert.ok((await request('/staff/offers','GET',undefined,staffToken)).bogo_offers.some(offer=>offer.staff_always_available));
  pass('Expired scheduled public offer neither enables customer eligibility nor hides permanent Staff BOGO');
  const orderIds = [];
  for (const size of ['M','S']) {
    const { result } = await createOrder([paidLine(),freeLine(size)]);
    orderIds.push(Number(result.order.id));
    assert.equal(Number(result.order.total_amount),200);
    assert.equal(Number(result.order.discount_amount),size==='M'?180:80);
    assert.equal(result.order.discount_type,'bogo');
    const detail = await request(`/staff/orders/${result.order.id}/edit`,'GET',undefined,staffToken);
    const bonus = detail.items.find(item=>item.is_bogo_free);
    assert.ok(bonus && !bonus.is_manual_free); assert.equal(Number(bonus.payable_line_total),0);
    assert.equal(Number(bonus.unit_price),size==='M'?180:80);
    pass(`Staff with manual-free and manual-discount permissions disabled can save Medium to ${size} BOGO with correct totals`);
  }
  await createOrder([paidLine(),freeLine('L')],422);
  await createOrder([paidLine('S'),freeLine('S')],422);
  await createOrder([paidLine('L'),freeLine('M')],422);
  await createOrder([paidLine(),freeLine('M',cross)],422);
  await createOrder([paidLine(),freeLine('M',expensive)],422);
  pass('Staff API rejects ineligible paid/free sizes, cross-category selection and higher-priced free pizza');
  await createOrder([paidLine(),freeLine('M'),freeLine('S',free,'second-bonus')],422);
  await createOrder([paidLine(),{...freeLine('M'),quantity:2}],422);
  await createOrder([freeLine('M')],422);
  await createOrder([freeLine('M'),{...freeLine('S'),client_key:'child',bogo_parent_key:'bonus'}],422);
  const { result: doubled } = await createOrder([paidLine('M',2),freeLine('M'),freeLine('S',free,'second-bonus')]);
  assert.equal(Number(doubled.order.total_amount),400); assert.equal(Number(doubled.order.discount_amount),260);
  pass('M and S free children share one BOGO capacity per paid quantity; free parents and over-allocation are rejected');
  const cart = {order_type:'takeaway',items:[paidLine(),freeLine('M')]};
  await request('/cart/validate','POST',cart,'',422);
  await request('/cart/validate','POST',cart,staffToken,422);
  await request('/cart/validate','POST',{...cart,staff_always_available:true},'',422);
  await request('/cart/validate','POST',{...cart,staffActor:{role:'staff'}},'',422);
  await request('/cart/validate','POST',{...cart,items:cart.items.map(item=>({...item,staff_always_available:true}))},'',422);
  pass('Public cart stays customer-only even with Staff token or forged permanent-offer/actor flags');
  const manual = {...freeLine('S'),is_bogo_free:false,bogo_parent_key:'',is_manual_free:true,manual_parent_key:'paid'};
  await createOrder([paidLine(),manual],403);
  await createOrder([paidLine(),{...manual,is_bogo_free:true,bogo_parent_key:'paid'}],403);
  pass('Permanent BOGO does not grant manual-free permission or bypass its existing permission checks');
  const original = await request(`/staff/orders/${orderIds[0]}/edit`,'GET',undefined,staffToken);
  const edits = original.items.map(itemPayload);
  edits.find(item=>item.is_bogo_free).variant_id = variant(free,'S');
  const edited = await request(`/staff/orders/${orderIds[0]}/edit`,'PUT',{items:edits},staffToken);
  assert.equal(Number(edited.order.id),orderIds[0]); assert.equal(Number(edited.order.total_amount),200);
  assert.equal(Number(edited.order.discount_amount),80); assert.equal(Number(edited.order.paid_amount),Number(original.order.paid_amount));
  const fresh = await request(`/staff/orders/${orderIds[0]}/edit`,'GET',undefined,staffToken);
  assert.equal(fresh.items.length,2); assert.equal(fresh.items.find(item=>item.is_bogo_free).variant_snapshot,'S');
  const invalidEdit = fresh.items.map(itemPayload); invalidEdit.find(item=>item.is_bogo_free).quantity=2;
  await request(`/staff/orders/${orderIds[0]}/edit`,'PUT',{items:invalidEdit},staffToken,422);
  const afterReject = await request(`/staff/orders/${orderIds[0]}/edit`,'GET',undefined,staffToken);
  assert.equal(Number(afterReject.order.total_amount),200); assert.equal(afterReject.items.length,2);
  pass('Editing M free to S free preserves same order/payments and rejects excess free quantities atomically');
  const report = await request('/staff/reports/sales?preset=today','GET',undefined,staffToken);
  assert.ok(report.report.orders.some(order=>Number(order.id)===orderIds[0]&&Number(order.total_amount)===200));
  const invoice = await request(`/staff/orders/${orderIds[0]}/invoice`,'GET',undefined,staffToken);
  assert.ok(invoice.startsWith('%PDF')); assert.match(invoice,/BOGO FREE/);
  const tracking = await request(`/admin/orders/${orderIds[0]}/tracking`);
  assert.ok(tracking.items.some(item=>item.is_bogo_free&&Number(item.payable_line_total)===0));
  pass('Saved Staff BOGO is present in sales report, PDF invoice and Admin tracking');
  const publicAfter = await request('/offers/active-bogo','GET',undefined,'');
  assert.deepEqual(publicAfter.offers,publicBefore.offers);
  pass('Public active BOGO configuration remains unchanged by Staff permanent policy');
  if (keepFixtures) {
    await writeFile(process.env.PIZZA_STAFF_BOGO_FIXTURE_PATH,JSON.stringify({api:base,staff:{id:created.staff,email:staffEmail,password:staffPassword},products:{paid,free,expensive,cross},created,order_ids:orderIds,permissions},null,2));
  }
  completed=true;
  console.log(`PASS Staff permanent BOGO HTTP: ${checks} checks; isolated test orders retained.`);
} finally {
  for (const id of created.offers) { try { await request(`/admin/offers/${id}`,'PUT',{is_active:0}); } catch (error) { console.error(`Cleanup offer ${id}: ${error.message}`); } }
  if (!keepFixtures || !completed) {
    for (const id of created.products) { try { await request(`/admin/products/${id}`,'DELETE'); } catch (error) { console.error(`Cleanup product ${id}: ${error.message}`); } }
    for (const id of created.categories) { try { await request(`/admin/categories/${id}`,'PUT',{is_active:0}); } catch (error) { console.error(`Cleanup category ${id}: ${error.message}`); } }
    if (created.staff) { try { await request(`/admin/staff/${created.staff}`,'PUT',{is_active:0}); } catch (error) { console.error(`Cleanup Staff ${created.staff}: ${error.message}`); } }
  }
}
