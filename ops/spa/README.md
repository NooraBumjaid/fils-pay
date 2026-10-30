# Hosted SPAs

Nginx serves these directories on the Dilmune proxy:

| Path | Dist |
|---|---|
| `/` (dashboard, checkout `/pay/:token`) | `ops/spa/web/` |
| `/admin/` | `ops/spa/admin/` |

Build on a laptop (not on the 1 vCPU box):

```
cd apps/web && npx vite build && robocopy dist ..\..\ops\spa\web /E
cd apps/admin && set VITE_BASE=/admin/&& npx vite build && robocopy dist ..\..\ops\spa\admin /E

Production builds default API calls to the same origin (nginx `/v1/`).
Do not set `VITE_API_BASE_URL=http://localhost:3000` for a hosted build.
```

Unix:

```
(cd apps/web && npx vite build && rm -rf ../../ops/spa/web && cp -R dist ../../ops/spa/web)
(cd apps/admin && VITE_BASE=/admin/ npx vite build && rm -rf ../../ops/spa/admin && cp -R dist ../../ops/spa/admin)
```

Do not replace Dilmune’s live nginx with this file blindly if that host already has a working SPA config — merge `/admin/` as a separate location so `/admin` is not the merchant bundle.

HTTPS is not configured here (no invented certificates). Keep `COOKIE_SECURE=false` on HTTP.
