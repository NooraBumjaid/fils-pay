# Dilmune Cloud deployment

Target: **1 vCPU, 2 GB RAM**. API limit: **0.5 vCPU / 512 MB**.

The live box already has locally edited Docker Compose and Nginx files.
**Diff before replacing them.** Keep any live `server_name`, TLS paths, extra
locations, and published-port choices that are not the bugs below.

Automated deploys: `docs/hackathon/GITHUB_ACTIONS_DEPLOYMENT.md`.
Do not run resource-heavy image builds on the box if you can load images
from a laptop. Do **not** run `seed` against data you need to keep.
Migration `0079_lifetime_payout_estimate_bigint.sql` is already applied —
`migrate` is idempotent and will skip it.

## 1. Secrets

Copy `ops/env.hosted.example` to `ops/.env.hosted` (gitignored).

Keep `COOKIE_SECURE=false` until TLS actually terminates in front of the
API. Set `CORS_ORIGINS` and `CHECKOUT_BASE_URL` to the public origin
judges use (IP or hostname). Do not invent a domain.

## 2. Core stack (after merging this overlay with the live files)

From the repository root, on the box, after a `git pull` of the reviewed
commit:

```
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted up -d postgres
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted run --rm migrate
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted up -d --build api settlement reporting
```

Then reload **proxy** only after the SPA dirs and nginx conf are merged
(section 4). Do not `docker compose down -v`.

Confirm the merged API service has **no** host port 3000:

```
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted config
```

`ports: []` in YAML does **not** unpublish an inherited `3000:3000`. The
overlay uses `ports: !override []` (the form already used on Dilmune).

## 3. Resource split

| Service | CPU | Memory |
|---|---|---|
| postgres | 0.20 | 384 MB (`shared_buffers=64MB`) |
| api | 0.50 | 512 MB (`NODE_OPTIONS=--max-old-space-size=384`, `SHARP_CACHE=0`) |
| settlement | 0.15 | 256 MB |
| reporting | 0.10 | 192 MB |
| nginx proxy | 0.05 | 32 MB |

Sum = **1.00 vCPU**. Postgres is published on `127.0.0.1:5432` only.
Public HTTP is nginx `:80` (`/healthz`, `/readyz`, `/v1/`, `/`, `/admin/`).

## 4. Merchant dashboard, admin, checkout

Build on a laptop (see `ops/spa/README.md`), copy `apps/web/dist` →
`ops/spa/web` and `apps/admin/dist` (with `VITE_BASE=/admin/`) →
`ops/spa/admin`, then rsync those directories onto the box.

Nginx must serve:

| URL | Dist |
|---|---|
| `/` and `/pay/...` | merchant SPA (`ops/spa/web`) |
| `/admin/` | admin SPA (`ops/spa/admin`) |
| `/v1/` | `proxy_pass http://api:3000` |

If the live nginx already hosts a working merchant SPA, **add**
`location /admin/` rather than overwriting the whole file blindly.

Vite on `:5173`/`:5174` is a laptop fallback only. Do not rely on it for
judging if those ports time out.

## 5. HTTPS

No certificate is in this repo. When a real cert exists for a real
hostname, use `ops/nginx.hosted.tls.example.conf` as a template and set
`COOKIE_SECURE=true`. Until then keep HTTP + `COOKIE_SECURE=false`.

## 6. Health

```
curl -fsS http://127.0.0.1/healthz
curl -fsS http://127.0.0.1/readyz
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/healthz
```

The last command must **fail to connect** after port 3000 is unpublished.
`/readyz` is boot-time only (incident 2026-05-14).

## 7. What not to run on the box

- `go test` / settlement compile loops
- Full `npm test` against the hosted database
- `seed` against any database you need to keep
- Publishing Postgres on `0.0.0.0`
- `docker compose down -v`
- Blindly replacing the live nginx/compose files
