# Dev 3 — customer's phone hub and order-ahead link

Post-merge note: the customer hub is merged at `97a9258`. See [NEXT_STEPS.md](NEXT_STEPS.md) for the current copy cleanup, free-parfait reward clarity, new-customer greeting, and optional used-offer cleanup. Google Form integration is already delegated; coordinate with the existing owner rather than duplicating it. One compact Demo disclosure replaces repeated action-level simulation copy when implemented. Start follow-up work from current main; the original scaffold/mock instructions below are historical.

Assumptions: branch `dev3-customer` starts at `commit-0`; 6:30–8:10 PM Toronto window; no real authentication or payment. Read all `/docs` first. This is your agent implementation brief.

## Ownership

Edit **`src/customer/**` only**. Preserve the default, no-props export of `CustomerApp.tsx`. The shared mount renders this view at `/`, `/hub`, and `/hub/:id`. Keep components, styles, and optional local mocks/tests inside your folder.

Do not edit `src/dashboard/**`, `src/shared/**`, `src/main.tsx`, global CSS, server files, seed data, scripts, shared tests, docs, package/lock files, or configuration. Do not add dependencies. Use the generated contracts and shared transport helper. You may set ignored `.env` values in your own checkout for testing, but never commit them.

## Build in this order

1. Phone-entry screen: telephone keyboard, input label, clear error and loading states. POST join and remember the returned ID with the contracted localStorage key. Phone alone is sufficient; do not invent a password, OTP, mandatory name, or auth service.
2. Restore remembered customer on reload, and support explicit `/hub/:id` demo links. If a remembered ID is missing after reset, clear it and return to phone entry. Add Switch customer to clear local identity. Never show one customer's stale card while loading another.
3. Reward card with ten stamp positions, progress text, and redeem enabled only at ten. POST reward redemption, then refetch. Show waiting/error states and disable duplicate clicks.
4. Fetch the hub immediately, every two seconds while visible, and on focus. Clean up intervals/event listeners. Prevent late responses for a previous customer from overwriting the active view. Show only server-provided approved/redeemed offers; drafts never appear.
5. Add approved offer display and a clearly simulated Redeem offer action. Refetch after redemption. This does not charge money or add stamps.
6. Add Order ahead as a normal anchor with `target="_blank"` and `rel="noopener noreferrer"`, using server configuration. If URL is null, show unconfigured state; do not invent a URL.
7. Obtain or create the simple Google Form with the teammate who controls the Google account: name/phone, item, quantity, pickup note. Publish a responder link accessible without sign-in. Give Dev 1 the URL for the demo machine's `.env`, and verify it on the phone before 7:20. Form creation is an external setup deliverable, not a repo dependency or API integration.
8. By 7:15 commit your branch and send the hash to Dev 1. At integration, use the actual API and test a phone on the same network.

## What to mock until integration

GET config and hub reads already work. For phone-join and reward interactions before Dev 1 finishes, a visibly labeled `?mock=1` adapter inside `src/customer/` may clone the shared seed and use the existing contract. Never make mock mode the default or infer success from a 501. Do not change backend stubs or seed JSON. Remove mock routing from the demo path before handoff. Test the real form independently of backend write readiness.

## Done when

- [ ] Enter `(519) 555-0125` and reach Maya's card; refresh keeps that selection; Switch customer works.
- [ ] Alternate formatting resolves to the same account; invalid phone displays an error; a new valid phone joins without a password.
- [ ] Nine starting stamps become ten within two seconds after Grandma adds one, without manually reloading the phone.
- [ ] Reward redemption resets to zero, survives refresh, and is unavailable below ten.
- [ ] Grandma's newly approved edited message appears within two seconds and never leaks to another customer's hub.
- [ ] Drafts stay hidden; redeemed offers are marked used; the simulated action does not claim a payment occurred.
- [ ] Visibility changes and customer switching do not leak timers or stale responses.
- [ ] Actual Order ahead form opens in a new tab on the phone, without sign-in; unavailable configuration is clearly shown.
- [ ] Screen fits a 360px viewport with readable type, labeled controls, and usable tap targets.
- [ ] `npm run check` and `npm run build` pass; real API mode is used for integration.

After the full 7:30 loop passes, a prefilled usual-order form link is allowed only if the Google Form's actual field IDs have been verified. Do not fabricate entry IDs or add a Sheets integration. Stop stretch at 7:50; code freezes 8:10.
