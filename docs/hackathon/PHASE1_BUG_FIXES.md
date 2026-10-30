# FilsPay Phase 1 — BUG-061–076 classification and 061–067 fixes

**Date:** 2026-10-30  
**Branch:** `hackathon/fixes`  
**Repo HEAD at start of this work:** `3fd9b0e`  
**Mode:** local repository fixes + tests only. No SSH, no deploy, no seed, no commit, no push.

Live Dilmune notes used here come from the earlier audit probe (`http://167.71.228.113`): `/healthz` 200, `/readyz` 200, public `:3000`, `/` and `/admin` serving the merchant checkout SPA. This session did **not** re-probe the server. Repository inspection alone does not prove current live state. Migration `0079` is reported applied; API/settlement rebuild after `3fd9b0e` is **unconfirmed**.

---

## 1. Full BUG-061–076 classification

| Bug ID | Severity | Code / Hosting / Live / Mixed | Affected Files | Root Cause | Required Fix | Live Verification Needed |
|---|---|---|---|---|---|---|
| **061** | High | **Mixed (B+C)** | `ops/docker-compose.yml`; `ops/docker-compose.hosted.yml` | Base compose publishes `3000:3000`. Overlay `ports: []` does **not** drop inherited ports (Compose concatenates). Earlier live probe: `:3000/healthz` 200. | Overlay `ports: !reset []`. On Dilmune, merge overlay and confirm host `:3000` is closed. Do not clobber live compose extras. | Yes — `docker compose config` on the box; `curl :3000` must fail. |
| **062** | High | **Mixed (A+B+C)** | `ops/nginx.hosted.conf`; `ops/spa/*`; `apps/admin` vite/router; `apps/web` + `apps/admin` API clients | Repo overlay previously had no admin dist. Live nginx (not the repo file) served the merchant SPA at `/` and `/admin`. Admin app defaults talked to `localhost:3000`. | Separate nginx `location /admin/` vs `/`; build admin with `VITE_BASE=/admin/`; production API base = same origin. Merge into live nginx; copy SPA dists. | Yes — `GET /admin/` must be the admin bundle, not checkout. |
| **063** | High | **Mixed (B+C) + external prereq** | `ops/docker-compose.hosted.yml` `COOKIE_SECURE`; `ops/nginx.hosted.tls.example.conf`; cookie setters | Demo is cleartext HTTP. `COOKIE_SECURE` defaults false on the overlay so cookies work. Secure cookies without TLS would break login. | Keep HTTP cookies until a real cert exists. Provide TLS nginx example. Do **not** invent a domain or certificate. | Yes — only after a real hostname/cert is issued. |
| **064** | Medium | **Mixed (B+C)** | `ops/docker-compose.hosted.yml` | Overlay CPU was 0.25+0.50+0.15+0.10+0.05 = **1.05** on a 1 vCPU box. Live cgroups were never read. | Postgres `cpus: "0.20"` so the sum is **1.00**. API stays 0.50 / 512 MB. | Yes — `docker stats` / merged compose on the box. |
| **065** | High | **Mixed (B+C)** | `ops/nginx.hosted.conf` | No `limit_req` on `/v1/`. Fastify only 429s OTP. | Nginx 20 r/s, burst 40, JSON 429 on `/v1/` only. Health/SPA unthrottled. | Yes — after nginx reload; do not k6 the droplet. |
| **066** | Critical | **A** (deploy is C) | `apps/api/src/webhooks/destination.ts`; `transport.ts`; `create.ts`; `update.ts`; `index.ts`; `app.ts` | `validateWebhookUrl` was scheme-only. `fetch` followed redirects. Comment about private-IP blocking was false. | Production: HTTPS + public DNS only; no loopback/RFC1918/link-local/CGNAT/metadata; no userinfo; no redirect follow; connect-time lookup pin. Test env still allows `http://127.0.0.1` for locked tests. | Yes — after API image rebuild. Not confirmed live. |
| **067** | High | **A** (deploy is C) | `apps/api/src/webhooks/transport.ts` | `response.text()` unbounded; timeout does not cap size. 512 MB API. | 64 KiB cap; oversize → `response_too_large` (not success). | Yes — after API rebuild. |
| **068** | High | **A** | `apps/api/src/auth/sessions.ts` | OTP promote keeps the pending session token (fixation). | Issue a new token after OTP. **Blocked:** locked login tests reuse the pending cookie. | n/a until test policy is waived |
| **069** | High | **A** | `apps/reporting/src/consumer/applyEvent.ts`; `runConsumerPass.ts` | Missing `merchantId` throws; whole pass + watermark roll back. | Skip/poison-log one event. **Blocked:** locked atomicity test requires throw. | n/a until test policy is waived |
| **070** | Medium | **A** | `apps/settlement/internal/balances/cache.go` | `ApplyPayout` UPDATE no-ops if `merchant_balances` row is missing. Ledger still correct. | Upsert like close. Not in 061–067 scope. | Split-child usage in prod unknown |
| **071** | Low | **A** | `apps/settlement/internal/settlement/payout_estimate.go` | Monthly helper still sums `float32`. No in-repo caller found. Lifetime path was BUG-056. | int64 if the helper is wired. Latent. | n/a |
| **072** | Medium | **A** | `apps/api/src/routes/kyc.ts` | `Content-Disposition` interpolates client `fileName`. | RFC 5987 / strip CR-LF/quotes. Not in 061–067 scope. | n/a |
| **073** | Low | **A** | `apps/api/src/onboarding/kyc.ts` | Bytes written before DB insert → orphan files. | Insert then write. Not in 061–067 scope. | n/a |
| **074** | Medium | **A** | `apps/api/src/webhooks/inboundVerify.ts` | Acquirer HMAC has no timestamp window. Unique `callback_id` (049) blocks identical replay. | Reject stale `t=`. Not in 061–067 scope. | n/a |
| **075** | Medium | **A** (documented design) | `apps/api/src/routes/health.ts` | `/readyz` is boot-only (2026-05-14). | Recheck DB, or keep as design and document for judges. | Live `/readyz` 200 does not prove DB health |
| **076** | Low | **A** | `apps/api/src/payments/discountAdjustment.ts` | Discount lock is by transaction id only. Caller is already own-merchant after capture. | Add merchant predicate. Not in 061–067 scope. | n/a |

---

## 2. Which bugs are from application code

| Bug | Why it is application code |
|---|---|
| **062** (part) | Admin `basename` / `VITE_BASE`; production API clients must not hardcode `localhost:3000`. |
| **066** | Webhook URL validation and dispatch transport. |
| **067** | Dispatch transport body cap. |
| **068–076** | Auth, reporting, settlement cache, KYC, inbound HMAC, health, capture lock. **Not fixed in this phase.** |

---

## 3. Which bugs are from hosting configuration (repository)

| Bug | Repo hosting change |
|---|---|
| **061** | `ports: !reset []` on `api` in `ops/docker-compose.hosted.yml`. |
| **062** | `ops/nginx.hosted.conf` `/admin/` vs `/`; `ops/spa/{web,admin}` mount points. |
| **063** | TLS example config; `COOKIE_SECURE=false` remains the HTTP default. |
| **064** | Postgres `cpus: "0.20"`; documented 1.00 budget. |
| **065** | `limit_req_zone` + `/v1/` 20 r/s burst 40. |

---

## 4. Which bugs require live Dilmune action

All of **061–067** require a live step after this tree is reviewed. None of those live steps were performed here.

| Bug | Live action |
|---|---|
| 061 | Merge overlay; recreate API **without** publishing 3000; confirm `:3000` closed. Preserve local compose edits. |
| 062 | Build SPAs on a laptop; copy dists; merge `/admin/` into the **existing** nginx (do not blindly overwrite). |
| 063 | Needs a real hostname and certificate. Until then keep HTTP + `COOKIE_SECURE=false`. |
| 064 | Apply overlay CPU limits; `docker stats`. |
| 065 | Reload nginx with `limit_req`. Do not load-test the 1 vCPU box. |
| 066 / 067 | Rebuild/restart **api** so destination + transport code is running. Settlement rebuild is unrelated to these two. |
| 053–060 | Still need API+settlement rebuild if that has not happened after `3fd9b0e`. 0079 is already applied — do not re-seed. |

**Not confirmed on live in this session:** current git SHA inside containers, nginx file inside the proxy container, cgroup limits, TLS, SPA bundles.

---

## 5. BUG-061–067 priority buckets

### 1. Fixable entirely in repository code/configuration

- **066, 067** — application code + new tests.
- **061, 064** — compose overlay only (`!reset` ports; CPU 0.20).
- **065** — nginx `limit_req` in repo.
- **062** — nginx locations + admin base + same-origin API clients + SPA README. Live copy of dists is still required.

### 2. Requiring Dilmune server deployment changes

- Apply merged compose/nginx **without** destroying local edits.
- Rebuild API (066/067 and any 053–060 bits not yet running).
- Unpublish `:3000`.
- Install SPA files under `ops/spa/web` and `ops/spa/admin`.
- Set `CORS_ORIGINS` and `CHECKOUT_BASE_URL` to the public origin actually used (IP or hostname). **Do not guess a domain.**

### 3. External prerequisites (DNS / HTTPS certificates)

- **063** cannot be completed in-repo. `ops/nginx.hosted.tls.example.conf` uses placeholders `YOUR_PUBLIC_HOSTNAME` and `/etc/ssl/filspay/{fullchain,privkey}.pem`. No certificate was created.

### 4. Needing additional verification before treating as live-fixed

- **061** live `:3000` (historically open; not re-probed now).
- **062** live HTML at `/admin/` vs `/`.
- **064** live cgroups vs compose file.
- **065** live 429 behaviour (no load test run).
- **COOKIE_SECURE / NODE_ENV / CORS_ORIGINS** on the running API container.
- Whether API/settlement images already include `3fd9b0e`.

---

## 6. BUG-061–067 fixes implemented

### Webhook security (066, 067)

- New `assertSafeWebhookDestination`:
  - Production: `https` only; reject userinfo; reject loopback, RFC1918, link-local, CGNAT, multicast, IPv4-mapped, ULA, `.localhost` / `.internal` / `.local`, metadata hostnames, decimal/short IPv4 forms.
  - Resolve **all** A/AAAA records; any unsafe address → `invalid_url`.
  - Non-production: scheme + userinfo only, so locked `http://127.0.0.1` tests still pass.
- Create/update webhook endpoints `await` that check.
- Transport:
  - Pre-flight destination check on every send.
  - `redirect: "manual"` on the fetch test path; Node `http`/`https.request` does not follow redirects.
  - Production connect uses a pinned `lookup` so a DNS change after the pre-check cannot connect to a private IP.
  - Response cap `WEBHOOK_MAX_RESPONSE_BYTES = 65536` (content-length and streaming). Oversize → `response_too_large`, empty body, not `succeeded`.
  - Timeouts unchanged (`webhookRequestTimeoutMs`).
- Retry/backoff unchanged: blocked/oversize look like transport failure and exhaust normally.

### Hosting (061–065)

- **061:** `api.ports: !reset []`. Verified with `docker compose config`: API has **no** `ports:`; host publishes postgres `127.0.0.1:5432` and proxy `80` only. Internal `api:3000` and `settlement:8091` stay on the compose network.
- **062:** nginx `location /admin/` (admin dist) before `location /` (merchant dist). Admin Vite `base` + React Router `basename`. Production SPA fetches use same-origin `""` so browsers do not call `localhost:3000`.
- **063:** HTTP overlay unchanged (`COOKIE_SECURE=false`). TLS example only.
- **064:** Postgres 0.20 CPU. Merged config: api `cpus: 0.5`, `mem_limit: 536870912` (512 MB). Sum 1.00.
- **065:** `limit_req` on `/v1/` only (checkout/refund/authorize are a handful of calls; 20 r/s burst 40). `/healthz` and SPAs are not in that zone.

---

## 7. Files changed

| File | Change |
|---|---|
| `apps/api/src/webhooks/destination.ts` | **New** — IP/DNS/HTTPS destination policy |
| `apps/api/src/webhooks/transport.ts` | Redirects off; body cap; production lookup pin |
| `apps/api/src/webhooks/create.ts` | Async `validateWebhookUrl` → destination assert |
| `apps/api/src/webhooks/update.ts` | Await URL validation |
| `apps/api/src/index.ts` | `createFetchTransport({ nodeEnv })` |
| `apps/api/src/app.ts` | Default transport gets `config.nodeEnv` |
| `apps/api/src/webhooks/destination.new.test.ts` | **New** SSRF unit tests |
| `apps/api/src/webhooks/transport.ssrf.new.test.ts` | **New** redirect/rebind/body tests |
| `ops/docker-compose.hosted.yml` | `!reset` ports; postgres 0.20 CPU; SPA volumes; `CHECKOUT_BASE_URL` |
| `ops/nginx.hosted.conf` | `/admin/`, `/v1/` rate limit, SPA roots |
| `ops/nginx.hosted.tls.example.conf` | **New** placeholder TLS server |
| `ops/spa/web/index.html`, `ops/spa/admin/index.html`, `ops/spa/README.md` | SPA placeholders + build notes |
| `ops/env.hosted.example` | CORS / checkout origin placeholders |
| `apps/admin/vite.config.ts`, `apps/admin/src/router.tsx` | `/admin/` base |
| `apps/admin/src/api/client.ts`, `apps/web/src/api/client.ts` | Production same-origin API |
| `scripts/hosted-overlay.new.test.ts` | **New** overlay/nginx assertions |
| `.gitignore` | Ignore built SPA copies; keep placeholders |
| `docs/hackathon/DILMUNE_DEPLOY.md` | Safe merge/rebuild steps |
| `docs/hackathon/PHASE1_BUG_FIXES.md` | This report |

Existing `*.test.ts` / `*_test.go` files were **not** modified. Frozen money packages were **not** touched. No migrations changed.

---

## 8. Tests executed and results

Commands actually run:

```
npx tsx --test --test-concurrency=1 src/webhooks/destination.new.test.ts src/webhooks/transport.ssrf.new.test.ts
# cwd apps/api → 13 pass, 0 fail

npx tsx --test --test-concurrency=1 scripts/hosted-overlay.new.test.ts
# cwd repo root → 2 pass, 0 fail

npx tsx --test --test-concurrency=1 src/routes/webhooks.test.ts src/webhooks/testSend.test.ts
# cwd apps/api → 15 pass, 0 fail (locked local-receiver + CRUD)

docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml config
# dummy env only; no containers started
```

| Check | Result |
|---|---|
| Public https destination still deliverable (mocked public DNS) | Pass |
| Loopback / RFC1918 / link-local / metadata / userinfo / http-in-prod rejected | Pass |
| Mixed public+private DNS rejected | Pass |
| Redirects not followed (`redirect: "manual"`) | Pass |
| DNS that flips to loopback at connect time blocked | Pass |
| `http://127.0.0.1` allowed when `NODE_ENV=test` | Pass |
| Oversized content-length and streaming body → `response_too_large` | Pass |
| Locked webhook create/dispatch/signature against local receiver | Pass (15) |
| Overlay `ports: !reset []`; nginx `/admin/` before `/`; `limit_req` | Pass |
| Merged compose publishes **no** API `:3000` | Pass (`config` has api without `ports`) |
| Merged API `cpus: 0.5`, `mem_limit: 536870912` | Pass |
| Checkout/refund through live nginx | **Not run** (no Dilmune / no local proxy stack) |
| Admin HTML on live `/admin` | **Not run** |
| Full `npm test` / Go tests | **Not run** (focused Phase 1 only) |

Dispatcher logs about short ciphertext during `webhooks.test.ts` are leftover rows in the shared local DB; they did not fail assertions.

---

## 9. Remaining unresolved bugs

| Bug | Why unresolved |
|---|---|
| **063** | No real certificate or hostname. HTTP demo remains. |
| **068** | Locked login tests bind the pending cookie. |
| **069** | Locked reporting test requires throw on poison payload. |
| **070–076** | Out of 061–067 scope; not started. |
| **061–067 live** | Repo is ready; Dilmune was not changed. |
| **053–060 live** | Rebuild unconfirmed even though 0079 is applied. |

---

## 10. Exact safe deployment steps for Dilmune

Do this **after** a human reviews this branch. Do **not** `compose down -v`, do **not** seed, do **not** replace live nginx/compose blindly.

1. On a laptop: `git log -1 --oneline` (this branch). Build SPAs per `ops/spa/README.md` (`VITE_BASE=/admin/` for admin). Copy dists into `ops/spa/web` and `ops/spa/admin`.
2. On Dilmune: pull the reviewed commit. **Diff** live compose and nginx against `ops/docker-compose.hosted.yml` and `ops/nginx.hosted.conf`. Merge only:
   - `api.ports: !reset []`
   - postgres `cpus: "0.20"`
   - `limit_req` on `/v1/`
   - `location /admin/` **in addition to** the working merchant `location /`
   - SPA volume mounts if those paths will be used
   Keep any live `server_name`, TLS, extra locations.
3. Set `CORS_ORIGINS` and `CHECKOUT_BASE_URL` in the live env file to the origin judges actually open. Keep `COOKIE_SECURE=false` unless TLS is already terminating.
4. Recreate API/settlement/reporting (build elsewhere if the 1 vCPU box is tight):

```
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted run --rm migrate
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted up -d --build api settlement reporting
```

`migrate` will skip 0079.

5. Reload proxy after nginx + SPA files are in place (`up -d proxy` or `nginx -s reload` inside the existing proxy container).
6. Do not start `seed`. Do not publish postgres on `0.0.0.0`.

HTTPS: only if a real cert exists, then swap in the TLS example and set `COOKIE_SECURE=true`.

---

## 11. Verification commands after deployment

```
# Public proxy
curl -fsS http://127.0.0.1/healthz
curl -fsS http://127.0.0.1/readyz
curl -sS -D- http://127.0.0.1/v1/transactions -o /dev/null
# expect 401 JSON, not a SPA

# Port 3000 must not answer on the public interface
curl -sS -o /dev/null -w "%{http_code}\n" --max-time 3 http://127.0.0.1:3000/healthz
# expect connection refused / timeout, not 200

# Admin vs merchant SPA
curl -sS http://127.0.0.1/ | head
curl -sS http://127.0.0.1/admin/ | head
# /admin/ must not be the merchant checkout title

# Compose merge (on the box, using the live env file)
docker compose -f ops/docker-compose.yml -f ops/docker-compose.hosted.yml --env-file ops/.env.hosted config | sed -n '/^  api:/,/^  [a-z]/p'
# api must show cpus 0.5, mem_limit 512MiB, and no host port 3000

docker stats --no-stream
```

Webhook SSRF cannot be proven with a public curl; after deploy, registering `https://127.0.0.1/` or `http://example.com/hook` as a merchant webhook in **production** must return `invalid_url`.

---

## 12. Summary table

| Bug | Category | Fixed Locally? | Tested? | Requires Dilmune Action? | Status |
|---|---|---|---|---|---|
| 061 | Mixed B+C | Yes (`!reset []`) | Yes (`compose config` + overlay test) | Yes | Repo ready; live unpublished-port **unconfirmed** |
| 062 | Mixed A+B+C | Yes (nginx + admin base + same-origin API) | Overlay/nginx tests; no browser | Yes | Repo ready; live SPA **unconfirmed** |
| 063 | Mixed B+C + DNS/TLS | Partial (TLS example only) | n/a | Yes + real cert | **Unresolved** until TLS exists |
| 064 | Mixed B+C | Yes (CPU sum 1.00) | Yes (`compose config`) | Yes | Repo ready; live cgroups **unconfirmed** |
| 065 | Mixed B+C | Yes (`limit_req`) | Overlay test; no load test | Yes | Repo ready; live 429 **unconfirmed** |
| 066 | A | Yes | Yes (13 new + 15 locked webhook) | Yes (API rebuild) | Repo ready |
| 067 | A | Yes | Yes (body-cap tests) | Yes (API rebuild) | Repo ready |
| 068 | A | No | n/a | No | Blocked by locked tests |
| 069 | A | No | n/a | No | Blocked by locked tests |
| 070 | A | No | n/a | No | Unresolved |
| 071 | A | No | n/a | No | Latent / unresolved |
| 072 | A | No | n/a | No | Unresolved |
| 073 | A | No | n/a | No | Unresolved |
| 074 | A | No | n/a | No | Unresolved |
| 075 | A | No | n/a | No | Design / unresolved |
| 076 | A | No | n/a | No | Unresolved |

---

## Final summary

- **Bugs with a complete local repo fix:** 6 (061, 062, 064, 065, 066, 067)
- **Partial local fix:** 1 (063 — TLS template only)
- **Bugs that are hosting-config (repo overlay/nginx):** 5 (061–065)
- **Still unresolved:** 10 (063 live TLS + 068–076)
- **Tests:** 13 + 2 + 15 = **30 passed, 0 failed** (focused). Full `npm test` and Go tests not run. Live nginx checkout/admin not exercised.
- **Ready for manual review.** Not deployed. Not committed. Dilmune local compose/nginx must be merged, not overwritten. API rebuild is required before 066/067 (and 053–060 if still on `e70f213`) are live.
