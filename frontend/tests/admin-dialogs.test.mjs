import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { orderCanEdit, loadCatalog } from '../app/_secure/admin-workflows.mjs';

const source = await readFile(new URL('../app/_secure/AdminPanel.jsx', import.meta.url), 'utf8');
function functionSource(name) {
  const match = source.match(new RegExp(`^  (?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}`, 'm'));
  assert.ok(match, `Actual ${name} implementation exists`);
  return match[0];
}
function fixture() {
  const pending = [];
  const state = { details: null, detailsLoading: false, edit: null, editLoading: false, menu: null, messages: [] };
  const context = { orderCanEdit,
    orderDetailsLoadRef: { current: 0 }, orderEditLoadRef: { current: 0 },
    setOrderDetails: value => { state.details = value; },
    setOrderDetailsLoading: value => { state.detailsLoading = value; },
    setOrderEdit: value => { state.edit = value; },
    setOrderEditLoading: value => { state.editLoading = value; },
    setOrderEditMenu: value => { state.menu = value; },
    setActive() {}, setMessage: value => state.messages.push(value),
    adminRequest: path => new Promise((resolve, reject) => pending.push({ path, resolve, reject })),
    api: async () => ({ items: [{ id: 7 }] })
  };
  const names = ['openOrderDetails', 'closeOrderDetails', 'openOrderEdit', 'closeOrderEdit'];
  const handlers = vm.runInNewContext(`${names.map(functionSource).join('\n')}\n({ ${names.join(', ')} });`, context);
  return { pending, state, handlers };
}

test('closing loading order editor prevents a late read from reopening it', async () => {
  const { pending, state, handlers } = fixture();
  const load = handlers.openOrderEdit({ id: 1 });
  assert.equal(state.editLoading, true);
  handlers.closeOrderEdit();
  assert.equal(state.editLoading, false);
  pending[0].resolve({ order: { id: 1 } });
  await load;
  assert.equal(state.edit, null);
  assert.equal(state.menu, null);
  assert.equal(state.editLoading, false);
});

test('closing order details prevents stale data and errors from reopening the dialog', async () => {
  const { pending, state, handlers } = fixture();
  const load = handlers.openOrderDetails({ id: 2 });
  handlers.closeOrderDetails();
  pending[0].reject(new Error('stale response'));
  await load;
  assert.equal(state.details, null);
  assert.equal(state.detailsLoading, false);
  assert.deepEqual(state.messages, []);
});

test('latest editor read wins while normal successful loading preserves details and menu', async () => {
  const { pending, state, handlers } = fixture();
  const first = handlers.openOrderEdit({ id: 1 });
  const second = handlers.openOrderEdit({ id: 2 });
  pending[0].resolve({ order: { id: 1 } });
  await first;
  assert.equal(state.editLoading, true, 'An obsolete read cannot hide the current loading dialog');
  assert.equal(state.edit, null);
  const details = { order: { id: 2 } };
  pending[1].resolve(details);
  await second;
  assert.equal(state.edit, details);
  assert.equal(state.menu.items[0].id, 7);
  assert.equal(state.details, null);
  assert.equal(state.editLoading, false);
});

 test('completed pickup orders cannot open an editable dialog', async () => {
  const { pending, state, handlers } = fixture();
  const load = handlers.openOrderEdit({ id: 3 });
  pending[0].resolve({ order: { id: 3, status: 'picked_up', order_type: 'takeaway' } });
  await load;
  assert.equal(state.edit, null);
  assert.equal(state.editLoading, false);
  assert.equal(state.messages.length, 1);
 });

test('catalog pagination includes products beyond the first 200 without duplicate entries', async () => {
  const calls = [];
  const result = await loadCatalog(async path => {
    calls.push(path);
    const page = Number(new URL(path, 'https://example.test').searchParams.get('page'));
    return { items: Array.from({ length: page === 1 ? 200 : 7 }, (_, i) => ({ id: (page - 1) * 200 + i + 1 })), pagination: { per_page: 200 } };
  }, '/admin/products');
  assert.equal(result.items.length, 207);
  assert.equal(result.items.at(-1).id, 207);
  assert.equal(calls.length, 2);
});
