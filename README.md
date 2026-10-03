# Bakeria Friends Forever

Assumptions: three developers; local demo October 2, 2026; Node 20.18+; synthetic data; no real auth, payments, SMS, or email.

Start with [the vision](docs/VISION.md), [architecture/setup](docs/ARCHITECTURE.md), [shared contracts](docs/CONTRACTS.md), and [integration checklist](docs/INTEGRATION.md). Agent assignments: [Dev 1](docs/DEV1.md), [Dev 2](docs/DEV2.md), [Dev 3](docs/DEV3.md). Read [agent rules](docs/AGENTS.md) before editing.

All three feature branches are merged. The [implementation plan](docs/NEXT_STEPS.md) specifies executable work packages for UI clarity, the cached-draft integration bug, dashboard refresh, and estimated revenue at risk. Hand it directly to the implementing agents. API key and Google Form integration remain delegated.

```powershell
npm ci
Copy-Item .env.example .env
npm run seed:reset
npm run dev
```

Open [Grandma's dashboard](http://localhost:3000/grandma) or [customer hub](http://localhost:3000/hub). Maya's demo phone is `(519) 555-0125`. Read/write routes, dashboard, and customer hub are implemented. Full integrated phone/browser acceptance remains to be verified; see the plan for known gaps.

`npm run build` checks types, contract drift, and scaffold tests before producing frontend assets. Stop dev, then `npm start` to rehearse the production build. Run `npm run test:backend` separately for backend coverage. Integration delegates configure the key and real form URL in ignored `.env`. The Git remote is configured; hosting remains local.
