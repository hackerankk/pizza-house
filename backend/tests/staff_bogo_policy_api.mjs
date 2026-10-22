import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Mutates only a deliberately disposable loopback API/database. Configuration
// is restored and the temporary Staff account is archived in finally.
const base = process.env.PIZZA_STAFF_BOGO_API_URL;
if (!base || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base)
    || process.env.PIZZA_STAFF_BOGO_DISPOSABLE !== 'yes') {
  throw new Error('A disposable loopback Staff BOGO API and explicit confirmation are required.');
}
const email = process.env.PIZZA_TEST_ADMIN_EMAIL;
const password = process.env.PIZZA_TEST_ADMIN_PASSWORD;
assert.ok(email && password, 'Disposable Admin credentials required');
assert.ok(process.env.PIZZA_STAFF_BOGO_FIXTURE_PATH, 'Private disposable product fixture file required');
const fixture = JSON.parse(await readFile(process.env.PIZZA_STAFF_BOGO_FIXTURE_PATH, 'utf8'));
const seed = randomBytes(6).toString('hex');
let adminToken = '', staffToken = '', staffId = 0, originalPolicy = null, checks = 0;
const fields = ['name','allowed_free_sizes','category_ids','product_ids','free_product_ids'];
const config = policy => Object.fromEntries(fields.map(key => [key, structuredClone(policy[key])]));
const pass = label => { ++checks; console.log(`PASS: ${label}`); };
async function call(path, method = 'GET', body, token = adminToken, expected = 200, raw = false) {
  const response = await fetch(base + path, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(method === 'POST' && path === '/staff/orders' ? { 'X-Idempotency-Key': `bogo-policy-${randomBytes(12).toString('hex')}` } : {}),
  }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  const value = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${value.error || ''} ${value.field || ''}`);
  return value;
}
const current = () => call('/staff/bogo-policy');
async function save(policy, token = adminToken) {
  const before = await current();
  return call('/staff/bogo-policy', 'PUT', { policy, revision: before.revision }, token);
}
const variant = (product, size) => Number(product.variants.find(row => row.name === size).id);
const paid = fixture.products.paid, free = fixture.products.free, cross = fixture.products.cross;
const paidLine = (quantity = 1) => ({ id:Number(paid.id),variant_id:variant(paid,'M'),quantity,client_key:'policy-paid' });
const freeLine = (size = 'M', quantity = 1, product = free, key = 'policy-bonus') => ({ id:Number(product.id),variant_id:variant(product,size),quantity,client_key:key,is_bogo_free:true,bogo_parent_key:'policy-paid' });
const order = (items, expected = 201) => call('/staff/orders','POST',{order_type:'takeaway',payment_method:'cash',items},staffToken,expected);
function editLine(item) {
  return { id:Number(item.menu_item_id),order_item_id:Number(item.id),variant_id:Number(item.variant_id),quantity:Number(item.quantity),
    client_key:item.client_key || item.selection_meta?.client_key,
    option_selections:(item.selection_meta?.options || []).map(option=>({id:Number(option.id),quantity:Number(option.quantity || 1)})),
    is_bogo_free:Boolean(item.is_bogo_free),bogo_parent_key:item.bogo_parent_key || '',is_manual_free:Boolean(item.is_manual_free),manual_parent_key:item.manual_parent_key || '' };
}
try {
  adminToken = (await call('/auth/admin-login','POST',{email,password},'')).token;
  originalPolicy = config((await current()).policy);
  const publicBefore = await call('/offers/active-bogo','GET',undefined,'');
  await call('/staff/bogo-policy','GET',undefined,'',401);
  const staffEmail = `policy-adversarial-${seed}@example.test`, staffPassword = randomBytes(18).toString('hex');
  const created = await call('/admin/staff','POST',{name:`Policy checks ${seed}`,phone:'0000000000',email:staffEmail,password:staffPassword},adminToken,201);
  staffId = Number(created.staff.id);
  staffToken = (await call('/auth/staff-login','POST',{email:staffEmail,password:staffPassword},'')).token;
  const denied = await call('/staff/bogo-policy','GET',undefined,staffToken);
  assert.equal(denied.can_manage,false);
  await call('/staff/bogo-policy','PUT',{policy:config(denied.policy),revision:denied.revision},staffToken,403);
  pass('New Staff default to read-only policy and cannot save with their original authenticated token');
  const permissions = {create_orders:true,edit_orders:true,manage_staff_bogo:true};
  await call(`/admin/staff/${staffId}`,'PUT',{permissions});
  assert.equal((await call('/staff/bogo-policy','GET',undefined,staffToken)).can_manage,true);
  const broad = {name:`Policy HTTP ${seed}`,allowed_free_sizes:{M:['M','S']},category_ids:[],product_ids:[],free_product_ids:[]};
  const saved = await save(broad,staffToken);
  assert.match(saved.revision,/^[a-f0-9]{64}$/);
  assert.deepEqual(config((await current()).policy),broad);
  assert.ok((await call('/staff/offers','GET',undefined,staffToken)).bogo_offers.some(row=>row.id===0 && row.name===broad.name));
  pass('Admin-granted management permission takes effect on the same token and persists shared Staff rules');
  await call(`/admin/staff/${staffId}`,'PUT',{permissions:{...permissions,manage_staff_bogo:false}});
  assert.equal((await call('/staff/bogo-policy','GET',undefined,staffToken)).can_manage,false);
  await call('/staff/bogo-policy','PUT',{policy:broad,revision:saved.revision},staffToken,403);
  assert.equal((await current()).revision,saved.revision);
  pass('Permission revocation immediately blocks stale-token saves without changing policy');
  await call(`/admin/staff/${staffId}`,'PUT',{permissions});
  const stale = saved.revision;
  const refreshed = await save({...broad,name:`Policy updated ${seed}`});
  await call('/staff/bogo-policy','PUT',{policy:broad,revision:stale},adminToken,409);
  const competing = await Promise.allSettled(['A','B'].map(name=>call('/staff/bogo-policy','PUT',{policy:{...broad,name:`Concurrent ${name} ${seed}`},revision:refreshed.revision})));
  assert.equal(competing.filter(row=>row.status==='fulfilled').length,1);
  const rejected = competing.find(row=>row.status==='rejected');
  assert.match(rejected.reason.message,/409|changed|Reload/);
  pass('Stale revisions reject and concurrent saves sharing a revision have exactly one winner');
  const stable = await current();
  const malformedPolicies = [
    null,[],{}, {...broad,name:''}, {...broad,name:'x'.repeat(121)}, {...broad,name:'Bad\u0000name'},
    {...broad,allowed_free_sizes:null}, {...broad,allowed_free_sizes:{M:[]}}, {...broad,allowed_free_sizes:{M:['L']}},
    {...broad,allowed_free_sizes:{M:['M','M']}}, {...broad,allowed_free_sizes:{S:['S']}}, {...broad,allowed_free_sizes:{M:['S'],L:['S']}},
    {...broad,category_ids:null}, {...broad,category_ids:{}}, {...broad,category_ids:[0]}, {...broad,category_ids:[-1]},
    {...broad,category_ids:[Number(paid.category_id),Number(paid.category_id)]}, {...broad,product_ids:[Number(paid.id)+0.1]},
    {...broad,product_ids:[String(paid.id)]}, {...broad,product_ids:[999999999]}, {...broad,free_product_ids:[999999999]},
    {...broad,category_ids:[999999999]}, {...broad,product_ids:Array(2001).fill(Number(paid.id))},
    {...broad,is_active:0}, {...broad,staff_always_available:false}, {...broad,weekdays:['monday']}, {...broad,buy_qty:2},
  ];
  for (const policy of malformedPolicies) await call('/staff/bogo-policy','PUT',{policy,revision:stable.revision},adminToken,422);
  for (const revision of [null,'',[],{},'x'.repeat(64)]) await call('/staff/bogo-policy','PUT',{policy:broad,revision},adminToken,422);
  await call('/staff/bogo-policy','PUT',{policy:broad},adminToken,422);
  await call('/staff/bogo-policy','PUT',{policy:broad,revision:stable.revision,unexpected:true},adminToken,422);
  await call('/staff/bogo-policy','PUT','{"policy":',adminToken,400,true);
  assert.equal((await current()).revision,stable.revision);
  pass('Malformed JSON, nulls, invalid sizes/IDs, duplicate selections, overlong lists and fixed/unknown fields all reject atomically');
  const scoped = {...broad,allowed_free_sizes:{M:['S']},category_ids:[],product_ids:[Number(paid.id)],free_product_ids:[Number(free.id)]};
  await save(scoped);
  await order([paidLine(),freeLine('S')]);
  await order([paidLine(),freeLine('M')],422);
  await order([paidLine(),freeLine('S',1,cross)],422);
  await order([{...paidLine(),id:Number(free.id),variant_id:variant(free,'M')},freeLine('S')],422);
  await order([paidLine(),freeLine('S'),freeLine('S',1,free,'extra')],422);
  pass('Configured product/free-product subset and Small-only size apply to authoritative pricing with one free item per paid quantity');
  await save({...broad,category_ids:[Number(paid.category_id)]});
  await order([paidLine(),freeLine('M')]);
  await save(broad);
  const historical = (await order([paidLine(2),freeLine('M',2)])).order;
  let detail = await call(`/staff/orders/${historical.id}/edit`,'GET',undefined,staffToken);
  const beforeItems = detail.items.map(editLine);
  await save(scoped);
  const unchanged = await call(`/staff/orders/${historical.id}/edit`,'PUT',{items:beforeItems},staffToken);
  assert.equal(Number(unchanged.order.total_amount),400);
  assert.equal(Number(unchanged.order.paid_amount),Number(historical.paid_amount));
  for (const mutate of [
    items=>{items.find(row=>!row.is_bogo_free).quantity=3;},
    items=>{items.forEach(row=>row.quantity=3);},
    items=>{delete items.find(row=>!row.is_bogo_free).order_item_id;},
    items=>{const parent=items.find(row=>!row.is_bogo_free);parent.id=Number(free.id);parent.variant_id=variant(free,'M');},
    items=>{items.push({...freeLine('M'),client_key:'forged-new-free'});items.find(row=>!row.is_bogo_free).quantity=3;},
  ]) {
    const attempt = structuredClone(beforeItems); mutate(attempt);
    await call(`/staff/orders/${historical.id}/edit`,'PUT',{items:attempt},staffToken,422);
  }
  await call(`/staff/orders/${historical.id}/edit`,'PUT',{items:beforeItems.map(row=>({...row,__historical_staff_bogo_policy:broad}))},staffToken,422);
  detail = await call(`/staff/orders/${historical.id}/edit`,'GET',undefined,staffToken);
  assert.equal(Number(detail.order.total_amount),400);
  assert.equal(detail.items.length,2);
  const reduced = detail.items.map(editLine).map(row=>({...row,quantity:1}));
  const reducedResult = await call(`/staff/orders/${historical.id}/edit`,'PUT',{items:reduced},staffToken);
  assert.equal(Number(reducedResult.order.total_amount),200);
  detail = await call(`/staff/orders/${historical.id}/edit`,'GET',undefined,staffToken);
  await call(`/staff/orders/${historical.id}/edit`,'PUT',{items:detail.items.map(editLine).map(row=>({...row,quantity:2}))},staffToken,422);
  pass('Existing BOGO snapshots preserve or reduce historical quantities; rule changes cannot be bypassed by increases, replacement parents, old keys or forged snapshots');
  await call('/cart/validate','POST',{order_type:'takeaway',items:[paidLine(),freeLine('S')]},'',422);
  await call('/cart/validate','POST',{order_type:'takeaway',items:[paidLine(),freeLine('S')]},staffToken,422);
  await call('/admin/settings','PUT',{staff_bogo_policy:scoped},adminToken,422);
  const publicSettings = await call('/settings','GET',undefined,'');
  assert.ok(!JSON.stringify(publicSettings).includes('staff_bogo_policy'));
  assert.deepEqual((await call('/offers/active-bogo','GET',undefined,'')).offers,publicBefore.offers);
  pass('Staff policy does not leak through public settings, public offers, customer cart or general settings writes');
  console.log(`PASS Staff BOGO policy HTTP: ${checks} checks; disposable order history retained.`);
} finally {
  if (adminToken && originalPolicy) {
    try { await save(originalPolicy); console.log('RESTORED: original isolated Staff BOGO configuration'); }
    catch (error) { console.error(`RESTORE FAILED: ${error.message}`); process.exitCode=1; }
  }
  if (adminToken && staffId) {
    try { await call(`/admin/staff/${staffId}`,'PUT',{is_active:0}); }
    catch (error) { console.error(`Staff fixture cleanup failed: ${error.message}`); process.exitCode=1; }
  }
}
