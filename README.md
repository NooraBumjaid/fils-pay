# FilsPay

Bahraini payment-link platform: merchant checkout, dashboard, admin console,
daily settlement, and webhooks. Team **CASE ZERO** (Reboot01 hackathon).

- **Fork:** https://github.com/NooraBumjaid/fils-pay
- **Working branch:** `hackathon/fixes`
- **Architecture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Hackathon notes:** [`docs/hackathon/`](docs/hackathon/)

Amounts are integer fils (`1 BD = 1000 fils`). See ADR-0001.

## Applications

| Path | Role |
|---|---|
| `apps/api` | Fastify merchant, checkout, and admin HTTP API (`/v1/…`) |
| `apps/web` | Merchant dashboard + public checkout (`/pay/:token`) |
| `apps/admin` | Admin console (hosted at `/admin/`) |
| `apps/settlement` | Go settlement worker |
| `apps/reporting` | Analytics read model |
| `packages/money` | Frozen money helpers (do not modify) |

## Production frontend API (hosted)

The merchant and admin SPAs must call the API on the **same origin**.
Nginx already proxies `/v1/` to the internal API (`api:3000`).

| Environment | Browser fetch |
|---|---|
| Local `vite` (`apps/web` :5173, `apps/admin` :5174) | `http://localhost:3000/v1/…` |
| `vite build` / Dilmune | `/v1/…` (relative, same host) |

Production builds **ignore** `VITE_API_BASE_URL=http://localhost:3000` and
`VITE_ADMIN_API_BASE_URL=http://localhost:3000`. Loopback values must not
appear in `apps/web/dist` or `apps/admin/dist`.

Do **not** set those Vite variables to localhost for a hosted build.

```
# Merchant dashboard + checkout
npm run build --workspace=@filspay/web

# Admin console (must be served under /admin/)
VITE_BASE=/admin/ npm run build --workspace=@filspay/admin
```

On Windows PowerShell:

```
npm run build --workspace=@filspay/web
$env:VITE_BASE = "/admin/"
npm run build --workspace=@filspay/admin
```

Copy the output into `ops/spa/web` and `ops/spa/admin` (see
[`ops/spa/README.md`](ops/spa/README.md)). Hashed JS/CSS under those dirs
are gitignored; `index.html` is tracked.

Hosted proxy locations (`ops/nginx.hosted.conf`):

- `location /v1/` → `proxy_pass http://api:3000;` (path kept, cookies forwarded)
- `location /admin/` → admin SPA
- `location /` → merchant SPA
- `location = /` → `302 /dashboard/login`

Auth, checkout, refunds, dashboard, and admin calls all go through
`apps/web/src/api/client.ts` and `apps/admin/src/api/client.ts`.

## Local development

Postgres, API, settlement, and reporting:

```
# from repo root — see ops/README.md for required env vars
docker compose -f ops/docker-compose.yml up -d postgres
docker compose -f ops/docker-compose.yml run --rm migrate
docker compose -f ops/docker-compose.yml run --rm seed
docker compose -f ops/docker-compose.yml up api settlement reporting
```

Frontends (separate terminals):

```
npm run dev --workspace=@filspay/web     # http://localhost:5173
npm run dev --workspace=@filspay/admin   # http://localhost:5174
```

Vite proxies `/v1` to `http://127.0.0.1:3000` for same-path local use, but
the dev clients still target `http://localhost:3000` so existing CORS
behaviour is unchanged.

Do not commit `ops/.env.hosted` or other secrets. Do not seed a live Dilmune
database you need to keep.

## Tests

```
npx tsx --test --test-concurrency=1 \
  apps/web/src/api/apiBase.new.test.ts \
  apps/admin/src/api/apiBase.new.test.ts \
  scripts/spa-production-api-base.new.test.ts
```

That suite asserts production API bases are same-origin, local Vite still
uses localhost, rebuilt dist JS does not contain `localhost:3000` or
`127.0.0.1:3000`, and hosted nginx proxies `/v1/` without rewriting the path.

CI (`.github/workflows/ci.yml`) runs the same grep after both SPA builds.

`packages/money` is frozen. Do not edit existing `*.test.ts` / `*_test.go`;
add `*.new.test.ts` instead.

Full `npm test` is not currently green (known locked-suite failures). Treat
CI as the hosted/frontend gate, not as proof that every historical test passes.

## Hosted demo

Public HTTP origin: `http://167.71.228.113`

| Path | App |
|---|---|
| `/dashboard/login` | Merchant dashboard |
| `/admin/login` | Admin console |
| `/pay/:token` | Checkout |
| `/v1/…` | API (nginx proxy) |

The live box is only as current as the last deploy. Building these SPAs
locally does **not** update Dilmune until an operator publishes the assets.
Do not SSH, force-push, or deploy from this README.

Manual Dilmune deploys: [`docs/hackathon/GITHUB_ACTIONS_DEPLOYMENT.md`](docs/hackathon/GITHUB_ACTIONS_DEPLOYMENT.md).
