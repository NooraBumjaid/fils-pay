# Dilmune Cloud deployment

Target: **1 vCPU, 2 GB RAM**. API limit: **0.5 vCPU / 512 MB**.

Do not run resource-heavy image builds on the box if you can load images
from a laptop. The hosted overlay does not start web/admin containers;
those are Vite apps that talk to the API.

## 1. Secrets

Copy `ops/env.hosted.example` to `ops/.env.hosted` (gitignored pattern:
keep it off the repo).

```
openssl rand -base64 24   # POSTGRES_PASSWORD — URL-safe, no /, +, =
openssl rand -hex 32      # SETTLEMENT_INTERNAL_TOKEN
openssl rand -base64 32   # WEBHOOK_SECRET_ENCRYPTION_KEY (must decode to 32 bytes)
```

Set `ACQUIRER_CALLBACK_SIGNING_SECRET` to the sandbox HMAC secret.
Set `CORS_ORIGINS` to the public dashboard/admin origins, for example
`http://<host>:5173,http://<host>:5174`.
Keep `COOKIE_SECURE=false` unless TLS terminates in front of the proxy.

## 2. Core stack

From the repository root:

```
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted up -d postgres
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted run --rm migrate
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted up -d api settlement reporting proxy
```

Optional demo fixtures (truncates seed tables — do not use on preserved data):

```
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted run --rm seed
```

## 3. Resource split

| Service | CPU | Memory |
|---|---|---|
| postgres | 0.25 | 384 MB (`shared_buffers=64MB`) |
| api | 0.50 | 512 MB (`NODE_OPTIONS=--max-old-space-size=384`, `SHARP_CACHE=0`) |
| settlement | 0.15 | 256 MB |
| reporting | 0.10 | 192 MB |
| nginx proxy | 0.05 | 32 MB |

Postgres is published on `127.0.0.1:5432` only. Public HTTP is nginx `:80`
(`/healthz`, `/readyz`, `/v1/`).

## 4. Merchant dashboard, admin, checkout

On the same box or a laptop pointing at the public API:

```
cd apps/web && npx vite --host --port 5173
cd apps/admin && npx vite --host --port 5174
```

Vite proxies `/v1` to `127.0.0.1:3000` when run on the box. From another
machine, set `VITE_API_BASE_URL=http://<host>` (port 80) **and** add that
page origin to `CORS_ORIGINS`.

## 5. Health

```
curl -fsS http://127.0.0.1/healthz
curl -fsS http://127.0.0.1/readyz
```

`/readyz` is boot-time only (incident 2026-05-14). Confirm Postgres with a
query, not with `/readyz` after boot.

## 6. What not to run on the box

- `go test` / settlement compile loops — the image already compiles once
- Full `npm test` against the hosted database
- `seed` against any database you need to keep
- Publishing Postgres on `0.0.0.0`
