# Integration and rehearsal

Assumptions: all times October 2, 2026 in Toronto; three developers have separate clones/worktrees; Dev 1 integrates. Remote `origin` is configured as `https://github.com/fire0w0/efcbakgrand`. Never make three agents edit one checkout or switch its branch underneath each other.

## Post-merge status and next work

All three feature branches are merged at `97a9258`. The branch-creation instructions and timed schedule below describe the original sprint. **Do not recreate branches from commit-0 for follow-up work:** start from current merged main. Local Dev 1/Dev 2 branch names may still point to the old base; they are not evidence that features are missing from main.

Use [NEXT_STEPS.md](NEXT_STEPS.md) for the current audit, exact UI cleanup inventory, delegated integration handoffs, and next acceptance run. API key and Google Form work are already delegated. Core checks passed in the preceding review, but the complete phone/browser loop is still unverified. No implementation is performed by this planning update.

The upcoming full-card UI improvement will disable Add stamp at ten rather than deliberately trigger a visible error; keep the backend's 409 test. The concise planned source label “Saved suggestion” denotes cached fallback, and “AI-assisted” denotes model selection. A single Demo indicator with expandable limitations replaces repetitive action-level simulation text. These presentation updates preserve the checklist's underlying state and honesty requirements.

## Commit-0 and branches

Commit all scaffold files, generated types, seed JSON, and lockfile once on `main`, then tag `commit-0`. Create `dev1-backend`, `dev2-dashboard`, and `dev3-customer` **from that tag**, not from another developer's work. Keep those branches unpublished until a remote is configured; do not invent a remote URL.

When sharing is configured, push main, the tag, and the three branches. Each developer clones independently and checks out their branch. On one machine, create a separate Git worktree per branch. Each checkout runs `npm ci` and gets its own ignored runtime data and `.env`. If running three servers on one machine, use ports 3001/3002/3003 locally; the integrated demo uses 3000. Never run two processes against one DATA_FILE.

```powershell
# Run only if the commit-0 tag/branches do not already exist.
git tag commit-0
git branch dev1-backend commit-0
git branch dev2-dashboard commit-0
git branch dev3-customer commit-0
```

Do not rewrite the base or force-push. Commit only your owned files. Frozen files include root tooling, shared types/transport/mount/CSS, seed/generators, docs, and scaffold checks. No opportunistic formatter runs across the repo. If a shared change is essential, all three humans agree; Dev 1 makes one isolated change on main, then all branches merge main. Never resolve a contract conflict by silently choosing one version.

## Schedule and merge order

| Time | Deliverable |
| --- | --- |
| 6:00 | Shared contracts and commit-0 ready; branch from the tag |
| 6:00–6:30 | Each developer reads docs, installs, boots scaffold, identifies owned seams; Dev 3 obtains form link |
| 6:30–7:00 | Dev 1 implements cached-path mutations; Dev 2 list/detail; Dev 3 join/card/polling |
| 7:00–7:15 | Dev 1 AI fallback/tests; Dev 2 offer edit/approve; Dev 3 offer/redeem/form; all remove mock dependence |
| 7:15 | All three publish passing feature commits; core feature freeze for first merge |
| 7:15–7:25 | Dev 1 merges backend → dashboard → customer into main; smoke check each merge |
| 7:25–7:30 | Reset and run complete checkpoint on laptop plus phone |
| 7:30 | Pass releases stretch; fail sends all three back to their owned fixes |
| 7:30–7:50 | Repair core, or implement approved stretch in order; no new dependencies |
| 7:50–8:00 | Final merges, regression run, phone networking check, production build |
| 8:00–8:10 | Reset, rehearse twice, record successful fallback loop; hard freeze at 8:10 |

On main, integrate reviewed feature branch tips (after fetching them if remote):

```powershell
git switch main
git merge --no-ff dev1-backend
npm run check
npm run test:backend
git merge --no-ff dev2-dashboard
npm run check
git merge --no-ff dev3-customer
npm run build
```

Stop at any failure and assign the fix to the owner. Do not blindly run the next merge after a failed command. After integrating, both UI branches merge main so follow-up fixes use the same server state and contracts. Send subsequent feature commits through the same integration checkout. Dev 1 coordinates; Dev 2 and Dev 3 do not edit each other's files to repair integration.

Near-zero conflicts come from directory ownership, a frozen lockfile, generated contract types, prewired entry points, and no tracked runtime database. Integration failure without text conflicts is still possible, which is why the checkpoint runs the real loop.

## 7:30 checkpoint — mandatory, about five minutes

Stop the server, run `npm run seed:reset`, ensure all mock query flags are off, configure the actual form URL, run `npm run build`, then `npm start`. Keep `DEMO_NOW` at its default. Use `/grandma` on the laptop and `/hub` on a phone connected to the same server. All assertions below are required for a pass.

1. Health mode is `ready`. List contains **50 customers** and exactly **6 lapsed** (`cus_025`…`cus_030`). Core metric cards are present. Opening each customer works; sample sorting by favorite, visits, date, and spend behaves correctly.
2. On phone enter `(519) 555-0125`. Maya's card has **9 / 10** stamps. Refresh and re-enter an alternate phone format; it is still the same account.
3. On Grandma's side open Maya. Show Strawberry Cloud Parfait, itemized history, weekly rhythm and **22-day absence**. Add one stamp. Phone reaches **10 / 10 within two seconds**, without reload. Another add returns a visible full-card error. Redeem reward on phone; it becomes **0 / 10** and stays zero after refresh.
4. Click Draft offer. Source is shown. Draft contains Maya's name, the favorite item, and the allowed free-topping benefit. **Draft does not appear on phone.** Change one word; save; approve. Within two seconds the **exact edited message** appears on Maya's phone. Open another customer's hub and verify it is absent there.
5. Redeem that approved offer in the phone demo. Its status becomes redeemed; approved and redeemed counts update after dashboard refetch. No payment or revenue-recovery claim appears. Refresh both views and verify state survives.
6. Tap **Order ahead**. The **real Google Form** opens in a new tab on the phone without requesting sign-in. A placeholder, missing URL, or generic Google Forms home page fails.
7. Check fallback: with API key absent, a draft still succeeds and says cached. Dev 1's tests force a provider timeout and verify fallback within the configured deadline plus modest local processing time. A real provider call is optional, but if pitched as live it must have been rehearsed successfully.
8. Stop/restart server without reseeding. Maya remains at zero stamps and the approved/redeemed offer persists. Final automated gates pass: `npm run check`, `npm run test:backend`, `npm run build`. No core route returns 501 and no default UI path uses mock state.

If phone networking cannot be restored with the hotspot, two laptop windows and the recording are stage fallbacks, but record that the phone criterion is unverified; do not mark a phone acceptance test passed from a resized desktop view.

**Any failure: all three developers fix the loop within their owned folders.** No dollar figure, flavor chart, or prefilled form work until every core criterion passes. A passing scaffold test alone does not release stretch.

## Final demo preparation

Reset to the frozen seed after recording and rehearsal; verify Maya is back to nine stamps and six lapsed flags remain. Keep the production server running on the powered laptop, both demo URLs open, and a local recording available. Use cached fallback if venue internet fails; the app itself runs locally, although opening Google Forms still needs internet.

At 8:10 freeze code. State honestly in the pitch that identity, checkout, and redemption are simulated; offers are shown in-app, not messaged; estimated monthly revenue at risk is not recovered revenue. Preserve the later event schedule: break after 8:30, parfaits 8:45, demos 9:30.
