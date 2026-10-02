// Dev 2 local test for the ?mock=1 overlay adapter. Run: npx tsx --test src/dashboard/mock.test.ts
// Not part of npm test; it checks that the mock follows CONTRACTS.md mutation rules.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CustomerDetailResponse, CustomerSummary, MetricsResponse, Offer } from '../shared/contracts';
import type { DashboardClient } from './client';
import { createMockClient } from './mock';

const asOf = '2026-10-02T22:30:00.000Z';
const maya: CustomerSummary = {
  id: 'cus_025', name: 'Maya Patel', phone: '+15195550125', joined_at: '2026-07-15T22:30:00.000Z', stamps: 9,
  visits: 9, favorite_item: { id: 'menu_strawberry', name: 'Strawberry Cloud Parfait', price_cents: 750 },
  last_visit: '2026-09-10T22:30:00.000Z', total_spend_cents: 6750, usual_gap_days: 7, days_since_last_visit: 22, is_lapsed: true,
};
const cached: Offer = { id: 'offer_cache_cus_025', customer_id: 'cus_025', message: 'Hi Maya! Cached text.', status: 'draft', source: 'cached', created_at: '2026-10-01T00:00:00.000Z' };
const metrics: MetricsResponse = { as_of: asOf, returning_customer_rate: 0.8, lapsed_regulars: 6, offers_approved: 0, offers_redeemed: 0, revenue_at_risk_cents: null, revenue_recovered_cents: null };

function fakeReal(): DashboardClient {
  const detail = (): CustomerDetailResponse => ({ customer: { ...maya }, orders: [], offers: [cached] });
  const unsupported = () => Promise.reject(new Error('real mutation should not be called in mock mode'));
  return {
    config: async () => ({ as_of: asOf, reward_target: 10, order_form_url: null, demo_mode: true }),
    menu: async () => ({ menu_items: [] }),
    customers: async () => ({ customers: [{ ...maya }], as_of: asOf }),
    customer: async () => detail(),
    metrics: async () => ({ ...metrics }),
    addStamp: unsupported, draftOffer: unsupported, saveOffer: unsupported, approveOffer: unsupported,
  };
}

test('stamps cap at ten and the overlay shows in reads', async () => {
  const mock = createMockClient(fakeReal());
  const first = await mock.addStamp('cus_025');
  assert.equal(first.customer.stamps, 10);
  assert.deepEqual(Object.keys(first.customer).sort(), ['id', 'joined_at', 'name', 'phone', 'stamps']);
  await assert.rejects(mock.addStamp('cus_025'), /full/);
  assert.equal((await mock.customer('cus_025')).customer.stamps, 10);
  assert.equal((await mock.customers({})).customers[0].stamps, 10);
});

test('draft, edit, approve follow the contract and update metrics', async () => {
  const mock = createMockClient(fakeReal());
  const { offer } = await mock.draftOffer('cus_025');
  assert.equal(offer.status, 'draft');
  assert.equal(offer.source, 'cached');
  assert.equal(offer.message, cached.message);
  assert.ok(offer.created_at > cached.created_at, 'new draft sorts newest first');

  const detail = await mock.customer('cus_025');
  assert.deepEqual(detail.offers.map(o => o.id), [offer.id, cached.id]);

  await assert.rejects(mock.saveOffer(offer.id, '   '), /1–280/);
  await assert.rejects(mock.saveOffer(offer.id, 'x'.repeat(281)), /1–280/);
  const saved = await mock.saveOffer(offer.id, '  Hi Maya! Edited text.  ');
  assert.equal(saved.offer.message, 'Hi Maya! Edited text.');

  const approved = await mock.approveOffer(offer.id);
  assert.equal(approved.offer.status, 'approved');
  assert.equal((await mock.approveOffer(offer.id)).offer.status, 'approved', 'idempotent');
  await assert.rejects(mock.saveOffer(offer.id, 'too late'), /draft/);

  const m = await mock.metrics();
  assert.equal(m.offers_approved, 1);
  assert.equal(m.offers_redeemed, 0);
  assert.equal(m.revenue_at_risk_cents, null, 'stretch figures stay null');
});

test('seed cached draft can be edited only after it has been read', async () => {
  const mock = createMockClient(fakeReal());
  await assert.rejects(mock.saveOffer(cached.id, 'hello'), /not found/);
  await mock.customer('cus_025');
  const saved = await mock.saveOffer(cached.id, 'hello');
  assert.equal(saved.offer.message, 'hello');
  assert.equal((await mock.customer('cus_025')).offers[0].message, 'hello');
});
