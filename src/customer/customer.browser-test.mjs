// Optional browser regression suite. No mock adapter is shipped in the app.
// Run against this checkout's dev server with BAKERIA_CUSTOMER_TESTS=1.
// BAKERIA_PLAYWRIGHT_MODULE may point at the desktop's bundled Playwright.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const enabled = process.env.BAKERIA_CUSTOMER_TESTS === '1';
const base = process.env.BAKERIA_CUSTOMER_TEST_URL ?? 'http://localhost:3003';

test('customer hub: real scaffold reads and isolated simulated interactions', { skip: !enabled }, async t => {
  const { chromium } = require(process.env.BAKERIA_PLAYWRIGHT_MODULE ?? 'playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const outputs = join(tmpdir(), 'bakeria-dev3-browser');
  await mkdir(outputs, { recursive: true });
  const seed = JSON.parse(await readFile(new URL('../../data/seed.json', import.meta.url), 'utf8'));
  try {
    const real = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const page = await real.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await t.test('real API: Maya, draft privacy, remembered selection, switch and missing IDs', async () => {
      await page.goto(`${base}/hub/cus_025`);
      await page.getByRole('heading', { name: 'Hello, Maya.' }).waitFor();
      assert.equal(await page.locator('.stamp-filled').count(), 9);
      assert.equal(await page.locator('.stamp').count(), 10);
      assert.equal(await page.getByRole('button', { name: 'Redeem reward' }).isDisabled(), true);
      assert.equal(await page.locator('.offer-card').count(), 0);
      assert.equal(await page.getByText('The order form hasn’t been connected yet.').count(), 1);
      assert.equal(await page.evaluate(() => localStorage.getItem('bakeria.customerId')), 'cus_025');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: join(outputs, 'maya-360.png'), fullPage: true });
      await page.goto(`${base}/hub`);
      await page.getByRole('heading', { name: 'Hello, Maya.' }).waitFor();
      await page.getByRole('button', { name: 'Switch customer' }).click();
      await page.getByLabel('Phone number', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('bakeria.customerId')), null);
      assert.equal(await page.locator('.reward-card').count(), 0);
      await page.getByRole('button', { name: 'Find my card' }).click();
      await page.getByText('Enter a 10-digit phone number, or include +1.').waitFor();
      await page.getByLabel('Phone number', { exact: true }).fill('(519) 555-0125');
      await page.getByRole('button', { name: 'Find my card' }).click();
      await page.getByRole('alert').filter({ hasText: 'Commit-0 stub' }).waitFor();
      assert.equal(await page.locator('.reward-card').count(), 0);
      await page.goto(`${base}/hub/unknown-customer`);
      await page.getByLabel('Phone number', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('bakeria.customerId')), null);
      await page.reload();
      await page.getByLabel('Phone number', { exact: true }).waitFor();
      await page.screenshot({ path: join(outputs, 'join-360.png'), fullPage: true });
      assert.deepEqual(runtimeErrors, []);
    });
    await real.close();

    console.log('Following cases use a test-only mocked API, cloned from the frozen seed.');
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const phone = await context.newPage();
    const db = structuredClone(seed);
    let hubReads = 0;
    let joins = 0;
    let rewardWrites = 0;
    let offerWrites = 0;
    let failReward = false;
    let delayedRead = null;
    let releaseRead = null;
    let delayedReward = false;
    let releaseReward = null;
    let formUrl = null;
    await phone.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const respond = (body, status = 200) => route.fulfill({ status, json: body });
      if (path === '/api/hub/join') {
        joins += 1;
        const raw = request.postDataJSON().phone.replace(/[\s().-]/g, '');
        const normalized = `+1${raw.replace(/^\+?1(?=\d{10}$)/, '')}`;
        let customer = db.customers.find(customer => customer.phone === normalized);
        const created = !customer;
        if (!customer) {
          customer = { id: 'test-new-customer', name: 'New friend', phone: normalized, joined_at: '2026-10-02T22:30:00.000Z', stamps: 0 };
          db.customers.push(customer);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        return respond({ customer, created }, created ? 201 : 200);
      }
      if (path.startsWith('/api/hub/')) {
        hubReads += 1;
        const id = decodeURIComponent(path.split('/').at(-1));
        const customer = db.customers.find(customer => customer.id === id);
        if (!customer) return respond({ error: { code: 'NOT_FOUND', message: 'Customer not found' } }, 404);
        // Include drafts and another customer's offer to test the defensive UI filter.
        const snapshot = structuredClone({ customer, reward_target: 10, order_form_url: formUrl, offers: db.offers });
        if (delayedRead === id) {
          delayedRead = null;
          await new Promise(resolve => { releaseRead = resolve; });
        }
        return respond(snapshot);
      }
      if (path.endsWith('/rewards/redeem')) {
        rewardWrites += 1;
        if (failReward) return respond({ error: { code: 'CONFLICT', message: 'The reward is not ready. Try refreshing your card.' } }, 409);
        const id = path.split('/')[3];
        const customer = db.customers.find(customer => customer.id === id);
        if (delayedReward) await new Promise(resolve => { releaseReward = resolve; });
        customer.stamps = 0;
        return respond({ customer, redeemed: true });
      }
      if (path.startsWith('/api/offers/') && path.endsWith('/redeem')) {
        offerWrites += 1;
        const offer = db.offers.find(offer => offer.id === path.split('/')[3]);
        offer.status = 'redeemed';
        await new Promise(resolve => setTimeout(resolve, 100));
        return respond({ offer });
      }
      throw new Error(`Unexpected test API route: ${path}`);
    });

    await t.test('phone formatting, duplicate-click protection, remembered new customer', async () => {
      await phone.goto(`${base}/hub`);
      await phone.getByLabel('Phone number', { exact: true }).fill('(519) 555-0125');
      await phone.getByRole('button', { name: 'Find my card' }).dblclick();
      await phone.getByRole('heading', { name: 'Hello, Maya.' }).waitFor();
      assert.equal(joins, 1);
      await phone.getByRole('button', { name: 'Switch customer' }).click();
      await phone.getByLabel('Phone number', { exact: true }).fill('+1 519.555.0125');
      await phone.getByRole('button', { name: 'Find my card' }).click();
      await phone.getByRole('heading', { name: 'Hello, Maya.' }).waitFor();
      assert.equal(await phone.evaluate(() => localStorage.getItem('bakeria.customerId')), 'cus_025');
      await phone.getByRole('button', { name: 'Switch customer' }).click();
      await phone.getByLabel('Phone number', { exact: true }).fill('519-555-0199');
      await phone.getByRole('button', { name: 'Find my card' }).click();
      await phone.getByRole('heading', { name: 'Hello, New.' }).waitFor();
      assert.equal(await phone.locator('.stamp-filled').count(), 0);
      await phone.reload();
      await phone.getByRole('heading', { name: 'Hello, New.' }).waitFor();
    });

    await t.test('polling reaches ten stamps, filters drafts and other customers, and keeps mutation errors', async () => {
      await phone.goto(`${base}/hub/cus_025`);
      await phone.getByRole('heading', { name: 'Hello, Maya.' }).waitFor();
      assert.equal(await phone.locator('.offer-card').count(), 0);
      const maya = db.customers.find(customer => customer.id === 'cus_025');
      maya.stamps = 10;
      await phone.getByRole('button', { name: 'Redeem reward' }).waitFor({ state: 'visible' });
      await phone.waitForFunction(() => document.querySelector('.reward-progress strong')?.textContent.startsWith('10'), undefined, { timeout: 2600 });
      const reward = phone.getByRole('button', { name: 'Redeem reward' });
      assert.equal(await reward.isEnabled(), true);
      failReward = true;
      await reward.click();
      await phone.getByRole('alert').filter({ hasText: 'The reward is not ready' }).waitFor();
      await phone.waitForTimeout(2200);
      assert.equal(await phone.getByRole('alert').filter({ hasText: 'The reward is not ready' }).count(), 1);
      failReward = false;
      await reward.dblclick();
      await phone.waitForFunction(() => document.querySelector('.reward-progress strong')?.textContent.startsWith('0'));
      assert.equal(rewardWrites, 2);
      assert.equal(await reward.isDisabled(), true);
      await phone.reload();
      await phone.getByRole('heading', { name: 'Hello, Maya.' }).waitFor();
      assert.equal(await phone.locator('.stamp-filled').count(), 0);
      const offer = db.offers.find(offer => offer.customer_id === 'cus_025');
      offer.message = 'Maya, your Strawberry Cloud Parfait is waiting. Enjoy a free topping with your next parfait!';
      offer.status = 'approved';
      db.offers.find(offer => offer.customer_id === 'cus_026').status = 'approved';
      await phone.getByText(offer.message, { exact: true }).waitFor({ timeout: 2600 });
      assert.equal(await phone.locator('.offer-card').count(), 1);
      await phone.getByRole('button', { name: 'Redeem offer (demo)' }).dblclick();
      await phone.getByText('Used · simulated redemption', { exact: true }).waitFor();
      assert.equal(offerWrites, 1);
      assert.equal(maya.stamps, 0);
      assert.equal(await phone.getByRole('button', { name: 'Redeem offer (demo)' }).count(), 0);
    });

    await t.test('visibility pauses polling; focus refreshes; cleanup leaves no polling after switching', async () => {
      await phone.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await phone.waitForTimeout(100);
      const hiddenReads = hubReads;
      await phone.waitForTimeout(2200);
      assert.equal(hubReads, hiddenReads);
      await phone.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await phone.waitForTimeout(100);
      assert.ok(hubReads > hiddenReads);
      const beforeFocus = hubReads;
      await phone.evaluate(() => window.dispatchEvent(new Event('focus')));
      await phone.waitForTimeout(100);
      assert.ok(hubReads > beforeFocus);
      await phone.getByRole('button', { name: 'Switch customer' }).click();
      await phone.getByLabel('Phone number', { exact: true }).waitFor();
      const beforeSwitch = hubReads;
      await phone.waitForTimeout(2200);
      assert.equal(hubReads, beforeSwitch);
    });

    await t.test('late reads and redemptions never overwrite another customer', async () => {
      delayedRead = 'cus_025';
      await phone.goto(`${base}/hub/cus_025`);
      await phone.waitForFunction(() => document.body.textContent.includes('Loading your card and offers.'));
      await phone.getByRole('button', { name: 'Switch customer' }).click();
      await phone.getByLabel('Phone number', { exact: true }).fill('5195550126');
      await phone.getByRole('button', { name: 'Find my card' }).click();
      await phone.getByRole('heading', { name: 'Hello, Daniel.' }).waitFor();
      releaseRead();
      await phone.waitForTimeout(200);
      assert.equal(await phone.getByRole('heading', { name: 'Hello, Maya.' }).count(), 0);
      const maya = db.customers.find(customer => customer.id === 'cus_025');
      maya.stamps = 10;
      await phone.goto(`${base}/hub/cus_025`);
      await phone.getByRole('heading', { name: 'Hello, Maya.' }).waitFor();
      delayedReward = true;
      await phone.getByRole('button', { name: 'Redeem reward' }).click();
      await phone.getByRole('button', { name: 'Redeeming…' }).waitFor();
      await phone.getByRole('button', { name: 'Switch customer' }).click();
      await phone.getByLabel('Phone number', { exact: true }).fill('5195550126');
      await phone.getByRole('button', { name: 'Find my card' }).click();
      await phone.getByRole('heading', { name: 'Hello, Daniel.' }).waitFor();
      releaseReward();
      await phone.waitForTimeout(200);
      assert.equal(await phone.getByRole('heading', { name: 'Hello, Maya.' }).count(), 0);
      assert.equal(await phone.getByText('Reward redeemed in the demo. Your card is ready to start again.').count(), 0);
      delayedReward = false;
    });

    await t.test('server-configured form anchor and long content fit 360px', async () => {
      formUrl = 'https://docs.google.com/forms/d/e/test-only/viewform';
      db.offers.find(offer => offer.customer_id === 'cus_025').message = 'A'.repeat(280);
      await phone.goto(`${base}/hub/cus_025`);
      const anchor = phone.getByRole('link', { name: 'Order ahead' });
      await anchor.waitFor();
      assert.equal(await anchor.getAttribute('href'), formUrl);
      assert.equal(await anchor.getAttribute('target'), '_blank');
      assert.equal(await anchor.getAttribute('rel'), 'noopener noreferrer');
      assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await phone.screenshot({ path: join(outputs, 'offers-360-test-only.png'), fullPage: true });
    });
    await context.close();
    console.log(`Screenshots: ${outputs}`);
  } finally { await browser.close(); }
});
