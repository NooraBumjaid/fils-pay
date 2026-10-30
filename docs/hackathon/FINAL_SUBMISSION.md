# FilsPay — final submission evidence (Team CASE ZERO)

**Date:** 2026-10-30  
**Branch:** `hackathon/fixes`  
**GitHub `origin/hackathon/fixes`:** `d47cf51` (`ci: add SSH connection test`)  
**Local HEAD:** same SHA, **working tree dirty** (integration not committed)  
**Backup:** `C:\Users\ASUS\Desktop\fils-pay-wt-backup-2026-10-30` (preserved; not in git)  
**This session:** no SSH, no Dilmune access, no commit, no push, no deploy, no `.env.hosted` writes

---

## 1. Confirmed fixes and test evidence

### 1.1 Root redirect (this pass)

`ops/nginx.hosted.conf` now has an exact-match block **before** `location /`:

```
location = / { return 302 /dashboard/login; }
```

It does not match `/pay/`, `/dashboard/`, `/admin/`, `/v1/`, `/healthz`, or `/readyz`.

### 1.2 Already in the local tree (prefer these over Dilmune bind-mount layout)

| Area | Local implementation |
|---|---|
| Webhook SSRF + body cap | `destination.ts` / `transport.ts`; HTTPS + public DNS in production; `redirect: "manual"`; 64 KiB cap |
| API port | `ports: !override []` (host `:3000` unpublished) |
| Settlement | `command: ["daemon"]` (matches `ENTRYPOINT ["/settlement"]`) |
| CPU | postgres 0.20 + api 0.50 + settlement 0.15 + reporting 0.10 + proxy 0.05 = **1.00**; API **512 MB** |
| Nginx | `limit_req` 20 r/s burst 40 on `/v1/`; `/admin/` vs merchant `/` |
| Admin hosted base | `vite build` → `/admin/`; router basename from `BASE_URL` |
| Payment-link URLs | `buildCheckoutUrl(checkoutBaseUrl, token)`; hosted overlay **requires** `CHECKOUT_BASE_URL` (no localhost default) |
| SPA mounts | `ops/spa/web` → `html/web`; `ops/spa/admin` → `html/admin` |
| CI / deploy | `.github/workflows/ci.yml`, `deploy-dilmune.yml`, `scripts/deploy/` |

Compiled Merchant and Admin dists were built locally and copied into `ops/spa/{web,admin}` (hashed assets gitignored; Admin `index.html` references `/admin/assets/...`). Deploy workflow rebuilds both SPAs with `VITE_BASE=/admin/` and rsyncs them onto the server.

### 1.3 Tests run this pass

| Suite | Result |
|---|---|
| Overlay + deploy-script (`hosted-overlay`, `forbidden-commands`) | **5/5 pass** |
| Webhook SSRF/body-cap + checkout URL | **15/15 pass** |
| Locked webhook CRUD/delivery/testSend | **15/15 pass** |
| `@filspay/money` | **40/40 pass** |
| Merchant `vite build` | **pass** |
| Admin `vite build` `VITE_BASE=/admin/` | **pass** (assets under `/admin/assets/`) |
| `docker compose … config` | **pass** — no published `3000`; settlement `daemon`; API `cpus: 0.5` / 512 MB; `CHECKOUT_BASE_URL` interpolated |
| `nginx:1.27-alpine nginx -t` (`--add-host api:127.0.0.1`) | **pass** |

**Failed:** none of the suites above.

**Untested this pass:**

- Full `npm test` (known pre-existing failures: CSV cents lock, reporting poison-pill, dispatcher jitter)
- Go `go test ./...` (Go not on local PATH; CI job is configured)
- Live Dilmune HTTP (no SSH / no deploy)
- Browser checkout → capture → refund
- Load / k6
- TLS / `COOKIE_SECURE=true`

---

## 2. Architecture and deployment

### 2.1 Request path (intended hosted)

```
Judge browser
  → :80 nginx
       /                302 /dashboard/login
       /dashboard/*     merchant SPA (ops/spa/web)
       /pay/:token      merchant SPA checkout
       /admin/          admin SPA (ops/spa/admin, Vite base /admin/)
       /v1/             limit_req → api:3000 (compose network only)
       /healthz /readyz api:3000 (no rate limit)
  → api (0.5 CPU / 512 MB) → postgres / settlement:8091 / webhook HTTPS
```

Postgres is published on `127.0.0.1:5432` only. API must **not** be on public `:3000`.

### 2.2 How to deploy (manual only)

1. Commit + push the dirty tree (not done).  
2. GitHub environment `dilmune-production` + secrets `DILMUNE_SSH_*` (or the SSH connectivity test secrets).  
3. Actions → **Deploy Dilmune** → SHA of the pushed commit.  
   - First run: **apply_hosted_config** unchecked until live nginx/compose are diffed.  
   - **run_migrations** unchecked unless `MIGRATE` is typed after a dump.  
4. Set live `ops/.env.hosted` `CHECKOUT_BASE_URL` and `CORS_ORIGINS` to the **public origin** (IP or hostname). Do not leave `http://localhost:5173`.  
5. Do not `seed`, `down -v`, or `git reset --hard`.

Details: `docs/hackathon/GITHUB_ACTIONS_DEPLOYMENT.md`.

### 2.3 Dilmune `3547b4e`

That commit is **not** in this clone. Behaviour was matched via description. Local SPA mounts + nginx `root`/`try_files` are kept instead of Dilmune’s `apps/*/dist` + `alias` layout; they serve the same URLs and pass tests.

---

## 3. Remaining bugs and open risks

| ID | Risk | Notes |
|---|---|---|
| Live lag | High | GitHub is `d47cf51`; local integration is uncommitted; Dilmune API rebuild after `3fd9b0e`/`3d30e53` unconfirmed |
| **063** | High | HTTP cookies; no cert in repo |
| **068** | High | OTP promote keeps session token (locked tests) |
| **069** | High | Reporting poison payload stalls consumer (locked tests) |
| **070–076** | Med–Low | Settlement cache, monthly float32, KYC header/order, HMAC window, `/readyz` boot-only, discount lock |
| `CHECKOUT_BASE_URL` | High if unset on live | Overlay now **requires** the var; live `.env.hosted` must be filled with the public origin |
| SPA hashes | Low | `ops/spa/*/index.html` now points at this machine’s build hashes; GHA rebuilds on deploy |
| Full suite | Med | `npm test` not a green gate |

BUG-014/015 remain non-bugs (ADR-0004; MDR recalc `closed`).

---

## 4. Deployment URLs requiring live verification

Do **not** treat these as currently proven; last live probe (earlier today) still showed public `:3000` and `/admin` as the merchant SPA.

| URL | Expected after deploy |
|---|---|
| `http://167.71.228.113/healthz` | `200` `ok` via nginx |
| `http://167.71.228.113/readyz` | `200` (boot-only semantics) |
| `http://167.71.228.113/` | **302** `/dashboard/login` |
| `http://167.71.228.113/dashboard/login` | Merchant SPA (title may still say Checkout) |
| `http://167.71.228.113/admin/` | **Admin** SPA (`FilsPay Admin`, assets `/admin/assets/…`) |
| `http://167.71.228.113/pay/<token>` | Checkout, not admin |
| `http://167.71.228.113/v1/transactions` | `401` JSON, not HTML |
| `http://167.71.228.113:3000/healthz` | **connection refused** |

Replace the IP with a hostname if one is issued. HTTPS is not configured.

---

## 5. Missing evidence for the final PDF

Copy into the PDF only after the matching live check exists:

1. Screenshot: `/` → login, `/admin/` is Admin (not checkout).  
2. Screenshot or curl: `:3000` closed; `/v1/` 401.  
3. One checkout → capture → refund on the live SPA (money path).  
4. `git rev-parse HEAD` **inside** the live API container vs local/GitHub SHA.  
5. `docker compose config` / `docker stats` on Dilmune (CPU 0.5 / 512 MB).  
6. A minted payment-link URL whose host is the **public** origin, not `localhost:5173`.  
7. GitHub Actions CI green on the commit you submit; Deploy run log without secrets.  
8. Confirmation `0079` is applied and **seed was not** re-run.  
9. Optional: k6 3-VU laptop checkout (do not run on the 1 vCPU box).  
10. Official `FP-300.pdf` if judges require the original brief.

---

## 6. Blocking final submission (process)

- **Commit + push** of the dirty integration (needs your approval).  
- **Deploy** of that SHA (needs your approval + GitHub secrets + Dilmune env `CHECKOUT_BASE_URL`).  
- **Live URL checks** listed in §4.  
- PDF screenshots from those live checks.

Local code+tests for the hosted layout are ready for review. They are **not** live until you approve commit, push, and deploy.
