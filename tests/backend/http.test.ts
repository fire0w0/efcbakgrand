import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../server/app';
import { config } from '../../server/config';
import { openStore, readSeed } from '../../server/store';
import type {
  ApiError, CustomerDetailResponse, CustomerListResponse, HealthResponse, HubResponse,
  JoinResponse, MetricsResponse, OfferResponse, RewardRedeemResponse, StampResponse,
} from '../../src/shared/contracts';

type AppOptions = NonNullable<Parameters<typeof createApp>[1]>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function fixture(t: TestContext, options: AppOptions = {}) {
  const tempRoot = resolve(tmpdir());
  const directory = mkdtempSync(join(tempRoot, 'bakeria-backend-'));
  const path = join(directory, 'runtime.json');
  const store = openStore(path);
  const cached: NonNullable<AppOptions['generateOffer']> = async (db, customerId) => ({
    message: db.offers.find(offer => offer.customer_id === customerId)!.message,
    source: 'cached',
  });
  const http = await serve(t, createApp(store.read, { write: store.write, generateOffer: cached, ...options }));
  t.after(async () => {
    await http.close();
    // Only remove the temporary directory created by this test.
    assert.equal(dirname(resolve(directory)), tempRoot);
    assert.ok(basename(directory).startsWith('bakeria-backend-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return { ...http, path, directory, store };
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

test('ready app preserves the read-only factory seam and isolates its in-memory writes', async t => {
  const seed = readSeed();
  const original = structuredClone(seed);
  const first = await serve(t, createApp(() => seed));
  const second = await serve(t, createApp(() => seed));
  const health = await request<HealthResponse>(first.base, '/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.data, { ok: true, mode: 'ready' });
  const stamped = await request<StampResponse>(first.base, '/customers/cus_025/stamps', 'POST', {});
  assert.equal(stamped.status, 200);
  assert.equal(stamped.data.customer.stamps, 10);
  assert.equal((await request<HubResponse>(first.base, '/hub/cus_025')).data.customer.stamps, 10);
  assert.equal((await request<HubResponse>(second.base, '/hub/cus_025')).data.customer.stamps, 9);
  assert.deepEqual(seed, original);
});

test('the one-argument app factory reads fresh source data until its first in-memory mutation', async t => {
  const seed = readSeed();
  const { base } = await serve(t, createApp(() => seed));
  assert.equal((await request<HubResponse>(base, '/hub/cus_025')).data.customer.stamps, 9);
  seed.customers.find(customer => customer.id === 'cus_025')!.stamps = 8;
  assert.equal((await request<HubResponse>(base, '/hub/cus_025')).data.customer.stamps, 8);
  assert.equal((await request<StampResponse>(base, '/customers/cus_025/stamps', 'POST', {})).data.customer.stamps, 9);
  assert.equal(seed.customers.find(customer => customer.id === 'cus_025')!.stamps, 8);
  seed.customers.find(customer => customer.id === 'cus_025')!.stamps = 7;
  assert.equal((await request<HubResponse>(base, '/hub/cus_025')).data.customer.stamps, 9);
});

test('phone variants share identity; a new join survives closing and reopening the store', async t => {
  const { base, path, store, close } = await fixture(t);
  const before = (await request<MetricsResponse>(base, '/metrics')).data;
  for (const phone of ['5195550125', '(519) 555-0125', '519.555.0125', '1 519 555 0125', '+1 (519) 555-0125']) {
    const joined = await request<JoinResponse>(base, '/hub/join', 'POST', { phone });
    assert.equal(joined.status, 200, phone);
    assert.equal(joined.data.created, false);
    assert.equal(joined.data.customer.id, 'cus_025');
    assert.equal(joined.data.customer.phone, '+15195550125');
  }
  const joined = await request<JoinResponse>(base, '/hub/join', 'POST', { phone: '(519) 555-0199' });
  assert.equal(joined.status, 201);
  assert.equal(joined.data.created, true);
  assert.match(joined.data.customer.id, uuid);
  assert.deepEqual(joined.data.customer, {
    id: joined.data.customer.id, name: 'New friend', phone: '+15195550199',
    joined_at: config.demoNow, stamps: 0,
  });
  const detail = (await request<CustomerDetailResponse>(base, `/customers/${joined.data.customer.id}`)).data;
  assert.equal(detail.customer.visits, 0);
  assert.equal(detail.customer.favorite_item, null);
  assert.equal(detail.customer.last_visit, null);
  assert.equal(detail.customer.usual_gap_days, null);
  assert.equal(detail.customer.days_since_last_visit, null);
  assert.equal(detail.customer.total_spend_cents, 0);
  assert.equal(detail.customer.is_lapsed, false);
  assert.deepEqual(detail.orders, []);
  assert.deepEqual(detail.offers, []);
  assert.equal(store.read().customers.length, 51);
  assert.deepEqual((await request<MetricsResponse>(base, '/metrics')).data, before);
  await close();
  const reopened = openStore(path);
  const restarted = await serve(t, createApp(reopened.read, { write: reopened.write }));
  const repeat = await request<JoinResponse>(restarted.base, '/hub/join', 'POST', { phone: '+1-519-555-0199' });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.data.created, false);
  assert.deepEqual(repeat.data.customer, joined.data.customer);
  assert.equal(reopened.read().customers.length, 51);
});

test('invalid phones, mutation fields, JSON, and list queries return contracted validation errors', async t => {
  const { base, store } = await fixture(t);
  const before = store.read();
  for (const phone of ['', ' ', '519555012', '51955501256', '25195550125', '+5195550125', '++15195550125',
    '15195550125+', '519/555/0125', '5195550125 ext 1', '519\t5550125', null, 5195550125]) {
    apiError(await request<ApiError>(base, '/hub/join', 'POST', { phone }), 400, 'VALIDATION_ERROR');
  }
  for (const body of [{}, { phone: '5195550125', name: 'Maya' }, [], null, '5195550125']) {
    apiError(await request<ApiError>(base, '/hub/join', 'POST', body), 400, 'VALIDATION_ERROR');
  }
  const emptyRoutes = [
    '/customers/cus_025/stamps', '/customers/cus_025/rewards/redeem', '/customers/cus_025/offers/draft',
    '/offers/offer_cache_cus_025/approve', '/offers/offer_cache_cus_025/redeem',
  ];
  for (const path of emptyRoutes) {
    for (const body of [undefined, null, [], { extra: true }]) {
      apiError(await request<ApiError>(base, path, 'POST', body), 400, 'VALIDATION_ERROR');
    }
  }
  for (const query of ['sort=wrong', 'direction=up', 'lapsed=1', 'sort=name&sort=name',
    'direction=asc&direction=desc', 'lapsed=true&lapsed=false', 'search=Maya', 'sort%5Bname%5D=name']) {
    apiError(await request<ApiError>(base, `/customers?${query}`), 400, 'VALIDATION_ERROR');
  }
  for (const body of ['{"phone":', '{"phone":"' + '1'.repeat(40_000) + '"}']) {
    const response = await fetch(base + '/hub/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    apiError({ status: response.status, data: await response.json() as ApiError }, 400, 'VALIDATION_ERROR');
  }
  for (const [contentType, body] of [['application/json', ''], ['text/plain', '{}'],
    ['application/x-www-form-urlencoded', 'phone=5195550125']]) {
    const response = await fetch(base + '/customers/cus_025/stamps', {
      method: 'POST', headers: { 'Content-Type': contentType }, body,
    });
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    apiError({ status: response.status, data: await response.json() as ApiError }, 400, 'VALIDATION_ERROR');
  }
  const compressed = await fetch(base + '/customers/cus_025/stamps', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body: '{}',
  });
  assert.match(compressed.headers.get('content-type') ?? '', /application\/json/);
  apiError({ status: compressed.status, data: await compressed.json() as ApiError }, 400, 'VALIDATION_ERROR');
  apiError(await request<ApiError>(base, '/customers/%E0%A4%A'), 400, 'VALIDATION_ERROR');
  assert.deepEqual(store.read(), before);
});

test('unknown routes and exact entity IDs return JSON not-found errors', async t => {
  const { base } = await fixture(t);
  for (const path of ['/missing', '/customers/missing', '/hub/missing', '/customers/15195550125', '/hub/CUS_025']) {
    apiError(await request<ApiError>(base, path), 404, 'NOT_FOUND');
  }
  for (const path of ['/customers/missing/stamps', '/customers/missing/rewards/redeem', '/customers/missing/offers/draft',
    '/offers/missing/approve', '/offers/missing/redeem']) {
    apiError(await request<ApiError>(base, path, 'POST', {}), 404, 'NOT_FOUND');
  }
  apiError(await request<ApiError>(base, '/offers/missing', 'PATCH', { message: 'A valid message' }), 404, 'NOT_FOUND');
});

test('stamp card caps at ten and reward reset persists without inventing sales', async t => {
  const { base, path, store, directory } = await fixture(t);
  const original = store.read();
  const before = (await request<MetricsResponse>(base, '/metrics')).data;
  apiError(await request<ApiError>(base, '/customers/cus_025/rewards/redeem', 'POST', {}), 409, 'CONFLICT');
  const stamped = await request<StampResponse>(base, '/customers/cus_025/stamps', 'POST', {});
  assert.equal(stamped.status, 200);
  assert.equal(stamped.data.customer.stamps, 10);
  apiError(await request<ApiError>(base, '/customers/cus_025/stamps', 'POST', {}), 409, 'CONFLICT');
  assert.equal((await request<HubResponse>(base, '/hub/cus_025')).data.customer.stamps, 10);
  const redeemed = await request<RewardRedeemResponse>(base, '/customers/cus_025/rewards/redeem', 'POST', {});
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.data.redeemed, true);
  assert.equal(redeemed.data.customer.stamps, 0);
  apiError(await request<ApiError>(base, '/customers/cus_025/rewards/redeem', 'POST', {}), 409, 'CONFLICT');
  assert.equal((await request<HubResponse>(base, '/hub/cus_025')).data.customer.stamps, 0);
  assert.equal(openStore(path).read().customers.find(customer => customer.id === 'cus_025')!.stamps, 0);
  assert.deepEqual(store.read().orders, original.orders);
  assert.deepEqual(store.read().offers, original.offers);
  assert.deepEqual((await request<MetricsResponse>(base, '/metrics')).data, before);
  assert.deepEqual(readdirSync(directory), ['runtime.json']);
});

test('fresh drafts preserve fallback templates and edited approval reaches only the correct hub', async t => {
  const { base, store, path } = await fixture(t);
  const fallbackRows = store.read().offers;
  const originalOrders = store.read().orders;
  const created = await request<OfferResponse>(base, '/customers/cus_025/offers/draft', 'POST', {});
  assert.equal(created.status, 201);
  assert.match(created.data.offer.id, uuid);
  assert.equal(created.data.offer.status, 'draft');
  assert.equal(created.data.offer.customer_id, 'cus_025');
  assert.equal(created.data.offer.source, 'cached');
  assert.equal(created.data.offer.created_at, config.demoNow);
  assert.equal(created.data.offer.message, fallbackRows.find(offer => offer.customer_id === 'cus_025')!.message);
  const second = await request<OfferResponse>(base, '/customers/cus_025/offers/draft', 'POST', {});
  assert.equal(second.status, 201);
  assert.match(second.data.offer.id, uuid);
  assert.notEqual(second.data.offer.id, created.data.offer.id);
  assert.deepEqual(store.read().offers.filter(offer => fallbackRows.some(row => row.id === offer.id)), fallbackRows);
  assert.deepEqual((await request<HubResponse>(base, '/hub/cus_025')).data.offers, []);
  const offerPath = `/offers/${created.data.offer.id}`;
  apiError(await request<ApiError>(base, `${offerPath}/redeem`, 'POST', {}), 409, 'CONFLICT');
  const editedMessage = 'Maya, enjoy a lovely free topping with your next parfait!';
  const edited = await request<OfferResponse>(base, offerPath, 'PATCH', { message: `  ${editedMessage}  ` });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.offer.message, editedMessage);
  assert.equal(edited.data.offer.status, 'draft');
  assert.deepEqual((await request<HubResponse>(base, '/hub/cus_025')).data.offers, []);
  const approved = await request<OfferResponse>(base, `${offerPath}/approve`, 'POST', {});
  assert.equal(approved.status, 200);
  assert.equal(approved.data.offer.status, 'approved');
  assert.equal(approved.data.offer.message, editedMessage);
  assert.deepEqual((await request<OfferResponse>(base, `${offerPath}/approve`, 'POST', {})).data, approved.data);
  apiError(await request<ApiError>(base, offerPath, 'PATCH', { message: 'Changed after approval' }), 409, 'CONFLICT');
  assert.deepEqual((await request<HubResponse>(base, '/hub/cus_025')).data.offers, [approved.data.offer]);
  assert.deepEqual((await request<HubResponse>(base, '/hub/cus_026')).data.offers, []);
  let totals = (await request<MetricsResponse>(base, '/metrics')).data;
  assert.equal(totals.offers_approved, 1);
  assert.equal(totals.offers_redeemed, 0);
  assert.equal(totals.revenue_at_risk_cents, null);
  assert.equal(totals.revenue_recovered_cents, null);
  const redeemed = await request<OfferResponse>(base, `${offerPath}/redeem`, 'POST', {});
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.data.offer.status, 'redeemed');
  assert.deepEqual((await request<OfferResponse>(base, `${offerPath}/redeem`, 'POST', {})).data, redeemed.data);
  apiError(await request<ApiError>(base, `${offerPath}/approve`, 'POST', {}), 409, 'CONFLICT');
  apiError(await request<ApiError>(base, offerPath, 'PATCH', { message: 'Changed after redemption' }), 409, 'CONFLICT');
  totals = (await request<MetricsResponse>(base, '/metrics')).data;
  assert.equal(totals.offers_approved, 1);
  assert.equal(totals.offers_redeemed, 1);
  assert.equal(totals.revenue_at_risk_cents, null);
  assert.equal(totals.revenue_recovered_cents, null);
  const hub = (await request<HubResponse>(base, '/hub/cus_025')).data;
  assert.deepEqual(hub.offers, [redeemed.data.offer]);
  assert.equal(hub.customer.stamps, 9);
  assert.deepEqual(store.read().orders, originalOrders);
  const reopened = openStore(path).read();
  assert.deepEqual(reopened.offers.find(offer => offer.id === redeemed.data.offer.id), redeemed.data.offer);
  assert.deepEqual(reopened.offers.filter(offer => fallbackRows.some(row => row.id === offer.id)), fallbackRows);
});

test('offer editing validates type, exact fields, trimmed length, and boundary lengths', async t => {
  const { base } = await fixture(t);
  const created = await request<OfferResponse>(base, '/customers/cus_025/offers/draft', 'POST', {});
  const path = `/offers/${created.data.offer.id}`;
  for (const body of [{}, [], null, { message: '' }, { message: ' \n ' }, { message: 'a'.repeat(281) },
    { message: 1 }, { message: null }, { message: 'Fine', status: 'approved' }]) {
    apiError(await request<ApiError>(base, path, 'PATCH', body), 400, 'VALIDATION_ERROR');
  }
  for (const message of ['x', 'x'.repeat(280)]) {
    const edited = await request<OfferResponse>(base, path, 'PATCH', { message: ` ${message} ` });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.offer.message, message);
  }
});

test('original cached fallback templates cannot be edited, approved, or redeemed', async t => {
  const { base, store } = await fixture(t);
  const before = store.read();
  for (const template of before.offers) {
    const path = `/offers/${template.id}`;
    apiError(await request<ApiError>(base, path, 'PATCH', { message: 'Changed fallback' }), 409, 'CONFLICT');
    apiError(await request<ApiError>(base, `${path}/approve`, 'POST', {}), 409, 'CONFLICT');
    apiError(await request<ApiError>(base, `${path}/redeem`, 'POST', {}), 409, 'CONFLICT');
  }
  assert.deepEqual(store.read(), before);
});

test('customer sorting keeps missing history last in both directions after a new join', async t => {
  const { base } = await fixture(t);
  const joined = await request<JoinResponse>(base, '/hub/join', 'POST', { phone: '5195550198' });
  for (const sort of ['favorite_item', 'last_visit']) {
    for (const direction of ['asc', 'desc']) {
      const list = await request<CustomerListResponse>(base, `/customers?sort=${sort}&direction=${direction}`);
      assert.equal(list.status, 200);
      assert.equal(list.data.customers.at(-1)!.id, joined.data.customer.id);
    }
  }
  const list = (await request<CustomerListResponse>(base, '/customers?sort=visits&direction=desc')).data.customers;
  for (let index = 1; index < list.length; index++) {
    assert.ok(list[index - 1].visits >= list[index].visits);
    if (list[index - 1].visits === list[index].visits) {
      assert.ok(list[index - 1].id.localeCompare(list[index].id) < 0);
    }
  }
});

test('in-flight offer generation preserves concurrent stamps, joins, and other new drafts', { timeout: 10_000 }, async t => {
  let release!: () => void;
  const generated = new Promise<void>(resolve => { release = resolve; });
  let allStarted!: () => void;
  const started = new Promise<void>(resolve => { allStarted = resolve; });
  let calls = 0;
  const { base, store, path } = await fixture(t, {
    generateOffer: async () => {
      calls++;
      if (calls === 2) allStarted();
      await generated;
      return { message: 'Maya, enjoy a free topping with your next parfait!', source: 'ai' };
    },
  });
  t.after(release);
  const pending = [
    request<OfferResponse>(base, '/customers/cus_025/offers/draft', 'POST', {}),
    request<OfferResponse>(base, '/customers/cus_025/offers/draft', 'POST', {}),
  ];
  await started;
  const stamped = await request<StampResponse>(base, '/customers/cus_025/stamps', 'POST', {});
  assert.equal(stamped.status, 200);
  assert.equal(stamped.data.customer.stamps, 10);
  const joined = await request<JoinResponse>(base, '/hub/join', 'POST', { phone: '5195550197' });
  assert.equal(joined.status, 201);
  release();
  const offers = await Promise.all(pending);
  assert.ok(offers.every(result => result.status === 201 && result.data.offer.source === 'ai'));
  assert.notEqual(offers[0].data.offer.id, offers[1].data.offer.id);
  assert.equal(store.read().customers.find(customer => customer.id === 'cus_025')!.stamps, 10);
  const reopened = openStore(path).read();
  assert.equal(reopened.customers.length, 51);
  assert.ok(reopened.customers.some(customer => customer.id === joined.data.customer.id));
  assert.equal(reopened.offers.length, 8);
  for (const result of offers) {
    assert.deepEqual(reopened.offers.find(offer => offer.id === result.data.offer.id), result.data.offer);
  }
});

test('failed persistence returns a generic error without mutating state or leaking details', async t => {
  const secret = 'private-storage-path-and-key';
  const seed = readSeed();
  const { base } = await serve(t, createApp(() => structuredClone(seed), {
    write: () => { throw new Error(secret); },
  }));
  const result = await request<ApiError>(base, '/customers/cus_025/stamps', 'POST', {});
  apiError(result, 500, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(result.data).includes(secret));
  assert.equal((await request<HubResponse>(base, '/hub/cus_025')).data.customer.stamps, 9);
});

test('runtime storage refuses the frozen seed as its data file', () => {
  const before = readFileSync('data/seed.json', 'utf8');
  assert.throws(() => openStore('data/seed.json'), /seed/i);
  assert.equal(readFileSync('data/seed.json', 'utf8'), before);
});
