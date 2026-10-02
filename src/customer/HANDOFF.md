# Dev 3 customer hub

Branch: `dev3-customer`, based on `commit-0`. All changes stay in `src/customer/`.

## Implemented

- Phone entry with telephone keyboard, contracted format validation, loading/error feedback and duplicate-submit protection. Real POST `/api/hub/join`; remember the returned customer ID using `bakeria.customerId`.
- Reload restoration and explicit `/hub/:id` links. Switch customer clears storage, pending view state and the explicit link. A missing saved customer returns to entry.
- Ten-position card, server stamp progress and reward redemption enabled only at the server target. Real reward POST followed by a hub refetch.
- Immediate hub fetch, two-second visible polling, focus/visibility refresh, timer/listener cleanup and guards against stale reads or writes after switching customers.
- Approved/redeemed offers only, with an additional customer-ID filter. Redemption is clearly simulated, uses the real API and refetches. Used offers have no redeem control.
- Server-configured order link opens in a new tab with `noopener noreferrer`. Missing configuration shows a non-clickable unavailable state. The user requested a placeholder for now; no form URL was invented.
- Styles scoped under `.customer`; no dependency, shared contract, server, dashboard or frozen-file edits.

## Verification

`npm run check` and `npm run build` pass.

The optional `customer.browser-test.mjs` suite runs at 360px with headless Edge. It first checks real scaffold reads, draft privacy, localStorage restoration, switching, missing-ID recovery, phone validation and the real 501 error. The remaining cases intercept requests inside a separate browser context using a clone of the frozen seed. These isolated simulations cover joins, normalization, duplicate clicks, reward reset/refetch, offer filtering/redemption, polling, visibility/focus, cleanup and late-response isolation. They also check configured anchor attributes and long-message overflow. The app itself contains no mock adapter or mock flag.

Run a dev server for this checkout on port 3003, then in a separate terminal:

```powershell
$env:BAKERIA_CUSTOMER_TESTS = '1'
# If Playwright is already available on the machine, use its module path here.
# The Codex desktop's load_workspace_dependencies tool returns the bundled location.
$env:BAKERIA_PLAYWRIGHT_MODULE = '<bundled node_modules>/playwright'
node --test src/customer/customer.browser-test.mjs
```

Optional: set `BAKERIA_CUSTOMER_TEST_URL` to a different local server URL. The real-API portion currently expects a freshly seeded commit-0 server with unimplemented writes. Screenshots go to the OS temporary folder `bakeria-dev3-browser`, outside tracked files.

## Remaining integration work

Dev 1's join, reward and offer write handlers are still 501 stubs at this branch's base. Their real success paths, server persistence and Grandma-to-phone updates require the merged backend and the shared checkpoint. The isolated browser simulations are not evidence of backend readiness.

The shared transport exposes error messages without HTTP status/code. Missing-card recovery recognizes the current server message `Customer not found`; preserve that message or coordinate a shared transport change with all developers.

The actual Google Form and same-network phone check are deferred and unverified. Configure `ORDER_FORM_URL` on the demo server when a published responder link exists. No prefilled fields or stretch work are included.
