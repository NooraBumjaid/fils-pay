# FilsPay bug inventory — The Handover

Verified against code and tests. Case files were leads, not proof.

| ID | Title | Severity | Component | Status | Case file |
|---|---|---|---|---|---|
| BUG-001 | `0054_views.sql` references nonexistent `settlement_batch_events` | High | db | FIXED (`ce9cbab`) | bootstrap |
| BUG-002 | `0055` inserts `code`/`account_type` into chart of accounts | High | db | FIXED (`0b9992a`) | bootstrap |
| BUG-003 | Refund summary joins `transactions.id = refunds.id` | High | db | FIXED (`0b9992a`) | reporting |
| BUG-004 | Unsigned acquirer callbacks accepted in production by default | Critical | api/config | FIXED | security |
| BUG-005 | Compose Dockerfiles missing | High | ops | FIXED | deploy |
| BUG-006 | Postgres published on all interfaces | High | ops | FIXED | security |
| BUG-007 | Compose did not load `ops/.env.docker` | High | ops | FIXED | deploy |
| BUG-008 | Dev webhook encryption key wrong length | High | api/config | FIXED | deploy |
| BUG-009 | Compose used committed DB password | High | ops | FIXED | security |
| BUG-010 | CSV import treated BHD as 2-decimal cents | Critical | admin CSV | FIXED (new end-to-end test; legacy assertions still encode cents) | finance memo; details in BUG-010.md |
| BUG-011 | Dashboard fee uses `created_at` not `effective_from` (245 vs 225) | High | fees | FIXED (display query + locked assertion now 225; finance memo) | finance memo |
| BUG-012 | Split payouts drop remainder fils | High | settlement/splits | FIXED (Go split tests passed) | finance memo |
| BUG-013 | Scheme `amount` stored untruncated (always over) | High | scheme export | FIXED (`90d4e06`) | finance memo; details in BUG-038.md |
| BUG-014 | Admin balance rebuild reads scheme lines not ledger | High | ledger/refresh | NOT A BUG (admin refresh intentionally reflects settled scheme data; ADR-0004; CLI ledger rebuild is separate) | FP-203 |
| BUG-015 | MDR recalc rewrites paid batches | High | recalculate_mdr | NOT REPRODUCED (current query selects only `closed`) | finance memo |
| BUG-016 | Daemon uses UTC date so close is ~03:00 Bahrain | High | scheduler | FIXED (scheduler tests passed) | finance memo |
| BUG-017 | March sweep posts again on rerun | High | scripts | FIXED (skip when the finance description already exists) | finance memo |
| BUG-018 | Admin tool clears `test_mode` | High | merchantFlags | FIXED (unit regression passed) | finance memo |
| BUG-019 | Expired payment links payable via `submittedAt` | Critical | payment links | FIXED (route regression passed) | FP-187 |
| BUG-020 | Cancel payment link not scoped to merchant | High | payment links | FIXED (details in BUG-040.md) | finance memo |
| BUG-021 | Login OTP bound to first matching email across merchants | High | auth | FIXED (details in BUG-041.md) | OTP |
| BUG-022 | `live_sessions` includes pending (pre-OTP) sessions | Critical | auth/db | FIXED (0074 view verified) | “login without OTP” |
| BUG-023 | Webhook signs canonical JSON, sends `JSON.stringify` | High | webhooks | FIXED (signed delivery regression passed) | FP-240 |
| BUG-024 | Duplicate `settlement.paid` (no unique, two scanners) | High | payout notify | FIXED (details in BUG-042.md) | 2026-08-21 |
| BUG-025 | `NetPayableFils` used float32 | High | settlement | FIXED (`90d4e06`) | money; details in BUG-037.md |
| BUG-026 | Refund 501 stub; refundable used authorized not captured | High | refunds | FIXED (`90d4e06`, FP-300) | FP-209 / FP-300; details in BUG-030.md / BUG-032.md |
| BUG-027 | Concurrent refunds overspend remaining captured | High | refunds | FIXED (`90d4e06`) | FP-209; details in BUG-033.md |
| BUG-028 | Promotional discount parser uses `* 100` | Medium | discountAdjustment | FIXED (discount integration suite passed) | finance memo |
| BUG-029 | Payment-link finalize miss returned 200 after capture | High | payment links | FIXED | 2026-05-14 |
| BUG-030 | Refund API stub lacked merchant route validation and UI wiring | Critical | refunds | FIXED (`90d4e06`) | FP-300; details in BUG-030.md |
| BUG-031 | Refund transaction lookup omitted merchant ownership | Critical | refunds | FIXED (`90d4e06`) | FP-300; details in BUG-031.md |
| BUG-032 | Refund ceiling used authorized amount instead of captured amount | Critical | refunds | FIXED (`90d4e06`) | FP-300; details in BUG-032.md |
| BUG-033 | Different idempotency keys could concurrently over-refund one capture | Critical | refunds | FIXED (`90d4e06`) | FP-300; details in BUG-033.md |
| BUG-034 | Successful refunds were omitted from settlement batches | Critical | settlement | FIXED (`90d4e06`) | FP-300; details in BUG-034.md |
| BUG-035 | Refund success events were not eligible for webhook delivery | High | webhooks | FIXED (`90d4e06`) | FP-300; details in BUG-035.md |
| BUG-036 | Refund reporting schema and Bahrain-day rollup were incomplete | High | reporting | FIXED (`90d4e06`) | FP-300; details in BUG-036.md |
| BUG-039 | Node service image could not install dependencies | High | operations | FIXED | deployment build; details in BUG-039.md |
| BUG-040 | Payment-link cancellation was not merchant-scoped | High | payment links | FIXED (verified) | BUG-020 |
| BUG-041 | Login OTP could target a different merchant account sharing the email | High | auth | FIXED (verified) | BUG-021 |
| BUG-042 | Concurrent notification scans could race on `settlement.paid` | High | settlement | FIXED (verified) | BUG-024 |
| BUG-043 | Refund-created negative payable was not carried into later payouts | Critical | settlement/refunds | FIXED (focused DB regression passed) | FP-300; details in BUG-043.md |
| BUG-044 | Merchant/admin OTP guess limits were bypassable under concurrency and resend | Critical | authentication | FIXED (parallel route regressions passed) | details in BUG-044.md |
| BUG-045 | Settlement repriced captures using the later platform volume tier | Critical | payments/settlement | FIXED (focused DB regression passed) | details in BUG-045.md |
| BUG-046 | int4 volume counter overflow revoked the earned platform tier | High | settlement/pricing | FIXED (saturation, recovery migration, DB regressions passed) | details in BUG-046.md |
| BUG-047 | Independently rounded partial refunds could leave capture fee unreversed | High | refunds/accounting | FIXED (cumulative fee allocation regression passed) | FP-300; details in BUG-047.md |
| BUG-048 | Stale payment-link reservation recovery could charge twice | High | payment links | FIXED (0077 attempt key + reservation lease) | 2026-05-14 |
| BUG-049 | Redelivered acquirer `callback_id` inserted duplicate notes | High | acquirer callbacks | FIXED (`0078` unique + `ON CONFLICT`; replay tests passed) | FP-201 |
| BUG-050 | Webhook dispatcher selected due rows without `SKIP LOCKED` | High | webhooks | FIXED (claim lease + overlapping-pass test passed) | staging 2 replicas |
| BUG-051 | Duplicate `settlement_payout_disbursements` per batch | High | payout rail | FIXED (`0078` unique + concurrent insert test passed) | 2026-08-21 |
| BUG-052 | CloseBatch omitted ADR-0002 scheme residue journal | High | settlement/ledger | FIXED (Docker Go residue tests passed) | ADR-0002; finance memo |

## Not a bug / left unchanged

| Item | Why |
|---|---|
| `packages/money` rounding | Frozen; matches acquirer vectors |
| `POST /v1/refunds` 501 originally | Intentional stub; completing it is FP-300 |
| `BusinessDayWindow` calendar-date extraction | Tests treat input as a calendar date; daemon was the UTC bug |
| `Math.random` for OTP/slugs | Documented; uniqueness is a DB constraint |
| CSV export loading all rows | Documented; date filter bounds size |

## Suspected / not fully verified this pass

| Item | Notes |
|---|---|
| Lifetime payout `REAL` column | Drift possible; monitoring only, not payout math |
| Reporting `merchant_id` null | Consumer fails closed on malformed outbox payloads; producers send merchantId |
| Key rotation UX | Rotate does not revoke the previous API key (tests lock overlap) |
| Large export DoS | Date-range filter exists; full result is loaded in memory by design |

## FP-300

Official `FP-300.pdf` is still missing. The briefing-card reverse plus ONBOARDING FP-212 are the spec. See `FP300_VERIFICATION.md`. Focused API refund tests this pass: **25 pass / 0 fail**. Docker Go CloseBatch refund netting passed. UI and Dilmune hosting remain unverified.
