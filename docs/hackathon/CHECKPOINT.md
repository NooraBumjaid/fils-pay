# The Handover — checkpoint

**Branch:** `hackathon/fixes`  
**Date:** 2026-10-30  
**Database:** local Compose Postgres 16 (`filspay` / `localhost:5432`)  
**Do not push.** This file is the judge-facing status of the local branch.

## 1. Confirmed bugs fixed

Inventory: `docs/hackathon/BUG_INVENTORY.md`. Headline items:

| Severity | IDs |
|---|---|
| Critical | BUG-004, 010, 019, 022, 030–034, 043–045 |
| High | BUG-001–003, 005–009, 012–013, 016–018, 020–021, 023–027, 029, 035–036, 039–042, 046–048 |
| Medium | BUG-028 |
| Not a bug / not reproduced | BUG-014 (ADR-0004), BUG-015 (query already `closed` only) |
| Needs review | BUG-011 (locked test still expects 245 bps) |

BUG-001 (`ce9cbab`) and BUG-002/003 (`0b9992a`) unblocked migrations through 0077.

## 2. Tests passed / failed (this checkpoint)

Host: Windows, Node v24.19.0, `DATABASE_URL` → local Compose Postgres.  
`go` is **not** on PATH. Settlement Go tests are **PENDING**.

### Focused FP-300 / readiness run (2026-10-30)

Command: `npx tsx --test --test-concurrency=1` on refund, payment-link, session, config, health, and March-script files.

| Result | Count |
|---|---|
| Pass | 63 |
| Fail | 0 |

Includes: full and partial refunds, ledger-balanced fee reversal, idempotent replay, 402/502 acquirer paths, captured-amount ceiling, cross-merchant 404, cumulative 12+13 fils fee split, expired payment-link 410, merchant-scoped cancel, reservation-timeout replay, crash recovery with a new client key after lease expiry, OTP session lookup, `/healthz` / `/readyz`, production acquirer-signature default.

`npm run migrate` applied `0076` and `0077` on the local database (69 already up to date).

### Known remaining suite noise (not re-run in full)

Earlier full `npm test` (pre-0077, 2026-10-30): API 366/376 pass; reporting 8/12 pass. Remaining classes:

- Locked CSV tests still assert 2-decimal cents (`4.75` → 475) after the architecture-correct `parseBhdToFils` fix (BUG-010).
- Reporting consumer fails closed when a leftover outbox row lacks `merchantId` (test pollution + poison-pill fixture).
- Webhook backoff test is flaky (`backoffDelayMs` jitter vs exact `1000`).

## 3. FP-300 status

**Complete enough to ship on this branch.**

- `POST /v1/refunds` is wired (no 501).
- Idempotency-Key required; merchant-scoped lookup; captured-amount cap.
- Advisory lock + `FOR UPDATE` across acquirer + journal.
- Reason defaults to `unspecified` (constraint `chk_refunds_reason_not_null`).
- `refund.succeeded` webhook + reporting rollup + settlement refund columns.
- Negative payable carries into later payouts (BUG-043).
- Partial refunds reverse the capture fee cumulatively (BUG-047 / `ceae017`).
- Merchant dashboard `RefundDrawer` posts `/v1/refunds` with an idempotency key.

## 4. Remaining critical blockers

1. **Go toolchain missing** on this Windows host — settlement tests not executed here. Go fixes are in tree (`90d4e06` and later settlement commits).
2. **BUG-011 locked test** still expects 245 bps if someone reverts the display query.
3. **Reporting shared-DB poison pills** can stall `merchant_daily_volume` inserts when `merchantId` is missing. Production capture payloads include `merchantId`.
4. **Hosted TLS**: keep `COOKIE_SECURE=false` on HTTP Dilmune or merchant cookies will not stick.
5. Do not run `seed` against any database you need to keep (it truncates fixture tables).

## 5. Deployment

Instructions: `docs/hackathon/DILMUNE_DEPLOY.md`.  
Overlay: `ops/docker-compose.hosted.yml` (1 vCPU / 2 GB split, API 0.5 / 512 MB).

## 6. Git commit recommended for deployment

After the local commits in this checkpoint, deploy **HEAD of `hackathon/fixes`**.

If those commits have not been created yet, the last already-committed SHA that contains FP-300 + cumulative fees is:

`ceae017` — `fix(refunds): allocate fee reversals cumulatively`

Do not deploy origin until the local commits (payment-link 0077, March sweep guard, hosted overlay, docs) are included.

Nothing has been pushed.
