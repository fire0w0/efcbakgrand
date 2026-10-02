# Bakeria Friends Forever

Assumptions: three developers; local demo October 2, 2026; Node 20.18+; synthetic data; no real auth, payments, SMS, or email.

Start with [the vision](docs/VISION.md), [architecture/setup](docs/ARCHITECTURE.md), [shared contracts](docs/CONTRACTS.md), and [integration checklist](docs/INTEGRATION.md). Agent assignments: [Dev 1](docs/DEV1.md), [Dev 2](docs/DEV2.md), [Dev 3](docs/DEV3.md). Read [agent rules](docs/AGENTS.md) before editing.

```powershell
npm ci
Copy-Item .env.example .env
npm run seed:reset
npm run dev
```

Open [Grandma's dashboard](http://localhost:3000/grandma) or [customer hub](http://localhost:3000/hub). Maya's demo phone is `(519) 555-0125`. Read routes work; mutation routes intentionally return 501 until Dev 1 implements them. The starter screens are ownership seams, not finished features.

`npm run build` checks types, contract drift, and scaffold tests before producing frontend assets. Stop dev, then `npm start` to rehearse the production build. Set the real Google Form responder URL in ignored `.env`; no form URL or API key was supplied. No remote repository or cloud deployment is configured.
