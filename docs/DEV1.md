# Dev 1 — backend, data, and integration

Assumptions: you are one of three independent agents; branch `dev1-backend` starts at `commit-0`; implementation window is 6:30–8:10 PM Toronto. Read all `/docs` before coding, especially CONTRACTS.md. This file is a direct implementation brief.

## Ownership

You may edit **`server/**` and `tests/backend/**` only**. You own persistence, validation, API behavior, derived data, cached/real offer generation, and backend tests. You are the human team's integrator, but that does not authorize editing other developers' files. Shared-file changes require all three developers' agreement and a separate main commit.

Do not edit `src/**`, `data/seed.json`, `scripts/**`, `tests/scaffold.test.ts`, `docs/**`, root AGENTS.md, package files, lockfile, Vite/TS config, or another developer's branch. Keep the app factory importable without starting a listening server. Preserve `createApp(read)` for the frozen read-only scaffold tests; inject persistence using an optional second argument or an internal adapter. Existing default app behavior and API paths must remain compatible.

## Build in this order

1. Inspect seed and read handlers. Run `npm ci`, `npm run check`, `npm run dev`. Confirm 50 customers, six flags, and Maya's nine stamps. Preserve the frozen calculations and sorting semantics.
2. Replace write stubs with phone normalization/join, single-stamp increment, and reward reset. Connect atomic persistence. The existing store is the starting point; extend app construction inside `server/` as needed to inject read/write storage. Unknown customers return 404, malformed bodies 400, invalid state transitions 409.
3. Implement draft/edit/approve/redeem using cached text first. New drafts must be new records, never overwrite fallback rows. Save edits before approval. Filter drafts out of the hub. New phone entry creates `New friend` with no purchase history; repeated normalized input returns the same customer.
4. Add optional real AI generation using the architecture's provider settings. Four-second abort, validation, and fallback. Re-read storage after awaited generation so concurrent stamp changes are not lost. Never send messages outside the app.
5. Test the state machine, persistence across restart, and reads after writes. Set `/health` mode to `ready` only when all core mutations are implemented. Keep revenue fields null until stretch is released.
6. By 7:15, announce your commit and API readiness. Integrate backend → dashboard → customer on main, run the checklist in INTEGRATION.md, and distribute the merged commit to both teammates.

## What to mock until integration

Use request-level tests and direct API calls; do not build temporary frontend screens. A fake provider response and forced provider timeout are appropriate in backend tests. Synthetic persisted seed data is the official demo database. A missing API key must exercise the real cached fallback implementation. Do not return fake success from unimplemented writes.

## Done when

- [ ] All documented core endpoints return contracted success/error types; no core path returns 501.
- [ ] Phone format variations resolve to one customer; new phone creates a zero-stamp customer and persists across restart.
- [ ] Maya increments 9 → 10; another increment is 409; reward redemption resets 10 → 0; premature/repeated reward redemption is 409.
- [ ] Draft is invisible in hub; PATCH then approval reveals the exact edited text for only that customer.
- [ ] Approved offers and redeemed counts follow the contracted state machine; repeated approval/redemption does not double-count.
- [ ] No key, timeout, malformed output, and provider failure create valid cached drafts, marked cached.
- [ ] A stamp change during an in-flight AI call survives the draft save.
- [ ] Runtime writes persist, seed is unchanged, six flags remain deterministic after reset.
- [ ] Invalid IDs, invalid JSON, body length/type errors, and disallowed transitions return JSON errors without stack traces.
- [ ] `npm run check`, `npm run test:backend`, and `npm run build` pass.

After the full 7:30 loop passes, implement estimated monthly revenue at risk per CONTRACTS.md and coordinate its display with Dev 2. Do not invent recovered revenue. At 7:50 stop stretch; at 8:10 stop code changes.
