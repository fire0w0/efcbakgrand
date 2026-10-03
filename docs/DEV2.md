# Dev 2 — Grandma's dashboard

Post-merge note: the dashboard is merged at `97a9258`. The current follow-up brief is [NEXT_STEPS.md](NEXT_STEPS.md): remove unnecessary UI text, fix the cached-template editing affordance and mock mismatch, refresh data on focus, and make overdue customers easier to act on. Its concise-copy policy supersedes repeated action-level rehearsal/simulation wording below. This is planned work, not an implemented change. Start from current main and retain dashboard ownership.

Assumptions: branch `dev2-dashboard` starts at `commit-0`; 6:30–8:10 PM Toronto build window; Dev 1 owns the server, Dev 3 owns the customer hub. Read all `/docs` first. This is your agent implementation brief.

## Ownership

Edit **`src/dashboard/**` only**. Put your components, styles, optional local tests, and development mocks there. Preserve the default, no-props export of `DashboardApp.tsx`; the shared mount already loads it at `/grandma` and `/grandma/:id`.

Do not edit `src/customer/**`, `src/shared/**`, `src/main.tsx`, `src/styles.css`, `server/**`, seed data, scripts, shared tests, docs, package files/lockfile, or configuration. Do not add dependencies. Import transport and generated types from `src/shared/`; never redefine a shared customer, offer, or response interface.

## Build in this order

1. Render all seeded regulars with loading, empty, and error states. Show name, visit count, favorite item, last visit, total spend, and a clear lapsed flag. Use CAD formatting and the configured demo date rather than browser time.
2. Add sort controls for name, visits, favorite item, last visit, and spend. Match contracted API query names and null ordering. Provide a lapsed-only filter. A client-side name search is allowed without a new API.
3. Add customer detail with itemized order history and an Add stamp action. Resolve menu item names from the menu endpoint; preserve historic prices from order items. Refetch after mutation and disable action while pending.
4. Add Draft offer → editable text → Save and approve. Save PATCH must succeed before approval POST; on failure preserve edits and display an actionable error. Show AI/cached source and the exact benefit. No outbound send language: label approval as a preview in the customer hub.
5. Show returning-customer rate, lapsed count, approved count, and redeemed count from metrics. Hide null stretch dollar figures. Link Maya's customer hub for rehearsal without editing Dev 3's code.
6. By 7:15 commit your branch and give Dev 1 the hash. Help verify the 7:30 loop from the dashboard side. Fix dashboard issues in your own branch and hand off new commits.

## What to mock until integration

Read endpoints already work on commit-0. Use them from day one. For mutation-only development, an explicitly selected `?mock=1` branch-local adapter may clone the seed into local memory and implement the **existing** contract; import types and fixture data, do not invent fields. Keep all mock code inside `src/dashboard/`, visibly label mock mode, and never enable it by default. Do not touch backend stubs. Before handing off, use real relative `/api` calls; a 501 should show an error, not fake success. Remove mock routing from the final demo path.

## Done when

- [ ] All 50 customers are browsable; every detail loads without missing item labels.
- [ ] Each required sort works; lapsed-only view contains `cus_025` through `cus_030` after reset.
- [ ] Maya shows Strawberry Cloud Parfait, weekly history, a 22-day absence, and nine starting stamps.
- [ ] Add stamp updates the server and displayed stamp count; failures are visible and retryable.
- [ ] Grandma drafts, edits one word, saves and approves; drafts and approved states are visibly distinct.
- [ ] Cached fallback is visibly labeled; failed save cannot approve stale text.
- [ ] Core metrics render correctly, including zero values; unknown dollar figures stay hidden.
- [ ] Keyboard controls and pending/error states work; long names/messages do not break the layout.
- [ ] CSS stays within dashboard scope and the customer view is unaffected.
- [ ] `npm run check` and `npm run build` pass; the real API path is active at integration.

After the shared 7:30 checkpoint passes: add Dev 1's estimated monthly revenue-at-risk card, clearly labeled CAD and estimated. Then, if time remains, summarize favorite items from existing records for the Fall Parfait pitch. No shared shape changes for flavor insight. Stop stretch at 7:50.
