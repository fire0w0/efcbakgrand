import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../server/app';
import { config } from '../../server/config';
import { openStore, readSeed } from '../../server/store';
import type {
  ApiError, CustomerDetailResponse, Database, HubResponse, MetricsResponse, OrderListResponse,
  Preorder, PreorderRequest, PreorderResponse,
} from '../../src/shared/contracts';

const minute = 60_000;
const day = 24 * 60 * minute;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pickupIn = (milliseconds: number) => new Date(Date.parse(config.demoNow) + milliseconds).toISOString();

function orderRequest(overrides: Partial<PreorderRequest> = {}): PreorderRequest {
  return {
    request_id: randomUUID(), pickup_name: 'Maya Patel', pickup_at: pickupIn(30 * minute), note: '',
    items: [{ menu_item_id: 'menu_strawberry', quantity: 2 }], ...overrides,
  };
}

async function serve(t: TestContext, app: ReturnType<typeof createApp>) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const close = async () => {
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  };
  t.after(close);
  return { base, close };
}

async function fixture(t: TestContext) {
  const tempRoot = resolve(tmpdir());
  const directory = mkdtempSync(join(tempRoot, 'bakeria-preorders-'));
  const path = join(directory, 'runtime.json');
  const store = openStore(path);
  const http = await serve(t, createApp(store.read, { write: store.write }));
  t.after(async () => {
    await http.close();
    assert.equal(dirname(resolve(directory)), tempRoot);
    assert.ok(basename(directory).startsWith('bakeria-preorders-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return { ...http, store, path };
}

async function request<T>(base: string, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(base + path, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  });
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  return { status: response.status, data: await response.json() as T };
}

function apiError(result: { status: number; data: ApiError }, status: number, code: ApiError['error']['code']) {
  assert.equal(result.status, status);
  assert.deepEqual(Object.keys(result.data), ['error']);
  assert.deepEqual(Object.keys(result.data.error).sort(), ['code', 'message']);
  assert.equal(result.data.error.code, code);
  assert.equal(typeof result.data.error.message, 'string');
  assert.ok(result.data.error.message.length > 0);
  assert.doesNotMatch(result.data.error.message, /\n\s*at |\.ts:\d|node_modules/);
}

test('legacy databases expose all historical orders and empty hub preorders without altering seed data', async t => {
  const seedBefore = readFileSync('data/seed.json', 'utf8');
  const { base, store } = await fixture(t);
  const before = store.read();
  assert.equal(before.preorders, undefined);
  const list = await request<OrderListResponse>(base, '/orders');
  assert.equal(list.status, 200);
  assert.equal(list.data.as_of, config.demoNow);
  assert.equal(list.data.orders.length, before.orders.length);
  assert.equal(new Set(list.data.orders.map(order => order.id)).size, before.orders.length);
  for (const original of before.orders) {
    const entry = list.data.orders.find(order => order.id === original.id)!;
    const customer = before.customers.find(row => row.id === original.customer_id)!;
    assert.ok(entry);
    assert.equal(entry.source, 'history');
    assert.equal(entry.status, 'collected');
    assert.equal(entry.customer_name, customer.name);
    assert.equal(entry.phone, customer.phone);
    assert.equal(entry.pickup_name, customer.name);
    assert.equal(entry.pickup_at, original.created_at);
    assert.equal(entry.note, '');
    assert.equal(entry.total_cents, original.total_cents);
    assert.deepEqual(entry.items, original.items);
  }
  const hub = await request<HubResponse>(base, '/hub/cus_025');
  assert.equal(hub.data.as_of, config.demoNow);
  assert.deepEqual(hub.data.preorders, []);
  assert.deepEqual(store.read(), before);
  assert.equal(readFileSync('data/seed.json', 'utf8'), seedBefore);
});

test('scheduled orders snapshot server prices, calculate totals, and appear only in the owning hub', async t => {
  const { base, store } = await fixture(t);
  const before = store.read();
  const beforeDetail = (await request<CustomerDetailResponse>(base, '/customers/cus_025')).data;
  const beforeMetrics = (await request<MetricsResponse>(base, '/metrics')).data;
  const [firstItem, secondItem] = before.menu_items;
  const body = orderRequest({ pickup_name: '  Maya for Grandma  ', note: '  No extra spoon, please.  ', items: [
    { menu_item_id: firstItem.id, quantity: 2 }, { menu_item_id: secondItem.id, quantity: 3 },
  ] });
  const created = await request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', body);
  assert.equal(created.status, 201);
  const preorder = created.data.preorder;
  assert.match(preorder.id, uuid);
  assert.notEqual(preorder.id, body.request_id);
  assert.equal(preorder.request_id, body.request_id);
  assert.equal(preorder.customer_id, 'cus_025');
  assert.equal(preorder.status, 'scheduled');
  assert.equal(preorder.created_at, config.demoNow);
  assert.equal(preorder.collected_at, null);
  assert.equal(preorder.pickup_name, 'Maya for Grandma');
  assert.equal(preorder.note, 'No extra spoon, please.');
  assert.equal(preorder.pickup_at, body.pickup_at);
  assert.equal(preorder.total_cents, firstItem.price_cents * 2 + secondItem.price_cents * 3);
  for (const line of preorder.items) {
    const menu = before.menu_items.find(item => item.id === line.menu_item_id)!;
    assert.equal(line.unit_price_cents, menu.price_cents);
    assert.equal(line.quantity, body.items.find(item => item.menu_item_id === line.menu_item_id)!.quantity);
  }
  const other = await request<PreorderResponse>(base, '/customers/cus_026/preorders', 'POST', orderRequest());
  assert.equal(other.status, 201);
  assert.deepEqual((await request<HubResponse>(base, '/hub/cus_025')).data.preorders, [preorder]);
  assert.deepEqual((await request<HubResponse>(base, '/hub/cus_026')).data.preorders, [other.data.preorder]);
  assert.deepEqual((await request<HubResponse>(base, '/hub/cus_027')).data.preorders, []);
  const list = (await request<OrderListResponse>(base, '/orders')).data.orders;
  assert.equal(list.length, before.orders.length + 2);
  assert.equal(new Set(list.map(order => order.id)).size, list.length);
  const entry = list.find(order => order.id === preorder.id)!;
  assert.equal(entry.source, 'order_ahead');
  assert.equal(entry.status, 'scheduled');
  assert.equal(entry.customer_name, 'Maya Patel');
  assert.equal(entry.pickup_name, 'Maya for Grandma');
  assert.equal(entry.phone, '+15195550125');
  assert.deepEqual((await request<CustomerDetailResponse>(base, '/customers/cus_025')).data, beforeDetail);
  assert.deepEqual((await request<MetricsResponse>(base, '/metrics')).data, beforeMetrics);
  assert.deepEqual(store.read().orders, before.orders);
  assert.deepEqual(store.read().customers, before.customers);
  assert.deepEqual(store.read().offers, before.offers);
});

test('preorder validation rejects tampered prices, duplicate items, invalid fields, and out-of-range pickup dates', async t => {
  const { base, store } = await fixture(t);
  const before = store.read();
  const body = orderRequest();
  const missingNote: Partial<PreorderRequest> = { ...body };
  delete missingNote.note;
  const invalid: unknown[] = [
    undefined, null, [], {}, missingNote,
    { ...body, total_cents: 1 }, { ...body, status: 'collected' }, { ...body, customer_id: 'cus_026' },
    { ...body, request_id: '' }, { ...body, request_id: 'not-a-uuid' }, { ...body, request_id: 42 },
    { ...body, pickup_name: '' }, { ...body, pickup_name: ' \n ' }, { ...body, pickup_name: 'x'.repeat(81) },
    { ...body, pickup_name: 123 }, { ...body, note: null }, { ...body, note: 1 }, { ...body, note: 'x'.repeat(301) },
    { ...body, pickup_at: pickupIn(15 * minute - 1) }, { ...body, pickup_at: pickupIn(7 * day + 1) },
    { ...body, pickup_at: 'not-a-date' }, { ...body, pickup_at: '2026-99-99T22:45:00.000Z' },
    { ...body, pickup_at: body.pickup_at.replace('.000Z', 'Z') },
    { ...body, pickup_at: body.pickup_at.replace('Z', '+00:00') }, { ...body, pickup_at: 42 },
    { ...body, items: [] }, { ...body, items: null }, { ...body, items: {} }, { ...body, items: [null] },
    { ...body, items: [{ menu_item_id: 'missing', quantity: 1 }] },
    { ...body, items: [{ menu_item_id: 'menu_strawberry', quantity: 1, unit_price_cents: 1 }] },
    { ...body, items: [{ menu_item_id: 'menu_strawberry', quantity: 1, price_cents: 1 }] },
    { ...body, items: [{ menu_item_id: 'menu_strawberry', quantity: 1 }, { menu_item_id: 'menu_strawberry', quantity: 2 }] },
    ...[0, -1, 21, 1.5, '2', true, null].map(quantity => ({ ...body, items: [{ menu_item_id: 'menu_strawberry', quantity }] })),
  ];
  for (const invalidBody of invalid) {
    apiError(await request<ApiError>(base, '/customers/cus_025/preorders', 'POST', invalidBody), 400, 'VALIDATION_ERROR');
  }
  const malformed = await fetch(base + '/customers/cus_025/preorders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"request_id":',
  });
  apiError({ status: malformed.status, data: await malformed.json() as ApiError }, 400, 'VALIDATION_ERROR');
  assert.deepEqual(store.read(), before);
});

test('preorders accept inclusive pickup, trimmed text, and quantity boundaries', async t => {
  const { base } = await fixture(t);
  for (const boundary of [
    { pickup_at: pickupIn(15 * minute), pickup_name: ' x ', note: '   ', quantity: 1 },
    { pickup_at: pickupIn(7 * day), pickup_name: ` ${'x'.repeat(80)} `, note: ` ${'x'.repeat(300)} `, quantity: 20 },
  ]) {
    const body = orderRequest({
      pickup_at: boundary.pickup_at, pickup_name: boundary.pickup_name, note: boundary.note,
      items: [{ menu_item_id: 'menu_strawberry', quantity: boundary.quantity }],
    });
    const result = await request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', body);
    assert.equal(result.status, 201);
    assert.equal(result.data.preorder.pickup_at, body.pickup_at);
    assert.equal(result.data.preorder.pickup_name, body.pickup_name.trim());
    assert.equal(result.data.preorder.note, body.note.trim());
    assert.equal(result.data.preorder.items[0].quantity, boundary.quantity);
  }
});

test('request IDs retry the same snapshot even after pickup passes and reject different content or customer', async t => {
  const { base, store } = await fixture(t);
  const body = orderRequest();
  const created = await request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', body);
  assert.equal(created.status, 201);
  const repeat = await request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', body);
  assert.equal(repeat.status, 200);
  assert.deepEqual(repeat.data, created.data);
  const repriced = store.read();
  repriced.menu_items.find(item => item.id === 'menu_strawberry')!.price_cents += 100;
  store.write(repriced);
  const afterReprice = await request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', body);
  assert.equal(afterReprice.status, 200);
  assert.deepEqual(afterReprice.data, created.data);
  for (const changed of [
    { ...body, pickup_name: 'Someone else' }, { ...body, note: 'Changed' }, { ...body, pickup_at: pickupIn(60 * minute) },
    { ...body, items: [{ menu_item_id: 'menu_strawberry', quantity: 3 }] },
  ]) {
    apiError(await request<ApiError>(base, '/customers/cus_025/preorders', 'POST', changed), 409, 'CONFLICT');
  }
  apiError(await request<ApiError>(base, '/customers/cus_026/preorders', 'POST', body), 409, 'CONFLICT');
  const originalNow = config.demoNow;
  t.after(() => { config.demoNow = originalNow; });
  config.demoNow = new Date(Date.parse(body.pickup_at) + minute).toISOString();
  const overdueRetry = await request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', body);
  assert.equal(overdueRetry.status, 200);
  assert.deepEqual(overdueRetry.data, created.data);
  assert.equal(store.read().preorders!.length, 1);
});

test('collection records exactly one historical sale and updates visits without automatic stamp or offer actions', async t => {
  const { base, store } = await fixture(t);
  const before = store.read();
  const beforeDetail = (await request<CustomerDetailResponse>(base, '/customers/cus_025')).data;
  const beforeMetrics = (await request<MetricsResponse>(base, '/metrics')).data;
  const created = await request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', orderRequest());
  assert.equal(created.status, 201);
  const path = `/preorders/${created.data.preorder.id}`;
  const collected = await request<PreorderResponse>(base, `${path}/collect`, 'POST', {});
  assert.equal(collected.status, 200);
  assert.equal(collected.data.preorder.status, 'collected');
  assert.equal(collected.data.preorder.collected_at, config.demoNow);
  const again = await request<PreorderResponse>(base, `${path}/collect`, 'POST', {});
  assert.equal(again.status, 200);
  assert.deepEqual(again.data, collected.data);
  apiError(await request<ApiError>(base, `${path}/cancel`, 'POST', {}), 409, 'CONFLICT');
  const db = store.read();
  assert.equal(db.orders.length, before.orders.length + 1);
  assert.deepEqual(db.orders.find(order => order.id === created.data.preorder.id), {
    id: created.data.preorder.id, customer_id: 'cus_025', items: created.data.preorder.items,
    total_cents: created.data.preorder.total_cents, created_at: config.demoNow,
  });
  const detail = (await request<CustomerDetailResponse>(base, '/customers/cus_025')).data;
  assert.equal(detail.customer.visits, beforeDetail.customer.visits + 1);
  assert.equal(detail.customer.total_spend_cents, beforeDetail.customer.total_spend_cents + created.data.preorder.total_cents);
  assert.equal(detail.customer.last_visit, config.demoNow);
  assert.equal(detail.customer.is_lapsed, false);
  assert.equal(detail.customer.stamps, beforeDetail.customer.stamps);
  assert.deepEqual(db.customers, before.customers);
  assert.deepEqual(db.offers, before.offers);
  const totals = (await request<MetricsResponse>(base, '/metrics')).data;
  assert.equal(totals.lapsed_regulars, beforeMetrics.lapsed_regulars - 1);
  assert.equal(totals.returning_customer_rate, beforeMetrics.returning_customer_rate);
  assert.equal(totals.offers_approved, beforeMetrics.offers_approved);
  assert.equal(totals.offers_redeemed, beforeMetrics.offers_redeemed);
  assert.equal(totals.revenue_recovered_cents, null);
  const list = (await request<OrderListResponse>(base, '/orders')).data.orders;
  assert.equal(list.length, before.orders.length + 1);
  assert.equal(new Set(list.map(order => order.id)).size, list.length);
  assert.equal(list.filter(order => order.id === created.data.preorder.id).length, 1);
  assert.equal(list.find(order => order.id === created.data.preorder.id)!.source, 'order_ahead');
  assert.equal(list.find(order => order.id === created.data.preorder.id)!.status, 'collected');
  assert.deepEqual((await request<HubResponse>(base, '/hub/cus_025')).data.preorders, [collected.data.preorder]);
});

test('cancellation is idempotent and leaves spend, visits, stamps, offers, and sales untouched', async t => {
  const { base, store } = await fixture(t);
  const before = store.read();
  const beforeDetail = (await request<CustomerDetailResponse>(base, '/customers/cus_025')).data;
  const beforeMetrics = (await request<MetricsResponse>(base, '/metrics')).data;
  const body = orderRequest();
  const created = await request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', body);
  assert.equal(created.status, 201);
  const path = `/preorders/${created.data.preorder.id}`;
  const cancelled = await request<PreorderResponse>(base, `${path}/cancel`, 'POST', {});
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.preorder.status, 'cancelled');
  assert.equal(cancelled.data.preorder.collected_at, null);
  const again = await request<PreorderResponse>(base, `${path}/cancel`, 'POST', {});
  assert.equal(again.status, 200);
  assert.deepEqual(again.data, cancelled.data);
  apiError(await request<ApiError>(base, `${path}/collect`, 'POST', {}), 409, 'CONFLICT');
  const retry = await request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', body);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.data, cancelled.data);
  assert.deepEqual((await request<CustomerDetailResponse>(base, '/customers/cus_025')).data, beforeDetail);
  assert.deepEqual((await request<MetricsResponse>(base, '/metrics')).data, beforeMetrics);
  assert.deepEqual(store.read().orders, before.orders);
  assert.deepEqual(store.read().customers, before.customers);
  assert.deepEqual(store.read().offers, before.offers);
  assert.deepEqual((await request<HubResponse>(base, '/hub/cus_025')).data.preorders, [cancelled.data.preorder]);
});

test('simultaneous submission and collection retries cannot duplicate preorders or historical sales', async t => {
  const { base, store } = await fixture(t);
  const beforeCount = store.read().orders.length;
  const body = orderRequest();
  const results = await Promise.all(Array.from({ length: 8 }, () =>
    request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', body)));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 200, 200, 200, 200, 200, 200, 201]);
  assert.equal(new Set(results.map(result => result.data.preorder.id)).size, 1);
  assert.equal(store.read().preorders!.length, 1);
  assert.equal(store.read().orders.length, beforeCount);
  const id = results[0].data.preorder.id;
  const collections = await Promise.all(Array.from({ length: 8 }, () =>
    request<PreorderResponse>(base, `/preorders/${id}/collect`, 'POST', {})));
  assert.ok(collections.every(result => result.status === 200 && result.data.preorder.status === 'collected'));
  assert.equal(store.read().orders.length, beforeCount + 1);
  assert.equal(store.read().orders.filter(order => order.id === id).length, 1);
});

test('preorder entity errors and terminal action bodies follow the contracted JSON errors', async t => {
  const { base, store } = await fixture(t);
  apiError(await request<ApiError>(base, '/customers/missing/preorders', 'POST', orderRequest()), 404, 'NOT_FOUND');
  const created = await request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', orderRequest());
  assert.equal(created.status, 201);
  const before = store.read();
  for (const action of ['collect', 'cancel']) {
    apiError(await request<ApiError>(base, `/preorders/missing/${action}`, 'POST', {}), 404, 'NOT_FOUND');
    for (const body of [undefined, null, [], { status: 'collected' }]) {
      apiError(await request<ApiError>(base, `/preorders/${created.data.preorder.id}/${action}`, 'POST', body), 400, 'VALIDATION_ERROR');
    }
  }
  assert.deepEqual(store.read(), before);
});

test('scheduled, collected, and cancelled preorders persist across restart without changing the frozen seed', async t => {
  const seedBefore = readFileSync('data/seed.json', 'utf8');
  const { base, store, path, close } = await fixture(t);
  const bodies = [orderRequest(), orderRequest(), orderRequest()];
  const created: Preorder[] = [];
  for (const body of bodies) {
    const response = await request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', body);
    assert.equal(response.status, 201);
    created.push(response.data.preorder);
  }
  assert.equal((await request<PreorderResponse>(base, `/preorders/${created[1].id}/collect`, 'POST', {})).status, 200);
  assert.equal((await request<PreorderResponse>(base, `/preorders/${created[2].id}/cancel`, 'POST', {})).status, 200);
  const beforeRestart = store.read();
  await close();
  const reopened = openStore(path);
  const restarted = await serve(t, createApp(reopened.read, { write: reopened.write }));
  assert.deepEqual(reopened.read(), beforeRestart);
  const hub = (await request<HubResponse>(restarted.base, '/hub/cus_025')).data;
  assert.equal(hub.preorders.length, 3);
  assert.deepEqual(hub.preorders.map(order => order.status).sort(), ['cancelled', 'collected', 'scheduled']);
  for (const body of bodies) {
    const retry = await request<PreorderResponse>(restarted.base, '/customers/cus_025/preorders', 'POST', body);
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.data.preorder, beforeRestart.preorders!.find(order => order.request_id === body.request_id));
  }
  assert.equal(reopened.read().orders.filter(order => order.id === created[1].id).length, 1);
  assert.equal(reopened.read().preorders!.length, 3);
  assert.equal(readFileSync('data/seed.json', 'utf8'), seedBefore);
});

test('a failed collection write leaves both preorder status and historical orders unchanged', async t => {
  let db: Database = readSeed();
  let failWrites = false;
  const { base } = await serve(t, createApp(() => db, { write: next => {
    if (failWrites) throw new Error('private-preorder-storage-error');
    db = next;
  } }));
  const created = await request<PreorderResponse>(base, '/customers/cus_025/preorders', 'POST', orderRequest());
  assert.equal(created.status, 201);
  const before = structuredClone(db);
  failWrites = true;
  const result = await request<ApiError>(base, `/preorders/${created.data.preorder.id}/collect`, 'POST', {});
  apiError(result, 500, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(result.data).includes('private-preorder-storage-error'));
  assert.deepEqual(db, before);
  assert.equal((await request<HubResponse>(base, '/hub/cus_025')).data.preorders[0].status, 'scheduled');
});
