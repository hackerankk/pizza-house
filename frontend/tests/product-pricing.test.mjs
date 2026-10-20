import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the actual form functions without importing the browser component.
const source = readFileSync(new URL('../app/_secure/AdminPanel.jsx', import.meta.url), 'utf8');
function formFunction(name, context, args = []) {
  const body = source.match(new RegExp(`^  function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}`, 'm'))?.[0];
  assert.ok(body, `Missing ${name}`);
  return new vm.Script(`(${body})(...args)`).runInNewContext({ ...context, args });
}
function normalize(form, editing = 1) {
  return JSON.parse(JSON.stringify(formFunction('normalizedResourcePayload', { active: 'products', form, editing })));
}

test('editing keeps active pizza sizes and all custom variants in separate maps', () => {
  let form;
  formFunction('editResource', {
    active: 'products', resourceFields: ['name', 'price'],
    setForm: next => { form = next; }, setNewVariantName() {},
    clearProductImageSelection() {}, setEditing() {}, window: { scrollTo() {} },
  }, [{ id: 9, name: 'Mixed product', price: 100, variants: [
    { name: 'S', price: 100, is_active: 1 }, { name: 'M', price: 150, is_active: 1 },
    { name: 'L', price: 200, is_active: 1 }, { name: 'Normal', price: 120, is_active: 1 },
    { name: 'Premium', price: 180, is_active: 1 }, { name: 'Chef Special', price: 220, is_active: 1 },
    { name: 'Retired', price: 50, is_active: 0 },
  ] }]);
  form = JSON.parse(JSON.stringify(form));
  assert.deepEqual(form.size_prices, { S: 100, M: 150, L: 200 });
  assert.deepEqual(form.variant_prices, { Normal: 120, Premium: 180, 'Chef Special': 220 });
  assert.equal(form.size_pricing_enabled, true);
  assert.equal(form.variant_pricing_enabled, true);
});

test('both pricing groups survive saving and base price follows their current minimum', () => {
  const payload = normalize({ price: 1, size_pricing_enabled: true, size_prices: { S: '100', M: '150', L: '200' },
    variant_pricing_enabled: true, variant_prices: { Normal: '120', Premium: '180', ' Chef Special ': '220' } });
  assert.equal(payload.price, 100);
  assert.deepEqual(payload.size_prices, { S: '100', M: '150', L: '200' });
  assert.deepEqual(payload.variant_prices, { Normal: 120, Premium: 180, 'Chef Special': 220 });
  assert.equal('size_pricing_enabled' in payload, false);
  assert.equal('variant_pricing_enabled' in payload, false);
  assert.equal(normalize({ price: 1, variant_pricing_enabled: true, variant_prices: { Normal: 80, Premium: 120 } }).price, 80);
});

test('Regular-only legacy pricing follows the base field without overriding mixed size pricing', () => {
  assert.deepEqual(normalize({ price: 140, variant_pricing_enabled: true, variant_prices: { Regular: 90 } }).variant_prices, { Regular: 140 });
  const mixed = normalize({ price: 100, size_pricing_enabled: true, size_prices: { S: 100 }, variant_pricing_enabled: true, variant_prices: { Regular: 190 } });
  assert.equal(mixed.variant_prices.Regular, 190);
  assert.equal(mixed.price, 100);
});

test('disabling a pricing group clears only that group; omitted maps stay omitted', () => {
  const sizesOnly = normalize({ size_pricing_enabled: true, size_prices: { M: 150 }, variant_pricing_enabled: false, variant_prices: { Premium: 180 } });
  assert.deepEqual(sizesOnly.variant_prices, {});
  assert.deepEqual(sizesOnly.size_prices, { M: 150 });
  const customOnly = normalize({ size_pricing_enabled: false, size_prices: { S: 100 }, variant_pricing_enabled: true, variant_prices: { Premium: 180 } });
  assert.deepEqual(customOnly.size_prices, {});
  assert.deepEqual(customOnly.variant_prices, { Premium: 180 });
  assert.deepEqual(normalize({ price: 100 }), { price: 100 });
});

test('validation rejects wrong group names, duplicate names, and invalid prices', () => {
  for (const size_prices of [{ Normal: 100 }, {}, { S: '' }, { M: 0 }, { L: Infinity }]) {
    assert.throws(() => normalize({ size_pricing_enabled: true, size_prices }), /positive price/);
  }
  for (const variant_prices of [{ s: 100 }, { ' M ': 100 }, { L: 100 }, { '': 100 }, { ['a'.repeat(81)]: 100 }, {}, { Premium: '' }, { Normal: -1 }, { Extra: 100000000 }]) {
    assert.throws(() => normalize({ variant_pricing_enabled: true, variant_prices }), /valid name and positive price/);
  }
  assert.throws(() => normalize({ variant_pricing_enabled: true, variant_prices: { Normal: 100, ' normal ': 120 } }), /unique/);
});
