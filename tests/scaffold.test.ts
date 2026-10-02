import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/app';
import { summaries, metrics } from '../server/domain';
import type { Database, Order } from '../src/shared/contracts';

const seed: Database = JSON.parse(readFileSync('data/seed.json', 'utf8'));
const now = '2026-10-02T22:30:00.000Z';

test('seed has referential integrity, believable totals, six lapsed regulars and stage fixture', () => {
  assert.equal(seed.customers.length, 50);
  for (const table of [seed.menu_items, seed.customers, seed.orders, seed.offers]) {
    assert.equal(new Set(table.map(row => row.id)).size, table.length);
  }
  assert.equal(new Set(seed.customers.map(c => c.phone)).size, 50);
  for (const customer of seed.customers) {
    assert.match(customer.phone, /^\+151955501\d{2}$/);
    assert.ok(Number.isInteger(customer.stamps) && customer.stamps >= 0 && customer.stamps <= 10);
  }
  const start = Date.parse(now) - 90 * 86400000;
  for (const order of seed.orders) {
    const customer = seed.customers.find(c => c.id === order.customer_id);
    assert.ok(customer);
    assert.ok(order.created_at >= customer.joined_at);
    assert.ok(Date.parse(order.created_at) >= start && order.created_at <= now);
    assert.equal(order.total_cents, order.items.reduce((sum, line) => sum + line.quantity * line.unit_price_cents, 0));
    for (const line of order.items) {
      assert.ok(seed.menu_items.some(item => item.id === line.menu_item_id));
      assert.ok(Number.isInteger(line.quantity) && line.quantity > 0);
      assert.ok(Number.isInteger(line.unit_price_cents) && line.unit_price_cents >= 0);
    }
  }
  const customers = summaries(seed, now);
  assert.deepEqual(customers.filter(c => c.is_lapsed).map(c => c.id),
    ['cus_025', 'cus_026', 'cus_027', 'cus_028', 'cus_029', 'cus_030']);
  const maya = customers.find(c => c.id === 'cus_025')!;
  assert.equal(maya.name, 'Maya Patel');
  assert.equal(maya.phone, '+15195550125');
  assert.equal(maya.stamps, 9);
  assert.equal(maya.days_since_last_visit, 22);
  assert.equal(maya.usual_gap_days, 7);
  assert.equal(maya.favorite_item?.id, 'menu_strawberry');
  assert.equal(seed.offers.length, 6);
  for (const offer of seed.offers) {
    const customer = customers.find(c => c.id === offer.customer_id)!;
    assert.ok(customer.is_lapsed);
    assert.equal(offer.status, 'draft');
    assert.equal(offer.source, 'cached');
    assert.ok(offer.message.includes(customer.favorite_item!.name));
    assert.ok(offer.message.length <= 280);
  }
});

test('lapsed threshold is strict, respects cadence, and ignores future orders', () => {
  const db: Database = { ...seed, customers: [seed.customers[0]], orders: [], offers: [] };
  const makeOrder = (days: number, id = String(days)): Order => ({
    id, customer_id: db.customers[0].id,
    items: [{ menu_item_id: 'menu_strawberry', quantity: 1, unit_price_cents: 750 }], total_cents: 750,
    created_at: new Date(Date.parse(now) - days * 86400000).toISOString(),
  });
  db.orders = [28, 21, 14].map(days => makeOrder(days));
  assert.equal(summaries(db, now)[0].is_lapsed, false);
  assert.equal(summaries(db, new Date(Date.parse(now) + 1).toISOString())[0].is_lapsed, true);
  db.orders = [121, 91, 61].map(days => makeOrder(days));
  assert.equal(summaries(db, now)[0].usual_gap_days, 30);
  assert.equal(summaries(db, now)[0].is_lapsed, true);
  db.orders = [90, 60].map(days => makeOrder(days));
  assert.equal(summaries(db, now)[0].is_lapsed, false);
  db.orders = [makeOrder(20, 'a'), makeOrder(20, 'b'), makeOrder(20, 'c')];
  assert.equal(summaries(db, now)[0].is_lapsed, false);
  db.orders = [makeOrder(-1)];
  assert.equal(summaries(db, now)[0].visits, 0);
  assert.equal(summaries(db, now)[0].last_visit, null);
});

test('core metrics have defined denominators and count statuses correctly', () => {
  const result = metrics(seed, now);
  assert.equal(result.returning_customer_rate, 0.8);
  assert.equal(result.lapsed_regulars, 6);
  assert.equal(result.offers_approved, 0);
  assert.equal(result.offers_redeemed, 0);
  const db = structuredClone(seed);
  db.offers[0].status = 'approved';
  db.offers[1].status = 'redeemed';
  assert.equal(metrics(db, now).offers_approved, 2);
  assert.equal(metrics(db, now).offers_redeemed, 1);
  assert.equal(metrics({ ...db, orders: [] }, now).returning_customer_rate, 0);
});

test('HTTP read contracts, ordering, errors, and draft privacy', async () => {
  const server = createApp(() => structuredClone(seed)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  try {
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.ok, true);
    const menu = await (await fetch(`${base}/menu`)).json();
    assert.equal(menu.menu_items.length, 5);
    const config = await (await fetch(`${base}/config`)).json();
    assert.equal(config.reward_target, 10);
    assert.equal(config.demo_mode, true);
    const list = await (await fetch(`${base}/customers?lapsed=true&sort=total_spend_cents&direction=desc`)).json();
    assert.equal(list.customers.length, 6);
    assert.ok(list.customers.every((c: { total_spend_cents: number }, i: number) =>
      i === 0 || list.customers[i - 1].total_spend_cents >= c.total_spend_cents));
    const detail = await (await fetch(`${base}/customers/cus_025`)).json();
    assert.equal(detail.customer.name, 'Maya Patel');
    assert.equal(detail.orders.length, 9);
    const hub = await (await fetch(`${base}/hub/cus_025`)).json();
    assert.equal(hub.customer.stamps, 9);
    assert.deepEqual(hub.offers, []);
    const totals = await (await fetch(`${base}/metrics`)).json();
    assert.equal(totals.lapsed_regulars, 6);
    assert.equal((await fetch(`${base}/customers?sort=wrong`)).status, 400);
    assert.equal((await fetch(`${base}/customers/missing`)).status, 404);
    const absent = await fetch(`${base}/not-a-route`);
    assert.equal(absent.status, 404);
    assert.equal((await absent.json()).error.code, 'NOT_FOUND');
    // The frozen suite continues to pass after Dev 1 replaces scaffold mutations.
    if (health.mode === 'scaffold') {
      const paths = [
        ['POST', '/hub/join'], ['POST', '/customers/cus_025/stamps'],
        ['POST', '/customers/cus_025/rewards/redeem'], ['POST', '/customers/cus_025/offers/draft'],
        ['PATCH', '/offers/offer_cache_cus_025'], ['POST', '/offers/offer_cache_cus_025/approve'],
        ['POST', '/offers/offer_cache_cus_025/redeem'],
      ];
      for (const [method, path] of paths) {
        const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(response.status, 501);
        assert.equal((await response.json()).error.code, 'NOT_IMPLEMENTED');
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
