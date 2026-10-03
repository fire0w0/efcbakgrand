# Implementation plan: simplify the UI and complete the retention workflow

## Later product decisions

The user subsequently authorized built-in order ahead and Grandma's Orders tab, a collapsible customer order form, and moving stamp-card reward redemption to Grandma's customer detail screen. These implemented changes supersede this plan's older Google Form, preorder-deferral, and customer reward-button instructions. Keep the customer reward card read-only: Grandma confirms redemption at ten stamps. The user explicitly chose demo access without a staff PIN. Apply the remaining cleanup without reverting these behaviors; the audit below describes its original `97a9258` baseline.

## Implementation brief

Implement the changes in this document against current merged main. Deliver a clearer customer hub and Grandma dashboard, fix the cached-template editing bug, refresh dashboard state after customer actions, and add the existing revenue-at-risk metric after the core loop passes. Use the work packages, exact copy replacements, and acceptance criteria below as the implementation specification.

This document is a handoff to the implementing developers/agents, not a request for another audit or planning document. Make the specified application and test changes in your owned folders. API key and Google Form integration remain with their existing delegates. The audit records why the work is needed; it does not replace the implementation deliverables.

## Assumptions and scope

- Requested October 2, 2026, after all three feature branches merged. Audit baseline: `97a9258` on main.
- Baseline implementation status: the work packages below are not yet implemented. Execute them as code changes; preserve configuration, seed data, and shared contracts unless an explicit task requires otherwise.
- API key integration and Google Form integration are already delegated. Do not duplicate or reassign those tasks; use their acceptance handoffs below.
- The product goal is: **everything visible helps the person identify their situation, make a decision, or take an action.** Keep warmth in branding and personal messages, not in repeated filler paragraphs.
- Preserve the current stack, ownership boundaries, API shapes, and ten-stamp reward. No new dependencies or services are needed for the proposed quick wins.
- Estimates are rough hands-on implementation time for a developer familiar with this repo; final integration/rehearsal is additional. This is the next-work sequence, not a claim that the original sprint deadlines were met.
- Evidence is a source-code audit and the immediately preceding check of this same commit: type/contract checks and 65 tests passed (4 scaffold, 58 backend including subtests, 3 dashboard mock tests). No full browser/phone walkthrough was performed in this audit. Test success does not establish visual quality or end-to-end readiness.

## Required outcome

Do a focused usability pass before adding features. First remove low-value text and the broken cached-template editing affordance. Then make the dashboard reflect phone-side actions and make the retention workflow obvious. Once that loop passes with the delegated integrations, add the already-contracted revenue-at-risk calculation. Do not build a new analytics page, authentication flow, or preorder system.

## Current feature audit

| Feature | Current implementation / evidence | Gap and practical impact | Decision |
| --- | --- | --- | --- |
| Customer list | Search by name, sortable columns, lapsed-only checkbox, customer detail links in `src/dashboard/CustomerList.tsx` | Starts with an alphabetical list of everyone. The six people needing attention take an extra discovery step. List state resets on return from detail. | Keep all-customers default for lookup; make the lapsed metric a filter action and preserve filter/search/sort during navigation. |
| Lapsed detection | `server/domain.ts` calculates absence relative to visit cadence; seed tests verify six flags | Useful explanation already exists: days absent vs usual gap. No replacement algorithm is needed. | Keep the rule and show its evidence concisely. |
| Detail/history | Itemized orders, favorite, visit count, spend, stamp action in `CustomerDetail.tsx` | Developer explanation crowds the reward card. The screen does not refresh on focus after changes on the phone. | Remove explanation; keep actionable facts; add refresh on focus. |
| Reward card | Phone entry, persistent selection, ten stamps, reward reset; backend validates limits | UI says only “reward,” hiding that ten stamps earn a free parfait. Dashboard still offers Add stamp at ten and then shows an avoidable conflict error. | Name the benefit; disable Add stamp at ten with “Card full.” Keep server validation. |
| Offer drafting/approval | Real routes, save-before-approve, cached fallback, source badge, customer-specific visibility | Seed template drafts look editable but backend deliberately rejects their mutations. The same message can be repeated in editor, success block, and history. | Fix the template affordance; show one active editor/confirmation and move history below it. |
| AI personalization | Provider code exists in `server/offers.ts`; model selects from prewritten grounded candidate messages | Adding the key enables selection, not unrestricted writing. Do not promise novel composition or assume varied output proves a live call. | Leave provider integration with delegate; describe current behavior accurately. Freer generation is deferred. |
| Customer hub updates | `useCustomerHub.ts` polls every two seconds while visible, refreshes on focus, guards customer switches and late responses | Good foundation; no rewrite needed. Grandma's list/detail/metrics lack equivalent focus refresh. | Keep customer behavior; close dashboard freshness gap. |
| Customer offers | Approved/used offers render with usable redemption control | Used offers occupy the same list as active ones. Simulation text repeats on every card and in notices/footer. | Active offers first; collapse used offers into “Used offers (N)”; shorten notices. |
| Metrics | Returning rate and offer counts render; estimated-dollar cards already support non-null responses | Metrics load on mount, with retry only after an error. Phone redemption while dashboard remains open can leave old counts visible. | Focus refresh and an explicit Refresh action; retain useful definitions behind details. |
| Revenue at risk | Contract and frontend card exist; backend currently returns null | The pitch has no dollar figure. This is a small backend calculation after core reliability is confirmed. | Implement existing definition; keep recovered revenue null. |
| Favorite summary | Counts each customer's favorite item from returned customer rows | Appears above the task list. Search filters the table but not this summary, even though wording says “listed customers.” Counts are customers, not item sales. | Move into collapsed “Customer favorites”; use the visible filtered rows and label counts as customers. |
| Order ahead | Correct configured new-tab anchor exists; unconfigured UI currently says coming soon | Form URL/integration is delegated. Large placeholder panel adds no useful customer action. | Delegate verifies actual link; until configured show only “Online ordering unavailable.” |
| New customer | Phone join creates `New friend`; greeting takes the first word | Produces “Hello, New.” | Use “Welcome!” for the default name; do not add a required name field. |
| Test coverage | Backend tests cover state transitions, persistence, failures, timeout and concurrent changes | Dashboard mocks explicitly allow seed-template edits that real backend rejects. Customer browser suite/handoff were written against scaffold-era behavior. | Align tests with merged behavior and run a real two-view retention loop. |
| Documentation | Original scaffold docs remain present | README/architecture describe write stubs and incomplete screens as current. This can send an agent back to rebuilding completed work. | Correct current status and point future work to this plan; retain original briefs as history. |

## Implementation order and estimates

| Order | Task | Impact / effort | Owner and files | Done when |
| --- | --- | --- | --- | --- |
| 1 | Remove UI clutter using the copy inventory below | Very high clarity; 20–30 min dashboard, 15–25 min customer | Dev 2 `src/dashboard/**`; Dev 3 `src/customer/**` | Each section has a task-oriented heading; no repeated engineering/demo explanation; useful state, input guidance, errors, and benefit remain. |
| 2 | Fix cached-template editing bug | High reliability; 15–25 min | Dev 2 `OfferPanel.tsx`, `mock.ts`, `mock.test.ts`; backend guard stays | Seed fallback templates have no Edit/Approve affordance. Fresh cached drafts remain editable/approvable. Real-backend regression passes. |
| 3 | Refresh Grandma's view and prevent full-card clicks | High reliability; 20–35 min | Dev 2 `CustomerDetail.tsx`, `MetricsCards.tsx`, `CustomerList.tsx` | Phone redemption is reflected when Grandma refocuses the window; visible Refresh updates without navigation; Add stamp is disabled at ten and re-enables after refreshed redemption. |
| 4 | Make the retention action easy to find | High workflow value; 20–30 min | Dev 2 list/metrics/navigation | Clicking “Overdue regulars · 6” filters to six; each row shows absence vs usual cadence; opening a customer and going back preserves search/filter/sort. All customers remain one action away. |
| 5 | Add estimated monthly revenue at risk | High pitch value; 15–25 min plus verification | Dev 1 `server/domain.ts`, `tests/backend/**`; Dev 2 checks existing card presentation | Contracted calculation returns cents; verified against seed; UI says “Estimated monthly revenue at risk (CAD)”; zero renders correctly; recovered revenue remains hidden/null. |
| 6 | Reduce secondary history/insight clutter | Medium value; 15–25 min per surface | Dev 2 offer history/favorites; Dev 3 used offers | Active offer and next action precede history. Used offers and customer-favorite breakdown expand on demand; search and count labels agree. |

Tasks 1–4 are usability/core repairs and can proceed while integrations are delegated. Task 5 starts only after the real core loop passes. Task 6 is optional if time is tight. Estimates are not additive wall-clock promises: Dev 2 owns most dashboard work, so do not assign overlapping files to parallel agents.

## Work packages

### A. Simplify Grandma's dashboard — Dev 2

Edit `src/dashboard/CustomerDetail.tsx`, `OfferPanel.tsx`, `MetricsCards.tsx`, `CustomerList.tsx`, `DashboardApp.tsx`, and `dashboard.css` as needed.

1. Apply every dashboard row in the copy inventory below. Delete the mocked-checkout paragraph and rehearsal wording; shorten action labels and retain actual offer terms.
2. Remove containers and margins used only by deleted text. Keep useful customer facts and a clear primary action in each section.
3. Keep one compact Demo disclosure in the dashboard shell. Use accessible native disclosure markup for details rather than repeated explanatory paragraphs.
4. Show only one copy of the currently edited/just-approved offer message in the active workflow. Keep other actual offers in history; do not delete offer records.
5. Preserve visible errors, saved/unsaved state, pending-button states, and keyboard access.

Acceptance: the quoted mocked-checkout text and other marked filler are absent, the primary stamp/offer actions remain obvious, and Grandma can distinguish draft, saved suggestion, and approved states without reading implementation commentary.

### B. Fix template editing — Dev 2

Edit `src/dashboard/OfferPanel.tsx`, `mock.ts`, and `mock.test.ts`; add a dashboard-local helper/test if needed.

1. Identify only the six reserved seed template IDs documented in CONTRACTS.md. Exclude those rows from editable offer history and reject selection of them in the editor.
2. Preserve fresh cached drafts. Do not use the `source` field as the template filter.
3. Make mock save/approve/redeem restrictions agree with the real backend's immutable-template behavior. Replace the existing test that expects seed-template editing to succeed.
4. Exercise the real API: create a fresh fallback draft, edit it, approve it, and verify the intended customer's hub contains the edited text. Leave `server/app.ts`'s guard intact.

Acceptance: there is no route through the dashboard UI that invites a template edit which inevitably returns 409; ordinary AI-assisted and cached drafts still work.

### C. Keep dashboard state fresh and navigation useful — Dev 2

Edit `CustomerDetail.tsx`, `CustomerList.tsx`, `MetricsCards.tsx`, and `nav.ts` within `src/dashboard/`.

1. Introduce one refresh trigger per view, called by an explicit Refresh button and window-focus listener. On the list view, pass a reload trigger to metrics so list and counters refresh together.
2. Remove listeners on unmount and ignore stale responses. Preserve draft textarea edits across background refreshes. If the edited offer is no longer a draft on the server, stop save/approval and show its current state rather than silently overwriting the user's text.
3. Disable Add stamp when pending or at ten stamps; render “Card full” at ten. Keep backend validation unchanged and refetch after successful mutations.
4. Make the overdue metric a real button that applies the existing lapsed filter. Add an obvious All customers action to clear that filter.
5. Preserve search, sort, direction, and lapsed filter using dashboard-local session storage. Restore on list mount and validate restored values against the existing allowed values; tolerate unavailable browser storage. Do not add API parameters or change the shared router.

Acceptance: use an offer or redeem a full card on the phone, refocus Grandma's window, and see current values. Searching/filtering, opening detail, and returning retains the list state. Refresh never discards unsaved text.

### D. Simplify the customer hub and clarify the reward — Dev 3

Edit `src/customer/CustomerApp.tsx`, `useCustomerHub.ts`, `customer.css`, and the owned browser tests.

1. Apply every customer row of the copy inventory below, including shorter loading/success messages and removal of the sample-phone hint from normal UI.
2. Explicitly state that ten stamps earn a free parfait. Use singular/plural progress text, and name the benefit in the redemption button.
3. Render “Welcome!” for the default `New friend` name; keep a short first-name greeting for named customers.
4. Keep phone entry, input guidance, actual offer messages, and useful errors. Preserve existing polling, customer isolation, duplicate-submit protection, and accessible live status behavior.
5. Keep one compact Demo disclosure. Preserve the server-configured order link and missing-link state; coordinate with the existing Form delegate before overlapping edits.

Acceptance: at 360px width, a customer can identify their card, stamps remaining, exact reward, usable offer, and order-ahead action without scrolling through introductory filler. Repeat the real stamp/reward/offer flow after copy changes.

### E. Implement the existing dollar metric — Dev 1, then Dev 2

After the real core loop passes, edit `server/domain.ts` and `tests/backend/**`; Dev 2 checks `MetricsCards.tsx`.

1. Calculate `revenue_at_risk_cents` using the canonical definition in CONTRACTS.md. Reuse existing lapsed summaries and the contracted time window; return integer cents.
2. Add focused tests for no lapsed customers, window-boundary orders, exclusion of future/out-of-window orders, and rounding of the combined estimate. Keep `revenue_recovered_cents` null.
3. Verify the existing UI card renders both a positive result and zero. Keep the estimate qualifier, monthly period, and currency visible; put the long explanation in Details.

Acceptance: the endpoint supplies an independently verified estimate and the dashboard shows it without implying actual recovered sales.

### F. Secondary cleanup — after required packages

Dev 2: collapse customer-favorite insights, count the visible filtered customers, and label counts as customers rather than sales. Dev 3: show active offers first and put used offers inside “Used offers (N).” Keep all records accessible. Implement this only if A–E and the delegated integrations leave time for regression checking.

### Integration bug: chosen fix

Reproduction: open Maya's detail, choose “Edit this draft” on `offer_cache_cus_025`, edit/save or approve. `server/app.ts` rejects it with 409 because that row is an immutable fallback template.

Keep immutable backend templates. In the dashboard, exclude only the frozen seed template identifiers from the ordinary offer history and editor. Their reserved IDs are documented in CONTRACTS.md. **Do not filter `source === 'cached'`: a newly created fallback draft is a real editable offer.** Keep the normal “Draft offer” action, which creates a fresh row through the existing endpoint. Do not import the whole seed into the production UI just to identify six reserved template IDs.

Update the dashboard mock so template mutation also rejects; remove the test expectation that seed templates are editable. Verify a fresh cached draft can still be saved and approved and reaches only its customer's hub. This fix needs no new endpoint or shared field. A later redesign that removes templates from API responses must go through the contract process; it is not part of this quick fix.

### Dashboard freshness: chosen scope

Add refresh on window focus and an explicit Refresh control using existing endpoints. Refetch detail after local mutations as today. Refresh list and metrics together where practical; abort/ignore obsolete reads, clean up listeners, and do not overwrite an unsaved offer message on refresh. No dashboard polling system or WebSockets are required for this pass.

### Retention workflow: chosen scope

Keep all customers accessible by default for checkout lookup. Turn the overdue count into a clearly interactive filter, preserving existing sorting instead of inventing a new API sort. Rename the checkbox to “Overdue only.” In the detail view, retain a concise reason such as “Last visit 22 days ago · Usually every 7 days,” followed by the existing Draft offer action. Do not automatically create or approve offers when someone clicks a metric or opens a customer.

### Revenue at risk: chosen scope

Implement the existing CONTRACTS.md definition, rather than adding a new metric or changing the data model. Keep the estimate qualifier and CAD/time period visible. Put the longer explanation in an accessible Details disclosure, not every card's main text. This is exposure based on historical spend, not recovered money. Approved or redeemed offers must not create a dollar recovery figure.

## Exact UI copy cleanup inventory

Apply these replacements during implementation. Paths are relative to the repository root. Remove the associated empty spacing/container where appropriate; do not leave blank panels. Preserve labels, accessible names, live error/status announcements, and keyboard focus.

| File / location | Current text or pattern | Implement this change |
| --- | --- | --- |
| `src/dashboard/CustomerDetail.tsx`, reward card | “Mocked checkout: a stamp updates … phone card but records no sale. Redemption happens on the customer’s phone.” | **Delete entirely.** No replacement paragraph. |
| Same, customer link | “Open … hub (rehearsal) ↗” | “View customer card ↗”. This remains a useful verification/navigation action. |
| Same, identity line | Phone plus “Joined …” | Keep phone. Remove joined date from the main header; it does not help tonight's retention decision. |
| Same, lapsed banner | “Drifting away.” plus absence/cadence explanation | “Overdue · Last visit 22 days ago · Usually every 7 days,” with real values. Keep evidence rather than a vague extra sentence. |
| Same, full reward card | “Add stamp” remains active at 10 | Disabled “Card full” at ten; “Add stamp” otherwise. |
| `src/dashboard/OfferPanel.tsx`, introduction | “Drafts use … real order history. You edit and approve; approval only previews … Nothing is texted or emailed.” | Delete the paragraph. Beside approval retain one short destination hint: “Appears on the customer’s card.” Do not say “Send SMS.” |
| Same, benefit | “Benefit: a free topping … That is the only offer tonight; the text shouldn’t promise anything else.” | Keep “Offer: free topping with the next parfait.” Remove sprint instructions. |
| Same, buttons | “Draft a personal offer”; “Save and approve · preview in hub”; “Approve · preview in hub” | “Draft offer”; “Save & approve”; “Approve”. Keep “Save draft” as the secondary action. |
| Same, statuses | “Draft · hidden from customer”; “Approved · visible in hub” | “Draft”; “Available on card”; “Used”. Display labels only; wire statuses stay unchanged. |
| Same, source badges | “AI-drafted”; “Cached fallback” with provider explanation | One compact “AI-assisted” or “Saved suggestion” badge in the editor. Keep source truthful; remove repeated source badges from ordinary history. |
| Same, post-approval message | “Approved. … sees this exact message in the customer hub:” plus repeated body | “Offer added to customer card.” Show the approved offer body once, not a duplicate in both confirmation and history. |
| Same, character count and errors | Saved/unsaved, max length, failed-save feedback | **Keep.** These prevent errors and tell Grandma whether approval will use her edits. |
| `src/dashboard/MetricsCards.tsx` | “Previewed in the customer hub, not sent”; “Simulated redemptions” | Delete repeated helper lines. Use “Offers approved” and “Offers used”; keep a single demo disclosure described below. |
| Same, returning rate definition | “Two or more visits in the last 90 days” | Keep the 90-day window in the label/details; expose the complete denominator in Details when needed. |
| Same / customer list | “Drifting regulars”; “Drifting away only”; “Drifting away” | Consistently “Overdue regulars”; “Overdue only”; “Overdue”. No change to lapse calculation. |
| `src/dashboard/CustomerList.tsx` | “As of … (demo clock)” | Keep “As of Oct 2, 2026.” Remove engineering parenthetical; fixed data date remains important. |
| Same, favorites strip | “Favorites among listed customers” + all chips above list | Move to collapsed “Customer favorites”; label quantities “N customers”; compute against visible filtered rows. |
| `src/customer/CustomerApp.tsx`, header/intro | “A little sweetness. A familiar face.”; “Your little corner …”; “There’s always a place …”; explanatory intro | Keep Bakeria / Friends Forever branding. Replace the stacked intro with “Your reward card.” Keep phone entry immediately below. |
| Same, join card | “Let’s find your card.”; “Just your phone number. No password needed.” | One heading: “Find your card.” Keep “Enter your phone number.” if needed; do not repeat it in several paragraphs. |
| Same, demo hint | “Trying the demo? Maya’s number is …” | Remove from customer-facing flow; keep number in INTEGRATION.md for the presenter. |
| Same, phone hint/errors | North American format hint; invalid number error | Keep concise format guidance and inline errors. These are useful, unlike implementation commentary. |
| Same, loading | “Finding your little corner of Bakeria…” plus another loading sentence | “Loading your card…” in one live status region. |
| Same, greeting | “Hello, New.” for new customers; “Good things come to regulars.” | Default-name customer: “Welcome!” Existing customer: “Hi, Maya.” Delete the slogan. |
| Same, reward headings/progress | “A little thank-you”; generic reward; “A full card. How sweet!” | “10 stamps = a free parfait.” Progress: “1 stamp to a free parfait” / “Free parfait ready.” Keep numeric stamp count and accessible stamp labels. |
| Same, reward action | “Grandma adds a stamp when you stop by”; “Redeem reward” | Remove explanatory sentence. Button: “Redeem free parfait,” enabled only at ten. |
| Same, offer heading/empty state | “From Grandma, with love”; “Just for you”; two-line empty note | “Your offers.” Empty: “No offers yet.” Keep Grandma's voice in the actual offer message. |
| Same, offer card | “Used · simulated redemption”; “Redeem offer (demo)”; “Simulated redemption. No payment or stamps added.” | “Used”; “Use offer”; delete the repeated explanation. Keep one demo disclosure for the page. |
| `src/customer/useCustomerHub.ts`, success notices | Long reward/offer simulation explanations | “Reward redeemed. Your card is reset.” / “Offer used.” Retain accessible live announcements. |
| `src/customer/CustomerApp.tsx`, order panel | “Something to look forward to”; “Your next sweet stop”; additional sentence | One “Order ahead” link; optional short “Opens order form” destination hint. No separate repeated heading/button slogan. |
| Same, unconfigured order state | “Order ahead · coming soon”; “The order form hasn’t been connected yet.” | “Online ordering unavailable.” Do not show a fake enabled link or imply a promised launch date. |
| Same, footer | “Made with love. Shared with friends.” plus technical demo sentence | Remove slogan and technical sentence; use the single concise demo disclosure below. |

### What stays visible

Keep customer name/phone where useful, favorite item, last visit and usual rhythm, stamp count and reward, actual offer terms, save/approval state, source distinction where Grandma reviews a draft, meaningful dates, prices, and recovery actions for errors. Keep one small **“Demo”** indicator per surface, with an accessible expandable **“About this demo”** containing simulated identity/redemption and no-payment/no-messaging limitations. Do not repeat that explanation under every control. Explicit opt-in mock mode still needs a clear warning because those actions do not persist to the backend.

This copy policy supersedes the original briefs' requirement to repeat simulation wording directly in each action. It does not change behavior, imply real sales, hide failures, or present cached text as a fresh model result. Preserve the warm visual identity; no redesign is needed to remove redundant text.

## Delegated integrations: acceptance handoff only

| Delegated work | Evidence needed before calling it ready | Work not assigned here |
| --- | --- | --- |
| API key integration | With the delegate's configured key, a real draft succeeds and reports its actual source; missing/failed provider still yields an editable saved suggestion; key stays server-only. If the provider falls back, report that rather than claiming the live path passed. | Leave credentials and provider integration to the existing delegate; do not duplicate their implementation. |
| Google Form integration | Real responder link opens from the customer's phone without sign-in, has the agreed order fields, and reaches the bakery's intended form. A missing URL leaves no fake link. Delegate confirms receiving a sample response if submission testing is in their scope. | No form creation, credentials, Google Sheet integration, or replacement preorder UI here. |

## Ownership and execution sequence

1. Start new follow-up branches from **current merged main**, not commit-0 or stale local Dev 1/Dev 2 branch tips. Preserve original directory ownership.
2. Dev 2 implements tasks 1–4 for Grandma in one sequential work stream. Dev 3 handles customer copy/reward clarity and later used-offer cleanup. Existing integration delegates continue their assignments; coordinate if they touch the same feature folders.
3. Merge core repairs and receive delegate handoffs. Run the complete real-backend loop below. No mock-only sign-off.
4. Dev 1 adds revenue-at-risk after the core gate passes; Dev 2 verifies the existing metric card. Favor this over new charts or a new page.
5. Only if time remains, finish secondary history/favorites cleanup. Rehearse with the final copy and preserve a recording.

No contract shapes change in this plan. CONTRACTS.md remains the sole shared-shape authority. Future shared changes still require the team process. Update this plan's status only when implementation and verification actually happen.

## Final verification and handoff

Run `npm run check`, `npm run test:backend`, `node --import tsx --test src/dashboard/mock.test.ts`, and `npm run build`. Update and run the owned browser tests against the merged real backend using disposable data; do not reset an active shared demo database. Perform the laptop-plus-phone workflow below. Report the changed files, completed work-package IDs, checks run, and any remaining integration dependency. Do not mark a package complete based on mock-only success.

- [ ] Required work packages A–E are implemented and verified; record F separately if completed.
- [ ] Review each visible sentence: does it identify a person/state, explain a benefit, enable an action, or help recover from an error? Remove repetitions that fail this test.
- [ ] On a 360px phone, entry focuses on phone input; signed-in view immediately identifies stamp progress and the free-parfait benefit. Check real layout, not only source.
- [ ] Grandma can filter to six overdue seed customers and explain Maya's flag without reading implementation text.
- [ ] Cached seed templates cannot be selected for editing; a newly generated cached draft can be edited and approved.
- [ ] Maya's stamps go 9 → 10 → 0 across the real dashboard and phone hub. Full card disables Add stamp; focus refresh shows the redeemed state correctly.
- [ ] Edit one word and approve. That exact message reaches only Maya; draft remains hidden before approval. The message appears once per relevant context.
- [ ] Use an offer on the phone. Refocus dashboard and see updated status/counts. Refresh never destroys unsaved editor text.
- [ ] Form and live-provider delegate acceptance evidence is recorded separately from cached fallback tests.
- [ ] Existing contract/type/backend checks pass. Dashboard mock matches actual template restrictions. Update scaffold-era browser assertions and run the actual merged flow using disposable test data; do not rely only on intercepted responses.
- [ ] If revenue-at-risk is included, independently check its numeric result and keep “estimated,” the monthly period, and CAD visible. Do not show recovered revenue.

## Explicitly defer

Real auth, payments/POS, SMS/email delivery, Sheets ingestion, carts/pickup queues, per-customer sales recovery attribution, bulk automatic offers, richer AI composition, new analytics pages, framework changes, and a full visual redesign. None is needed to make the current screens substantially clearer and more useful.
