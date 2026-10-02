# Shared contracts — frozen at commit-0

Assumptions: CAD; one local server; synthetic customer data; fixed demo clock October 2, 2026 at 6:30 PM Toronto; no authentication; all three developers approve shared changes. This file is the **only authored definition of shared shapes**. The TypeScript block generates `src/shared/contracts.ts`; do not edit the generated file. Examples, fixtures, and seed JSON are instances, not competing definitions.

## Canonical types and database schema

The database is one JSON document with four table arrays, exactly `Database` below. No SQL server, ORM, migrations, or cloud account. Runtime storage is `DATA_FILE`; the committed seed is immutable. This is deliberate demo storage, not a production database.

<!-- TYPES:START -->
```typescript
export type ID = string;
export type ISODateTime = string;
export type Cents = number;
export type OfferStatus = 'draft' | 'approved' | 'redeemed';
export type OfferSource = 'ai' | 'cached';
export interface MenuItem {
  id: ID;
  name: string;
  price_cents: Cents;
}
export interface Customer {
  id: ID;
  name: string;
  phone: string;
  joined_at: ISODateTime;
  stamps: number;
}
export interface OrderItem {
  menu_item_id: ID;
  quantity: number;
  unit_price_cents: Cents;
}
export interface Order {
  id: ID;
  customer_id: ID;
  items: OrderItem[];
  total_cents: Cents;
  created_at: ISODateTime;
}
export interface Offer {
  id: ID;
  customer_id: ID;
  message: string;
  status: OfferStatus;
  source: OfferSource;
  created_at: ISODateTime;
}
export interface Database {
  menu_items: MenuItem[];
  customers: Customer[];
  orders: Order[];
  offers: Offer[];
}
export interface CustomerSummary extends Customer {
  visits: number;
  favorite_item: MenuItem | null;
  last_visit: ISODateTime | null;
  total_spend_cents: Cents;
  usual_gap_days: number | null;
  days_since_last_visit: number | null;
  is_lapsed: boolean;
}
export interface CustomerListQuery {
  sort?: 'name' | 'visits' | 'favorite_item' | 'last_visit' | 'total_spend_cents';
  direction?: 'asc' | 'desc';
  lapsed?: 'true' | 'false';
}
export interface HealthResponse { ok: true; mode: 'scaffold' | 'ready'; }
export interface ConfigResponse {
  as_of: ISODateTime;
  reward_target: number;
  order_form_url: string | null;
  demo_mode: true;
}
export interface MenuResponse { menu_items: MenuItem[]; }
export interface CustomerListResponse { customers: CustomerSummary[]; as_of: ISODateTime; }
export interface CustomerDetailResponse { customer: CustomerSummary; orders: Order[]; offers: Offer[]; }
export interface HubResponse {
  customer: Customer;
  reward_target: number;
  order_form_url: string | null;
  offers: Offer[];
}
export interface JoinRequest { phone: string; }
export interface JoinResponse { customer: Customer; created: boolean; }
export interface EmptyRequest {}
export interface StampResponse { customer: Customer; }
export interface RewardRedeemResponse { customer: Customer; redeemed: true; }
export interface OfferEditRequest { message: string; }
export interface OfferResponse { offer: Offer; }
export interface MetricsResponse {
  as_of: ISODateTime;
  returning_customer_rate: number;
  lapsed_regulars: number;
  offers_approved: number;
  offers_redeemed: number;
  revenue_at_risk_cents: Cents | null;
  revenue_recovered_cents: Cents | null;
}
export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'NOT_IMPLEMENTED' | 'INTERNAL_ERROR';
export interface ApiError { error: { code: ErrorCode; message: string; }; }
```
<!-- TYPES:END -->

### Storage constraints

- IDs are nonempty strings, unique within each table. Seed uses `cus_001`…`cus_050`, `ord_00001` onward, `offer_cache_cus_025`…`offer_cache_cus_030`. New entities use `crypto.randomUUID()`. IDs are opaque to clients.
- References: `orders.customer_id` and `offers.customer_id` reference customers; every order item references menu items. No delete operations tonight.
- Phone is unique, normalized NANP E.164 (`+1` plus ten digits). Strip spaces, parentheses, periods and hyphens; accept ten digits or eleven starting with 1, with optional leading `+` only on the eleven-digit form. Reject all other input. Seed numbers use reserved fictional `519-555-01xx` values.
- Dates are UTC ISO strings with milliseconds. Business display uses `America/Toronto`. Use `DEMO_NOW` for new records and all calculations, not the laptop clock. Orders after `as_of` must not enter calculations.
- All money is nonnegative integer CAD cents. Menu name is 1–80 trimmed characters; customer name is 1–80 trimmed characters. Order quantity is a positive integer, at least one item per order, and total equals the sum of quantity × historical unit price. Never recompute historic prices from current menu prices.
- Stamps are integers 0–10. Add one per Grandma click, cap at 10, and return 409 when already at 10. Reward redemption requires 10 and resets to 0. Adding a stamp does **not** create a sale or change visit/spend metrics; checkout is mocked.
- Offer message is trimmed, 1–280 characters. Offer transitions are `draft → approved → redeemed`. Editing is allowed only in draft. Approval of an already approved offer is idempotent; approval after redemption is 409. Redemption of an already redeemed offer is idempotent; draft redemption is 409. Approval is an in-app preview and never triggers SMS/email.
- All writes use one synchronous read/validate/write operation. Do not hold a stale database snapshot across an awaited LLM call: await generation first, then reread the store to append the draft. Atomically replace the runtime JSON via a temporary file; only one server process may write it.

## HTTP API

Base `/api`, same origin, JSON request and response, no cookies or auth headers. No success envelope other than the named response. No pagination for 50 customers. Path IDs match exact existing IDs; never infer a phone from an ID. Unknown API route or missing entity returns 404. Unsupported list query values and invalid JSON/body fields return 400. Clients ignore unknown response fields; server rejects unknown mutation fields. Empty request means exactly `{}`. GET requests have no body.

| Method and path | Query / JSON request | Success | Failure cases beyond 500 |
| --- | --- | --- | --- |
| GET `/health` | none | 200 `HealthResponse` | none |
| GET `/config` | none | 200 `ConfigResponse` | none |
| GET `/menu` | none | 200 `MenuResponse` | none |
| GET `/customers` | `CustomerListQuery` | 200 `CustomerListResponse` | 400 invalid query |
| GET `/customers/:id` | none | 200 `CustomerDetailResponse` | 404 |
| GET `/hub/:id` | none | 200 `HubResponse` | 404 |
| GET `/metrics` | none | 200 `MetricsResponse` | none |
| POST `/hub/join` | `JoinRequest` | 200 existing / 201 created `JoinResponse` | 400 invalid phone |
| POST `/customers/:id/stamps` | `EmptyRequest` | 200 `StampResponse` | 400, 404, 409 full card |
| POST `/customers/:id/rewards/redeem` | `EmptyRequest` | 200 `RewardRedeemResponse` | 400, 404, 409 fewer than 10 stamps |
| POST `/customers/:id/offers/draft` | `EmptyRequest` | 201 `OfferResponse` | 400, 404 |
| PATCH `/offers/:id` | `OfferEditRequest` | 200 `OfferResponse` | 400 length/body, 404, 409 not draft |
| POST `/offers/:id/approve` | `EmptyRequest` | 200 `OfferResponse` | 400, 404, 409 redeemed |
| POST `/offers/:id/redeem` | `EmptyRequest` | 200 `OfferResponse` | 400, 404, 409 draft |

All failures return `ApiError`. Codes map to HTTP 400 `VALIDATION_ERROR`, 404 `NOT_FOUND`, 409 `CONFLICT`, 501 `NOT_IMPLEMENTED`, or 500 `INTERNAL_ERROR`. Commit-0 write stubs intentionally return 501 for all bodies; Dev 1 replaces them with validation and the above behavior. The 501 result is not a completed retention loop.

### Route semantics

- Customer list defaults: `sort=name&direction=asc`; no lapsed filter. Favorite item sorts by item name. Null values always sort last, either direction. Tie break is ID ascending. Detail orders and offers sort newest first. No search parameter; Dev 2 may filter the small returned list locally.
- Join normalizes phone and returns the same record for repeat entry. New customer: name `New friend`, stamps 0, joined_at `as_of`, no orders. UI remembers ID in localStorage key `bakeria.customerId`. Identity is demo-only; the URL/localStorage value is not authorization.
- Hub returns only approved and redeemed offers, newest first. Drafts must never appear. Reward target is always 10 tonight. Poll hub every two seconds while visible and immediately on window focus; stop intervals on unmount. Dashboard refetches after mutations. There is no WebSocket dependency.
- Draft uses the customer's first name, favorite item, actual visit count and visit dates. Offer benefit is fixed: **a free topping with the next parfait**. Do not invent purchases, prices, expiry, or bigger discounts. Enforce message length before storing. On missing key, timeout, provider error, or malformed response, use a cached message for that customer (or a deterministic history-based template for a newly created customer). Create a fresh draft row; `source` tells the UI whether this was AI or cached. Keep the original six cached draft rows unchanged as fallback templates.
- Grandma edits with PATCH, waits for success, then approves. An approved offer is visible on the next hub fetch. Offer redemption records intent for the demo only; no payments, stamp change, or sales attribution.

### Derived fields and metrics

Use all stored orders at or before `as_of` for customer summaries. Each order is one visit. Seed has at most one order per customer per day. Favorite item is greatest total quantity, ties by menu ID ascending; null if no orders. Total spend sums historical totals. No orders: last visit and elapsed are null; fewer than two visits: usual gap null.

`usual_gap_days = (last_visit - first_visit) / 86,400,000 / (visits - 1)`.

`is_lapsed = visits >= 3 AND usual_gap_days > 0 AND days_since_last_visit > 2 * usual_gap_days`.

Compare unrounded fractional days; round only for display. Exactly twice the usual gap is **not** lapsed. Zero gaps do not flag. This makes weekly and monthly regulars comparable without a hard-coded 14-day cutoff.

- Returning-customer rate: customers with at least two orders in the inclusive trailing 90-day window / customers with at least one order in that window; 0 if denominator is zero. API returns a fraction 0–1. UI multiplies by 100.
- Lapsed regulars: count of current `is_lapsed` customers.
- Offers approved: count in approved **or redeemed** status (ever approved under the forward-only state machine). Offers redeemed: count in redeemed status. Cached drafts count in neither.
- Revenue at risk (stretch): sum each lapsed customer's trailing-90-day spend divided by three, then round the combined amount to integer cents. Label **Estimated monthly revenue at risk (CAD)**. It is historical exposure, not guaranteed savings.
- Revenue recovered: `null` tonight. Without a sale linked to an offer, we cannot claim recovered revenue. Do not convert approved offers, redemptions, or stamps into dollars. Adding real attribution requires a team-approved contract change and is deferred beyond this sprint.
- Stretch fields return `null` until implemented. UI hides null dollar cards, never renders `$0` for unknown values. Zero is a valid implemented result.

## Seed format and fixture rules

`data/seed.json` is exactly `Database`, no extra metadata. `scripts/generate-seed.ts` is the frozen deterministic generator; `npm run seed:generate` reproduces the committed seed byte for byte. Each branch starts with the same seed, but an ignored independent `data/runtime.json`.

50 customers: 24 active weekly regulars, 6 lapsed regulars (4 weekly, 2 roughly fortnightly), 20 occasional visitors with one or two orders. History stays within July 4–October 2, 2026. Every regular strongly favors one item. Six lapsed customers each have a cached draft. A truly monthly customer needs more than three months of history to have three visits and then miss two cycles, so that edge case belongs in a separate unit fixture, not this seed.

Stage fixture: **Maya Patel**, `cus_025`, `+15195550125`, nine stamps, weekly visits followed by a 22-day absence, favorite Strawberry Cloud Parfait. Start here for the stamp and offer demos. Flagged IDs are `cus_025` through `cus_030`. Customers with one visit remain unflagged.

Read `data/seed.json` and import the generated types in local mocks. Each UI may keep its own mutable clone within its owned folder; never share a mutable mock store, never send seed data to the browser as a production API replacement, and remove mock use before the checkpoint.

## Change procedure

All three developers agree to the exact change. Dev 1, as integrator, updates this document, runs `npm run contracts:generate`, updates all affected frozen fixtures/checks, and commits one shared change on main. Both other branches merge that main commit immediately. No private fields, renamed routes, or duplicate interfaces in feature folders to evade this process.
