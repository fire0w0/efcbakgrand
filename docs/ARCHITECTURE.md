# Architecture

Assumptions: empty repository at start; installed Node 20.18.2; three developers; single-machine demo; no cloud account required; no production security claims. CONTRACTS.md owns every shared shape.

## Stack and hosting decision

Use React 19 + TypeScript, Vite 6, Express 5, and a JSON file database through Node's filesystem. One package, one lockfile, one server port, built-in `fetch`, plain CSS, Node's test runner. No ORM, Docker, UI framework, client router, state library, SDK, or external database. Exact resolved versions are committed in package.json and package-lock.json; every teammate uses `npm ci`.

Vite 6 is deliberately selected for the existing Node 20.18.2 environment; its docs support Node 20. Current Vite requires a newer Node minor. Express 5 supports Node 18+. Do not spend tonight upgrading the toolchain. Sources: [Vite 6 setup](https://v6.vite.dev/guide/), [current Vite requirements](https://vite.dev/guide/), [Express 5 requirements](https://expressjs.com/en/guide/migrating-5/).

**Hosting: Dev 1's laptop.** Express serves `/api/*` and Vite middleware during development. For the demo, build once and Express serves `dist/` on the same port. Bind to `0.0.0.0:3000`. Open `http://<laptop-LAN-IP>:3000/hub` on the phone and `/grandma` on the laptop. Use a laptop hotspot if venue Wi-Fi isolates devices. No public deployment tonight: phone-only identity and an unprotected Grandma view are demo behavior.

Data flow: React view → relative `/api` fetch → Express → domain logic → one runtime JSON file. Approval and stamps are server state. The customer hub polls every two seconds while visible and refetches on focus. Never try to synchronize the phone with dashboard-only React state.

## Folder structure and ownership

```text
docs/                         frozen planning source of truth
AGENTS.md                     root discovery pointer, frozen
src/
  main.tsx                    frozen route selection and mount
  styles.css                  frozen global baseline
  shared/
    contracts.ts              generated; frozen
    api.ts                    shared fetch helper; frozen
  dashboard/                  DEV 2 ONLY, including local mocks/styles
    DashboardApp.tsx           default export, no props
  customer/                   DEV 3 ONLY, including local mocks/styles
    CustomerApp.tsx            default export, no props
server/                       DEV 1 ONLY
  index.ts                    HTTP host and frontend middleware
  app.ts                      routes; read handlers + write stubs
  config.ts                   server env parsing
  domain.ts                   summary and metric calculations
  store.ts                    seed bootstrap and atomic file storage
data/
  seed.json                   frozen deterministic seed
  runtime.json                ignored per-checkout data
scripts/                      frozen generation/reset utilities
tests/
  scaffold.test.ts            frozen commit-0 contract/fixture checks
  backend/                    DEV 1 ONLY
index.html, package*.json,
tsconfig.json, vite.config.ts,
.env.example, .gitignore,
.gitattributes                frozen infrastructure
```

Default exports are the frozen integration seams. `/` and `/hub` render CustomerApp; `/hub/:id` is available for explicit demo links. `/grandma` and `/grandma/:id` render DashboardApp. Each owner may handle its detail path with native links and `location.pathname`, or component state. No shared route-table edits are required. Scope every feature stylesheet beneath `.dashboard` or `.customer` (CSS modules are also allowed within the owned folder). Do not redefine global element styles from a feature stylesheet.

## Setup and commands

```powershell
npm ci
Copy-Item .env.example .env
npm run seed:reset
npm run dev
```

Open `http://localhost:3000/grandma` and `http://localhost:3000/hub`. Defaults allow starting without `.env`. Blank form URL shows unconfigured state, not a fake link. No API key is needed for scaffold or cached demo.

```powershell
npm run check
npm run build
npm start
```

Stop the development server before starting production on the same port. `npm start` requires the previously built `dist/` folder. Keep dev dependencies installed on the demo machine because the server runs through tsx. `npm run seed:reset` overwrites only local runtime data; stop the server first. No HTTP reset route is exposed.

`npm run contracts:generate` refreshes the type mirror after an agreed contract change. `npm run contracts:check` detects drift. `npm run seed:generate` regenerates frozen synthetic fixtures; feature branches must not commit changes from either generator. `npm run test:backend` is Dev 1's evolving mutation/AI suite; `npm run check` is the stable commit-0 gate.

## Environment variables

All variables are server-only, loaded from ignored `.env` when it exists using Node's built-in `loadEnvFile`. Restart the server after changing `.env`. No frontend build-time variables. The frontend receives safe configuration through `/api/config` and `/api/hub/:id`.

| Variable | Default | Purpose / owner |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Phone-accessible host binding; Dev 1 |
| `PORT` | `3000` | Single HTTP port; Dev 1 |
| `DATA_FILE` | `data/runtime.json` | Per-checkout mutable JSON; Dev 1; never point at seed |
| `DEMO_NOW` | `2026-10-02T22:30:00.000Z` | Fixed 6:30 PM Toronto calculation time; keep consistent |
| `ORDER_FORM_URL` | empty | Published HTTPS Google Form URL; Dev 3 supplies, Dev 1 sets on demo machine |
| `OPENAI_API_KEY` | empty | Optional real generation; Dev 1 only; never commit or expose to browser |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Fixed small text-model choice for short drafts |
| `AI_TIMEOUT_MS` | `4000` | Abort deadline; fallback on timeout |

## AI implementation handoff

Dev 1 implements a server-only `fetch` to OpenAI's Responses API (`POST https://api.openai.com/v1/responses`) with bearer key, model, task instructions, customer-history input, `store: false`, and a small output limit. Extract message text from output message content, validate it, and use the same stored Offer response as a cached draft. Use an AbortController; no streaming or SDK dependency. Treat customer/order text as data, not instructions. Never send phone numbers to the model. Restrict the benefit to the contracted free topping. The [GPT-4.1 mini model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini) lists Responses support. Verify access with the team's own key before rehearsal; model access is not assumed.

No key or provider failure is a normal cached path, not an API error to the customer. Display `source` so the demo does not misrepresent cached text as a fresh model response. No paid API call is needed to test the scaffold.

## Commit-0 completion boundary

Working now: app mounts both owned entry points; read routes serve deterministic data; lapsed flags and core metrics calculate; runtime file bootstraps; all mutation paths exist and return typed 501 errors; types generate from CONTRACTS.md.

Still assigned to developers: backend writes and AI calls; complete dashboard; phone join/reward/offer UI; poll/refetch behavior; actual form link; end-to-end acceptance. The scaffold is deliberately not represented as a finished application.
