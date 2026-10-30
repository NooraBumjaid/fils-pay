# Team CASE ZERO — judging readiness

**Date:** 2026-10-30  
**Branch:** `hackathon/fixes`  
**Claimed deploy:** `e70f213caa304348869d48d28fab31334d5c5213` at http://167.71.228.113  
**Local HEAD:** same SHA; **working tree dirty** (BUG-053–060 not on Dilmune)  
**Do not push / redeploy without approval.**

Live probe (2026-10-30): `/healthz` 200 `ok` (~67 min uptime), `/readyz` 200 `ready`, unauth `GET/POST /v1/transactions` 401, nginx/1.27.5. `:5173`/`:5174` timeout. `:3000/healthz` 200 (API published besides nginx). `/` 302 → `/dashboard/login` (merchant SPA HTML). `/admin` serves the **same merchant checkout SPA**, not `apps/admin`.

---

## 1. Correctness (100)

### Verified and completed
- Bootstrap, fils (1 BD = 1000), FP-300 refunds, payment-link expiry, OTP live_sessions, callbacks, SKIP LOCKED, scheme residue, fee `effective_from` — in **deployed** `e70f213`. Inventory BUG-001–052 except 014/015 (not bugs).
- Written findings: `BUG_INVENTORY.md`, BUG-*.md, `REQUIREMENTS_TRACEABILITY.md`, `FP300_VERIFICATION.md`, `AUDIT_REPORT.md`.
- Focused tests already recorded: uniqueness/fee 14/14; refunds 25/25; Docker Go `-short ./...` ok; auditor-round 8/8 + 77 locked admin/KYC/refund/txn.

### Implemented but not verified
- BUG-053–060 exist **only locally** (key `revoke_after`, credits finance-only, disabled-admin grants, BIGINT lifetime estimate, impersonation write gate, refund owner/finance, rebuild lock, KYC PDF magic). Dilmune still has support impersonation capture/void/refund.

### Missing or at risk
- Full `npm test` never green this branch (CSV cents lock, reporting poison-pill, dispatcher jitter `935 !== 1000`).
- No hidden-regression run against the live box (forbidden to hit hosted DB with the suite).
- Official `FP-300.pdf` missing; spec = briefing reverse + ONBOARDING FP-212.
- Live UI refund/checkout money path unproven in a browser.

### Evidence
BUG-001–052 docs + tests on `e70f213`. BUG-053–060 docs + new tests **uncommitted**. Live health/401 only.

### Exact next action
1. Commit BUG-053–060 (exclude `ops/docker-compose.audit.yml`).  
2. Approve push + Dilmune migrate `0079` + redeploy.  
3. One checkout→capture→refund demo on the live SPA with a seed merchant.

---

## 2. Capacity (20)

### Verified and completed
- Historical k6 write-up: `docs/perf/fp-209-loadtest-2026-09.md` (list/export/summary on 0.5 CPU / 512 MB; peak RSS 236 MB; 0 errors). Not a checkout scenario; raw JSON `scripts/out/…` **absent**; no k6 script in repo.

### Implemented but not verified
- Compose `restart: unless-stopped`; Postgres volume `filspay_pgdata`. Restart recovery **not** demonstrated on Dilmune.
- OTP `429` only. No global admission control on `/v1/` (nginx has no `limit_req`). Excess authorize/pay traffic is not rejected safely.

### Missing or at risk
- No live checkout benchmark. No supported-user estimate from **this** deploy. Running k6 on the 1 vCPU box would steal the API’s 0.5 CPU.

### Evidence
FP-209 markdown only. Live `uptimeSeconds` ~4000 (process alive, not a load result).

### Exact next action — controlled benchmark (laptop → Dilmune, abort early)
Do **not** run this without approval. Cap: 60s, **3 VUs**, think 1s, from a laptop (not on the Droplet).

| Step | Detail |
|---|---|
| Scenario | Public pay-link GET + POST pay (simulated PAN) **or** `POST /v1/transactions` + capture if a test API key exists |
| Thresholds | p95 pay < 2s; http_req_failed < 1%; abort if 5xx appears |
| Watch | SSH `docker stats` API RSS; stop if RSS > 400 MB (limit 512, heap cap 384) |
| Reject-excess | After baseline, 15 VUs for 20s; record whether Fastify/nginx shed with 429/502 vs 5xx/timeouts (expect: **no 429 today**) |
| Recover | `docker compose restart api` (or reboot API only); confirm `/healthz`, `/readyz`, a prior transaction still in DB |
| Estimate | `successful_pays_per_min / 3 VUs` × headroom to 80% p95 budget = rough concurrent checkouts on 0.5 CPU |

Do not seed, do not export CSV under load, do not start a second k6 on the box.

---

## 3. Hosting architecture (10)

### Verified and completed
- Overlay `ops/docker-compose.hosted.yml`: API **0.50 CPU / 512 MB** (`NODE_OPTIONS=--max-old-space-size=384`, `SHARP_CACHE=0`); postgres 0.25/384m + `shared_buffers=64MB`; settlement 0.15/256m; reporting 0.10/192m; nginx 0.05/32m. Sum RAM 1376 MB < 2 GB.
- Secrets required in overlay (`SETTLEMENT_INTERNAL_TOKEN`, webhook key, callback signing secret). Postgres bind in base compose: `127.0.0.1:5432`.
- Live `/healthz` + `/readyz` through nginx. Volume `filspay_pgdata` for persistence.

### Implemented but not verified
- Live nginx **does not match** `ops/nginx.hosted.conf` (repo returns plaintext on `/`; live 302 to `/dashboard/login` + static `/assets/…`). Reproducible from repo alone is incomplete.
- Restart/data-loss: volume is declared; no restart drill.

### Missing or at risk
- CPU requests sum **1.05** on a 1 vCPU host (overcommit).
- API port **3000 published publicly** (`ops/docker-compose.yml` `3000:3000`; overlay does not remove it). Confirmed live.
- HTTP only; `COOKIE_SECURE=false` by default.
- Hosted overlay does not build/serve web or admin; live SPA is an extra, undocumented step.

### Evidence
`docker-compose.hosted.yml`, `DILMUNE_DEPLOY.md`, live curls above.

### Exact next action
Unpublish `:3000` in the hosted overlay (`ports: []` or `!override` empty). Align nginx with the SPA actually deployed. Keep TLS off until a cert exists; document COOKIE_SECURE. Optional: trim settlement/reporting CPU so the sum ≤ 1.00.

---

## 4. AI usage and setup (10)

### Verified and completed
- Repo AI setup: `.cursorrules`, `AGENTS.md`, `CLAUDE.md` (frozen `packages/money`, tests locked, fils, settlement UTC).
- Real session: [FilsPay handover work](f146f867-ad4d-47ae-bfd1-75b90ff4dbde) (Cursor agent transcript).

### Implemented but not verified
- Three excerpts **not yet pasted into a judging packet**. Do not fabricate.

### Missing or at risk
- No annotated excerpt file for judges.

### Evidence — use these three (verification of AI, not cheerleading)

1. **Locked rotation test vetoed a wrong revoke.** AI set `revoked_reason = 'rotated'`; locked test required `null`. Fix kept 24h `revoke_after` only (`apiKeys.ts` / BUG-053). Shows tests as the authority.
2. **Finance memo 225 vs locked 245.** Display query `ORDER BY effective_from DESC`; assertion updated to 225 with a documented exception (BUG-011). Shows docs/ADR over a stale lock when they conflict — call this out honestly.
3. **SKIP LOCKED leftover `dueResult.rows.length`.** After the claim-lease refactor, compile/runtime still referenced the old result; tests/build caught it; switched to `dueRows.length` (BUG-050). Shows AI output was not trusted until it ran.

### Exact next action
Copy those three turns (prompt + failing test output + corrected diff) into `docs/hackathon/AI_EXCERPTS.md` with screenshots from Cursor. 30 minutes.

---

## 5. UI/UX (10)

### Verified and completed
- Checkout, dashboard, admin **source** exists (`CheckoutPage.tsx`, merchant dashboard, `apps/admin`). RefundDrawer owner/finance. Live merchant SPA HTML at `/dashboard/login` with hashed assets.

### Implemented but not verified
- No login, pay, or admin click-through. No before/after screenshots in the repo.

### Missing or at risk
- `/admin` is the merchant SPA title “FilsPay Checkout” — **admin console likely not deployed**.
- Vite ports 5173/5174 closed. Overlay does not host UIs.
- No visual evidence pack.

### Evidence
HTML 200 on `/dashboard/login`; timeout on :5173/:5174.

### Exact next action
Serve `apps/admin` dist on `/admin/` (or :5174). Record four screenshots: checkout pay, merchant txn list, admin credit, healthz. Same merchant, before (501 refund / broken login if you have old clips) vs after.

---

## 6. Technical defence (20)

### Verified and completed
- Technical story is in ARCHITECTURE, ADRs, inventory, FP-300 verification, this file.

### Implemented but not verified
- No slide deck. No rehearsed live demo script.

### Missing or at risk
- Judges will ask why Dilmune ≠ dirty tree; why `/readyz` is boot-only; why capture/void have no role gate for merchant support (documented exception; impersonation is the real hole and is **unshipped**).

### Evidence
Docs listed above.

### Exact next action — 8 slides
1. Problem: handover, 1 BD = 1000 fils, FP-300 missing PDF.  
2. Money path: authorize → capture → refund → CloseBatch + residue.  
3. Bugs that moved fils (010, 032–034, 043, 047, 052) with test names.  
4. Security: OTP `live_sessions`, callback HMAC, SKIP LOCKED, impersonation (local-only).  
5. Hosting diagram + limits table + live healthz.  
6. Capacity: FP-209 numbers + proposed 3-VU checkout (not yet run).  
7. Demo: pay link → dashboard refund → admin.  
8. What we would not touch (`packages/money`) and residual risk (uncommitted 053–060, no live load, admin SPA).

---

## Remaining work ranked by points at risk

| Rank | Item | Points | Severity | Why |
|---|---|---|---|---|
| 1 | Ship + demo money path on Dilmune (commit 053–060, migrate 0079, refund in UI) | ~Correctness 100 | Critical | Judges test live; impersonation write still open on `e70f213` |
| 2 | Checkout load + restart drill (laptop k6, 3 VU, then API restart) | 20 | High | Criterion 2 is almost empty for **this** box |
| 3 | Slide deck + live demo script | 20 | High | Defence slot is otherwise docs-only |
| 4 | Admin SPA + screenshot pack | 10 | High | `/admin` is the merchant bundle |
| 5 | AI excerpt packet | 10 | Med | Files exist; packet does not |
| 6 | Unpublish :3000; nginx = overlay; CPU ≤ 1.00 | 10 | Med | Limits exist; live surface does not match overlay |
| 7 | Full `npm test` narrative (known locked fails) | Correctness | Low | Do not “fix” locked CSV/reporting tests |

---

## Findings table (high-severity, still live on Dilmune)

| Bug | Root cause | Fix (local) | Tests | Files | On `e70f213`? |
|---|---|---|---|---|---|
| BUG-057 impersonation capture/void/refund | Writer actor mapped grants to `merchant_session`; no role on those routes | Reject non-owner impersonation | `impersonation.write.new.test.ts` 8/8 round | `requireMerchantAuth.ts` | **No** |
| BUG-058 support POST /v1/refunds | UI gate only | `requireMerchantRole(owner, finance)` | `refunds.support.new.test.ts` | `refunds.ts` | **No** |
| BUG-053 old API key never expires | Rotate did not set `revoke_after` | 24h overlap + verify predicate | `apiKeys.rotate.new.test.ts` | `apiKeys.ts`, `verify.ts` | **No** |
| BUG-054 support posts credits | Create route any admin | finance/super_admin hook | `credits.supportCreate.new.test.ts` | `adminCredits.ts` | **No** |
| BUG-059 rebuild clobber | No lock vs CloseBatch increment | `LOCK TABLE merchant_balances` | `rebuild_lock_test.go` | `rebuild.go`, `refresh.go` | **No** |
| BUG-004 unsigned callbacks | Prod default off | Signing required in hosted env | config tests (prior) | hosted env + config | Env-dependent |

Shipped on Dilmune (`e70f213`): BUG-001–052 as inventoried (014/015 not bugs), including FP-300 API, 0078 uniqueness, SKIP LOCKED, residue, fee 225.

---

## Do not do without approval
Push, Dilmune redeploy, `seed`, destructive k6, DB reset, production compose edits on the Droplet.
