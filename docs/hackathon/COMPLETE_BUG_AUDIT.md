# FilsPay complete bug audit — Team CASE ZERO

**Date:** 2026-10-30  
**Branch:** `hackathon/fixes`  
**Repo HEAD:** `3fd9b0e` (BUG-053–060 committed, **not pushed**)  
**Dilmune:** http://167.71.228.113 still serving **`e70f213`** unless redeployed  
**Mode:** audit only — no code changes, no deploy, no load test

This is not a claim that every possible bug was found.

---

## 1. Executive summary

Money-path correctness in the **local** tree is strong: integer fils, FP-300 refunds with locks, unique callbacks/disbursements, SKIP LOCKED, scheme residue, key `revoke_after`, impersonation write gate. **Dilmune does not have 053–060.** Judges hitting the live box can still impersonate-as-support and capture/void/refund.

Highest remaining gaps vs 170 points: (1) live deploy lag, (2) webhook SSRF + unbounded body on a 512 MB API, (3) no checkout load/admission control, (4) public `:3000` and HTTP cookies, (5) admin UI not actually hosted.

---

## 2. Scope and limitations

Inspected via prior inventories plus targeted reads of auth, refunds, capture/void, webhooks, settlement cache/window/payout estimate, reporting consumer, KYC, CORS/cookies, compose/nginx, live HTTP probe (earlier this session). Frozen `packages/money` not re-audited. Full `npm test` not re-run. No Dilmune SSH, no k6, no browser login.

---

## 3. BUG-001–060 verification

| Range | Status | Dilmune |
|---|---|---|
| 001–013, 016–052 | Documented fixed; focused tests recorded; **not re-executed this audit** | On `e70f213` |
| 014, 015 | Not bugs (ADR-0004; MDR recalc already `closed`) | n/a |
| 053–060 | Confirmed in `3fd9b0e` (12 new API tests + prior Go ledger) | **Absent** |

Unverified: live refund UI, live 0079, live impersonation 403.

---

## 4. Newly discovered bugs (BUG-061+)

### BUG-061 — API port 3000 published on 0.0.0.0
- **Severity:** High · **Category:** hosting/security · **Criterion:** hosting 10, security  
- **File:** `ops/docker-compose.yml` 75–76; overlay does not `!override` ports  
- **Root cause:** Base compose binds `3000:3000`; hosted overlay never removes it  
- **Actual:** Live `:3000/healthz` 200 (probed). Bypasses nginx  
- **Expected:** Public HTTP only via nginx `:80`  
- **Status:** Confirmed (code + live)

### BUG-062 — Live nginx/SPA ≠ repo overlay; `/admin` is merchant checkout
- **Severity:** High · **Category:** hosting/UI · **Criterion:** hosting, UI/UX  
- **File:** `ops/nginx.hosted.conf` returns plaintext on `/`; live `/` 302 → `/dashboard/login` with title “FilsPay Checkout”; `/admin` same bundle  
- **Root cause:** Extra undocumented SPA; `apps/admin` not on that origin  
- **Status:** Confirmed live; repo overlay would not reproduce it

### BUG-063 — Session cookies on cleartext HTTP
- **Severity:** High · **Category:** security · **Criterion:** hosting, security  
- **File:** `ops/docker-compose.hosted.yml` 26 `COOKIE_SECURE: ${COOKIE_SECURE:-false}`  
- **Actual:** Live is HTTP; `httpOnly` cookies still interceptable on the path  
- **Expected:** HTTPS + `Secure` or documented HTTP-only demo risk  
- **Status:** Confirmed overlay; TLS **Needs Live Verification** (no cert observed)

### BUG-064 — Compose CPU requests sum 1.05 on a 1 vCPU box
- **Severity:** Medium · **Category:** hosting · **Criterion:** hosting, capacity  
- **File:** `ops/docker-compose.hosted.yml` 15–68 (0.25+0.50+0.15+0.10+0.05)  
- **Status:** Confirmed in repo; live cgroup **Needs Live Verification** (`docker stats`)

### BUG-065 — No admission control on `/v1/`
- **Severity:** High · **Category:** capacity · **Criterion:** capacity 20  
- **File:** `ops/nginx.hosted.conf` (no `limit_req`); Fastify has OTP `429` only  
- **Actual:** Excess authorize/pay → timeouts/5xx, not a clean 429  
- **Status:** Confirmed code; live shed behavior unverified (no load test)

### BUG-066 — Webhook SSRF: private IPs not blocked; `fetch` follows redirects
- **Severity:** Critical · **Category:** security · **Criterion:** correctness/security  
- **Files:** `apps/api/src/webhooks/create.ts` 15–28 (`validateWebhookUrl` — scheme only); `apps/api/src/webhooks/transport.ts` 38–45 (`fetch` default redirects). Comment “create.ts blocks private IPs” is **false**.  
- **Impact:** Merchant-owned URL (or https open-redirect) can hit link-local/metadata or compose DNS (`settlement:8091`)  
- **Expected:** Deny private/link-local/metadata; `redirect: 'manual'`  
- **Status:** Confirmed

### BUG-067 — Unbounded webhook response `text()` on 512 MB API
- **Severity:** High · **Category:** capacity/security  
- **File:** `transport.ts` 46–48. Timeout bounds wait, not body size.  
- **Impact:** Hostile receiver can OOM the API container  
- **Status:** Confirmed

### BUG-068 — OTP promote does not rotate the session token
- **Severity:** High · **Category:** security  
- **File:** `apps/api/src/auth/sessions.ts` 51–61  
- **Actual:** Pending cookie becomes authenticated (session fixation)  
- **Expected:** New token after OTP  
- **Status:** Confirmed; **locked login tests reuse the pending cookie** — cannot fix without new tests + test-helper change policy conflict

### BUG-069 — Reporting poison payload stalls the whole consumer
- **Severity:** High · **Category:** reporting  
- **Files:** `apps/reporting/src/consumer/applyEvent.ts` 22–31, 197–210; `runConsumerPass.ts` 29–33, 59–60  
- **Actual:** Missing `merchantId` throws; entire batch + watermark roll back forever  
- **Expected:** Skip/poison-log one event (locked atomicity test currently **requires** throw)  
- **Status:** Confirmed mechanism; producers normally send `merchantId`

### BUG-070 — `ApplyPayout` no-ops when `merchant_balances` row is missing
- **Severity:** Medium · **Category:** financial cache  
- **File:** `apps/settlement/internal/balances/cache.go` 61–67  
- **Impact:** Dashboard payable stays high after payout (split-child comment). Ledger still correct. YA: split flag unused in prod  
- **Status:** Confirmed code; prod split **Needs Live Verification**

### BUG-071 — `EstimateMonthlyPayout` still accumulates `float32`
- **Severity:** Low · **Category:** financial monitoring  
- **File:** `apps/settlement/internal/settlement/payout_estimate.go` 28–46  
- **Note:** Lifetime path was 056; this helper still drifts above 2^24 fils. No in-repo caller found  
- **Status:** Confirmed latent

### BUG-072 — KYC `Content-Disposition` interpolates `fileName`
- **Severity:** Medium · **Category:** security  
- **File:** `apps/api/src/routes/kyc.ts` 99–100 (thumbnail 117)  
- **Actual:** Client-supplied `file_name` in header — CR/LF / quote injection  
- **Status:** Confirmed

### BUG-073 — KYC bytes written before DB insert
- **Severity:** Low · **Category:** reliability  
- **File:** `apps/api/src/onboarding/kyc.ts` 70–73  
- **Status:** Confirmed (orphan files, not money)

### BUG-074 — Inbound acquirer HMAC has no timestamp window
- **Severity:** Medium · **Category:** security  
- **File:** `apps/api/src/webhooks/inboundVerify.ts` 32, 52–56  
- **Mitigation:** Unique `callback_id` (BUG-049) blocks identical replay  
- **Status:** Confirmed residual

### BUG-075 — `/readyz` is boot-only
- **Severity:** Medium · **Category:** ops (intentional per 2026-05-14)  
- **File:** `apps/api/src/routes/health.ts` 11–26  
- **Impact:** LB will keep a process whose DB is dead  
- **Status:** Confirmed documented design — still a judging “monitoring” miss

### BUG-076 — Capture discount locks transaction by id only
- **Severity:** Low · **Category:** isolation  
- **File:** `apps/api/src/payments/discountAdjustment.ts` 57  
- **Status:** Confirmed; caller always own-merchant after capture

---

## 5. Financial integrity

**Solid on `3fd9b0e`:** refund ceiling = remaining captured; `FOR UPDATE` on refund/capture/void; FP-300 settlement netting; residue journal; unique callback/disbursement; 0078/0079.

**Gaps:** 070 cache vs ledger after payout; 069 stale merchant_daily_volume; 071 monitoring float; Dilmune missing 053–060 (credits/impersonation/refund role still wrong on live).

**Not bugs:** frozen money rounding; CSV in-memory export; capture/void open to merchant `support` sessions (documented UI/API split; impersonation gated in 057 locally).

---

## 6. Security findings

Critical: **066 SSRF**. High: **061, 063, 067, 068**, plus **057/058 still live on Dilmune**. Medium: 072, 074. Dead `v1/routes/transactions.ts` unauthenticated capture is **not registered** (`app.ts` 60–61) — not a live hole.

---

## 7. Hosting and deployment

| Item | Repo | Live |
|---|---|---|
| API 0.5 CPU / 512 MB | Overlay yes | Needs `docker stats` |
| Postgres volume | `filspay_pgdata` | Needs SSH |
| `:3000` public | Yes | **Yes** |
| Nginx = `nginx.hosted.conf` | Plaintext `/` | **No** (SPA) |
| Admin app | Overlay does not serve it | Merchant SPA at `/admin` |
| HTTP | `COOKIE_SECURE` false | **HTTP 200** |
| Restart | `unless-stopped` | Not drilled |

---

## 8. User workflows

| Flow | API (`3fd9b0e`) | Live UI |
|---|---|---|
| Signup / OTP login | Implemented | SPA HTML only; login **not clicked** |
| Admin login | Separate cookie | `/admin` is checkout SPA — **broken workflow** |
| Payment link + checkout | Routes exist | SPA served; pay **unverified** |
| Full/partial refund | Owner/finance + API keys | Drawer exists; live still old API without role gate |
| Settlement | Go daemon | Unverified |
| Impersonation | 055/057 local | Live grant can still write money |
| API key rotate | 053 local | Live old key never expires |

---

## 9. Hidden regression risks (judge-style)

- Concurrent capture+void: row lock present.  
- Duplicate idempotency keys: existing tests.  
- Support impersonation capture: **fails locally, succeeds on Dilmune**.  
- JPEG named `.pdf` KYC: fails locally (060), untested live.  
- Null `merchantId` outbox: reporting halt (069).  
- Huge webhook body: API OOM (067).  
- `seed` on Dilmune: truncates fixtures — do not run.

---

## 10. Tests this audit

None re-run. Reused: 12/12 new API (053–060), 77 locked admin/KYC/refund/txn, Docker Go `./internal/ledger`, live curls (`/healthz` 200, `/readyz` 200, unauth txns 401, `:3000` 200, `:5173` timeout).

---

## 11. Needs live-server verification

SSH: `docker stats`, published ports, nginx conf inside proxy container, `schema_migrations` (0078 vs 0079), `COOKIE_SECURE`, `NODE_ENV`, `CORS_ORIGINS`. Browser: login, pay-link, refund, admin. Restart API and confirm a prior txn. **Do not k6 on the droplet.**

---

## 12. Prioritized fix order (points)

1. Push `3fd9b0e`, migrate **0079**, redeploy API+settlement (correctness 100 — 053–060 live).  
2. Block webhook private/metadata IPs; `redirect: 'manual'`; cap response bytes (066/067).  
3. Unpublish `:3000`; ship `apps/admin`; align nginx with overlay (061/062).  
4. Laptop 3-VU checkout k6 + API restart (capacity 20).  
5. HTTPS or explicit HTTP risk slide (063).  
6. Trim CPU to ≤ 1.00 (064).  
7. Header-safe KYC filename (072).  
8. Do **not** skip reporting poison or rotate OTP token until locked-test policy is waived (068/069).

---

## Summary table (new only)

| Bug ID | Severity | Component | Root Cause | Evidence | Recommended Fix | Status |
|---|---|---|---|---|---|---|
| 061 | High | compose | `3000:3000` not overridden | live `:3000/healthz` | `ports: []` in overlay | Confirmed |
| 062 | High | nginx/UI | Live SPA ≠ overlay; admin missing | `/admin` checkout HTML | Serve `apps/admin`; match nginx | Confirmed live |
| 063 | High | cookies | `COOKIE_SECURE` default false on HTTP | overlay L26; HTTP probe | TLS + Secure | Confirmed |
| 064 | Medium | compose | CPU 1.05 | hosted.yml limits | Trim to ≤1.00 | Confirmed repo |
| 065 | High | nginx/API | No `limit_req` | nginx.hosted.conf | nginx 429 + pool cap | Confirmed |
| 066 | Critical | webhooks | No private-IP deny; fetch redirects | create.ts 15–28; transport.ts 38–45 | Deny RFC1918/link-local; manual redirect | Confirmed |
| 067 | High | webhooks | Unbounded `response.text()` | transport.ts 46–48 | Byte cap | Confirmed |
| 068 | High | auth | Promote keeps token | sessions.ts 51–61 | New token (blocked by locked tests) | Confirmed |
| 069 | High | reporting | Throw on bad payload rolls back pass | applyEvent.ts; runConsumerPass.ts | Skip poison (blocked by lock) | Confirmed |
| 070 | Medium | settlement | UPDATE 0 rows | cache.go 61–67 | Upsert like close | Confirmed |
| 071 | Low | settlement | float32 monthly sum | payout_estimate.go 28–46 | int64 | Confirmed latent |
| 072 | Medium | KYC | Filename in header | kyc.ts 99–100 | RFC 5987 / strip CR | Confirmed |
| 073 | Low | KYC | writeFile before INSERT | kyc.ts 70–73 | Insert then write | Confirmed |
| 074 | Medium | callbacks | No HMAC timestamp skew | inboundVerify.ts 32 | Reject stale `t=` | Confirmed |
| 075 | Medium | health | `/readyz` boot-only | health.ts 11–26 | Doc as design or recheck DB | Confirmed |
| 076 | Low | capture | Discount lock omits merchant_id | discountAdjustment.ts 57 | Add merchant predicate | Confirmed |

### Totals

| | Count |
|---|---|
| Critical (new) | 1 (066) |
| High (new) | 7 (061–063, 065, 067–069) |
| Medium (new) | 5 (064, 070, 072, 074, 075) |
| Low (new) | 3 (071, 073, 076) |
| Confirmed new | 16 |
| Suspected / live-only | 064 cgroups, 070 splits in prod, TLS |
| Previously fixed (001–060 minus 014/015) | 58 |
| Not a bug (014, 015) | 2 |
| Unverified on Dilmune | All 053–060 + live money UI |

**Do not push/deploy/load-test without approval.**
