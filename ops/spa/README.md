# Hosted SPAs

Nginx serves these directories on the Dilmune proxy:

| Path | Dist |
|---|---|
| `/` (dashboard, checkout `/pay/:token`) | `ops/spa/web/` |
| `/admin/` | `ops/spa/admin/` |

## API origin

Production bundles must call `/v1/…` on the same host. Nginx proxies that
prefix to `api:3000`. Do not bake `http://localhost:3000` into a hosted
build (`VITE_API_BASE_URL` / `VITE_ADMIN_API_BASE_URL`).

Local `vite` still uses `http://localhost:3000`. See the root `README.md`.

## Build on a laptop (not on the 1 vCPU box)

Windows:

```
cd apps/web && npx vite build && robocopy dist ..\..\ops\spa\web /E
cd apps/admin && set VITE_BASE=/admin/&& npx vite build && robocopy dist ..\..\ops\spa\admin /E
```

Unix:

```
(cd apps/web && npx vite build && rm -rf ../../ops/spa/web && cp -R dist ../../ops/spa/web)
(cd apps/admin && VITE_BASE=/admin/ npx vite build && rm -rf ../../ops/spa/admin && cp -R dist ../../ops/spa/admin)
```

Hashed JS/CSS under `ops/spa/web` and `ops/spa/admin` are gitignored.
`index.html` is tracked so the hosted overlay has a valid entrypoint.

Do not replace Dilmune’s live nginx with this file blindly if that host
already has a working SPA config — merge `/admin/` as a separate location
so `/admin` is not the merchant bundle.

HTTPS is not configured here (no invented certificates). Keep
`COOKIE_SECURE=false` on HTTP.
