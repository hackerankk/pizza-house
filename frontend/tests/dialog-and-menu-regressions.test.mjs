import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const dialogSource = fs.readFileSync(new URL('../app/components/useDialogFocus.js', import.meta.url), 'utf8');
const homeSource = fs.readFileSync(new URL('../app/components/HomeMenu.jsx', import.meta.url), 'utf8');
const staffSource = fs.readFileSync(new URL('../app/staff/page.jsx', import.meta.url), 'utf8');

function dialogFixture() {
  const listeners = new Map();
  const document = {
    body: { style: { overflow: 'auto' } },
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatch(type, event) { for (const listener of [...(listeners.get(type) || [])]) listener(event); }
  };
  function element(name) {
    return {
      name, ownerDocument: document, isConnected: true, hidden: false,
      getAttribute() { return null; },
      getClientRects() { return [{}]; },
      focus() { document.activeElement = this; document.dispatch('focusin', { target: this }); }
    };
  }
  const opener = element('opener');
  document.activeElement = opener;
  function dialog(name, count = 2) {
    const result = element(name);
    result.buttons = Array.from({ length: count }, (_, index) => element(`${name}-${index}`));
    result.querySelectorAll = () => result.buttons;
    result.contains = target => target === result || result.buttons.includes(target);
    return result;
  }
  function key(key, shiftKey = false) {
    const event = { key, shiftKey, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} };
    document.dispatch('keydown', event);
    return event;
  }
  const code = dialogSource.slice(dialogSource.indexOf('const openDialogs'), dialogSource.indexOf('export default function')).replace('export function', 'function');
  const activate = vm.runInNewContext(`${code}\nactivateDialogFocus`, { setTimeout, clearTimeout });
  return { document, opener, dialog, key, activate };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('dialogs focus content, loop Tab, close with Escape and restore their opener', async () => {
  const { document, opener, dialog, key, activate } = dialogFixture();
  const panel = dialog('options');
  let closes = 0;
  const cleanup = activate(panel, () => { closes++; });
  await tick();
  assert.equal(document.activeElement, panel.buttons[0]);
  assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(key('Tab', true).prevented, true);
  assert.equal(document.activeElement, panel.buttons[1]);
  assert.equal(key('Tab').prevented, true);
  assert.equal(document.activeElement, panel.buttons[0]);
  opener.focus();
  assert.equal(document.activeElement, panel.buttons[0], 'background focus returns to dialog');
  assert.equal(key('Escape').prevented, true);
  assert.equal(closes, 1);
  cleanup();
  assert.equal(document.activeElement, opener);
  assert.equal(document.body.style.overflow, 'auto');
});

test('only the topmost dialog responds when product options open over a cart drawer', async () => {
  const { document, opener, dialog, key, activate } = dialogFixture();
  const cart = dialog('cart');
  let cartCloses = 0;
  let productCloses = 0;
  const closeCart = activate(cart, () => { cartCloses++; });
  await tick();
  const product = dialog('product');
  const closeProduct = activate(product, () => { productCloses++; });
  await tick();
  key('Escape');
  assert.equal(productCloses, 1);
  assert.equal(cartCloses, 0);
  closeProduct();
  assert.equal(document.activeElement, cart.buttons[0]);
  assert.equal(document.body.style.overflow, 'hidden');
  closeCart();
  assert.equal(document.activeElement, opener);
  assert.equal(document.body.style.overflow, 'auto');
});

test('dialogs without interactive content keep focus on the dialog itself', async () => {
  const { document, dialog, key, activate } = dialogFixture();
  const panel = dialog('empty', 0);
  const cleanup = activate(panel, () => {});
  await tick();
  assert.equal(document.activeElement, panel);
  assert.equal(key('Tab').prevented, true);
  cleanup();
});

function pureFunction(source, name) {
  const match = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\}`, 'm'));
  assert.ok(match, `${name} exists in the actual component`);
  return vm.runInNewContext(`(${match[0]})`);
}

test('public and staff prices preserve each size and arbitrary custom variant prices', () => {
  for (const source of [homeSource, staffSource]) {
    const price = pureFunction(source, 'effectiveVariantPrice');
    const product = { price: 79 };
    for (const [name, expected] of [['S', 99], ['M', 159], ['L', 229], ['Normal', 89], ['Premium', 129], ['Chef Special', 169]]) {
      assert.equal(price(product, { name, price: expected }), expected);
    }
    assert.equal(price(product, null), 79);
  }
  const toppingPrice = pureFunction(homeSource, 'cartOptionPrice');
  const topping = { small_price: 10, medium_price: 20, large_price: 30, fixed_price: 15 };
  assert.equal(toppingPrice(topping, 'S'), 10);
  assert.equal(toppingPrice(topping, 'M'), 20);
  assert.equal(toppingPrice(topping, 'L'), 30);
  assert.equal(toppingPrice(topping, 'Premium'), 15);
  assert.equal(toppingPrice(topping, 'Chef Special'), 15);
});
