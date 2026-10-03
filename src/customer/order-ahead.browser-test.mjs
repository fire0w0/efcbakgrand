// Test-only API interception: exercises customer UI failures and retries without changing demo data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const enabled = process.env.BAKERIA_ORDER_TESTS === '1';
const base = process.env.BAKERIA_CUSTOMER_TEST_URL ?? 'http://localhost:3000';

test('built-in order ahead: totals, safe reload/retry, status polling, customer isolation and 360px layout', { skip: !enabled }, async () => {
  const { chromium } = require(process.env.BAKERIA_PLAYWRIGHT_MODULE ?? 'playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const seed = JSON.parse(await readFile(new URL('../../data/seed.json', import.meta.url), 'utf8'));
  const asOf = '2026-10-02T22:30:00.000Z';
  try {
    // The host timezone differs deliberately; pickup must still use Toronto.
    const context = await browser.newContext({ viewport: { width: 360, height: 800 }, timezoneId: 'Asia/Tokyo' });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    const orders = [];
    const requests = [];
    let fail = true;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/menu') return route.fulfill({ json: { menu_items: seed.menu_items } });
      if (path.startsWith('/api/hub/')) {
        const customer = seed.customers.find(value => value.id === path.split('/').at(-1));
        return route.fulfill({ json: { customer, reward_target: 10, order_form_url: null, offers: [], preorders: orders.filter(order => order.customer_id === customer.id), as_of: asOf } });
      }
      if (path.endsWith('/preorders')) {
        const body = route.request().postDataJSON();
        requests.push(body);
        if (fail) return route.abort('failed');
        await new Promise(resolve => setTimeout(resolve, 150));
        const items = body.items.map(item => ({ ...item, unit_price_cents: seed.menu_items.find(menuItem => menuItem.id === item.menu_item_id).price_cents }));
        const preorder = { ...body, id: 'test-order-1', customer_id: path.split('/')[3], items, total_cents: items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0), created_at: asOf, status: 'scheduled', collected_at: null };
        orders.push(preorder);
        return route.fulfill({ status: 201, json: { preorder } });
      }
      throw new Error(`Unexpected request ${path}`);
    });
    await page.goto(`${base}/hub/cus_025`);
    await page.getByRole('button', { name: 'Start an order', exact: true }).click();
    const quantity = page.getByLabel(`Quantity for ${seed.menu_items[0].name}`, { exact: true });
    await quantity.selectOption('2');
    assert.equal(await page.getByLabel('Pickup time', { exact: true }).inputValue(), '2026-10-02T22:45:00.000Z');
    await page.getByLabel('Pickup note (optional)', { exact: true }).fill('Please pack spoons.');
    await page.getByRole('button', { name: 'Place order', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'We couldn’t confirm your order' }).waitFor();
    assert.equal(requests.length, 1);
    await page.reload();
    await quantity.waitFor();
    assert.equal(await quantity.inputValue(), '2');
    assert.equal(await page.getByLabel('Pickup note (optional)', { exact: true }).inputValue(), 'Please pack spoons.');
    fail = false;
    const place = page.getByRole('button', { name: 'Place order', exact: true });
    await place.evaluate(button => { button.click(); button.click(); });
    await page.getByText('Your order is in!', { exact: true }).waitFor();
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], requests[0]);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].total_cents, seed.menu_items[0].price_cents * 2);
    assert.equal(await quantity.inputValue(), '0');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    orders[0].status = 'collected'; orders[0].collected_at = asOf;
    await page.getByRole('button', { name: 'Past (1)', exact: true }).waitFor({ timeout: 4000 });
    await page.getByRole('button', { name: 'Past (1)', exact: true }).click();
    await page.getByText('Collected', { exact: true }).waitFor();
    await page.goto(`${base}/hub/cus_026`);
    await page.getByRole('heading', { name: 'Hello, Daniel.' }).waitFor();
    assert.equal(await page.locator('.preorder-receipt').count(), 0);
    assert.equal(await page.getByText('Your order is in!', { exact: true }).count(), 0);
    assert.deepEqual(runtimeErrors, []);
  } finally { await browser.close(); }
});
