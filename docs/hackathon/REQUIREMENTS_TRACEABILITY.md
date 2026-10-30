# Requirements traceability — The Handover

**Branch:** `hackathon/fixes`  
**Date:** 2026-10-30  
**Fallback deploy SHA:** `7a84622`  
**Official FP-300.pdf:** **missing from the repository and attachments.** Acceptance criteria below are taken from the briefing-card reverse, `docs/ONBOARDING.md` (FP-212), `docs/HANDOVER.md`, and ADRs. Do not treat this file as a substitute for a missing product spec.

Statuses: `VERIFIED FIXED` requires a passing test recorded here. `IMPLEMENTED BUT UNVERIFIED` means code exists without a test run this pass. `OPEN`, `BLOCKED`, `NOT APPLICABLE`.

| ID | Source | Expected behavior | Code | Status | Bug / gap | Fix | Test | Result |
|---|---|---|---|---|---|---|---|---|
| REQ-MONEY-1 | Briefing front; ADR-0001; ARCHITECTURE | 1 BD = 1000 fils; integer fils only | `packages/money`, Go `internal/money` | NOT APPLICABLE | Frozen packages; not modified | None | `@filspay/money` suite (prior) | Prior pass; packages frozen |
| REQ-MONEY-2 | Finance memo; ADR-0001 | CSV `4.75` BD → 4750 fils, not 475 | `apps/api/src/admin/adjustmentImport.ts` | IMPLEMENTED BUT UNVERIFIED | BUG-010: locked tests still assert 475 | `parseBhdToFils` (`d897251`) | `adjustmentImport.fils.integration.test.ts`; locked `adjustmentImport.test.ts` | New tests passed earlier; locked cents assertions remain incompatible |
| REQ-FEE-1 | Finance memo | Dashboard current rate is 225 bps (effective now), not backfilled 245 | `apps/api/src/fees/currentFeeScheduleDisplay.ts` | VERIFIED FIXED | BUG-011 | Order by `effective_from DESC, created_at DESC` | `currentFeeScheduleDisplay.test.ts` backfill case | Pass: `mdrBps === 225` |
| REQ-SCHEME-1 | Finance memo “always over”; ADR-0002 | Export truncates to 10 fils | `TruncateToSchemeAmount` | VERIFIED FIXED | BUG-013 | Truncate at insert | `TestCloseBatch_SchemeExportLineTruncation` | Pass (Docker Go) |
| REQ-SCHEME-2 | ADR-0002; HANDOVER “nothing posts residue” | Per-line residue: credit `card_scheme_clearing`, debit `scheme_rounding_residue` | `apps/settlement/internal/settlement/batch.go` | VERIFIED FIXED | BUG-052 | Journal gap when `gross - truncated > 0` | `TestCloseBatch_JournalsSchemeLineResidue` | Pass (Docker Go): 4747 → 7 fils |
| REQ-SCHEME-3 | Finance memo March sweep | Rerun must not double-post | `scripts/reconcile_march.ts` | VERIFIED FIXED | BUG-017 | Skip existing finance description | `scripts/*.test.ts` (prior checkpoint) | Prior pass; not re-run this batch |
| REQ-SPLIT-1 | Finance memo; incident note | Child payouts sum to parent | `apps/settlement/internal/splits` | VERIFIED FIXED | BUG-012 | Last-child remainder | `go test ./internal/splits` | Pass (Docker Go `-short`) |
| REQ-BAL-1 | Finance memo; FP-203 | Admin rebuild must not smash payable to scheme totals | `apps/settlement/internal/ledger/refresh.go` | NOT APPLICABLE | BUG-014: ADR-0004, admin refresh is scheme-based by design; CLI rebuild is ledger | None | — | Left unchanged |
| REQ-MDR-1 | Finance memo | Paid batches must not be repriced | `recalculate_mdr.go` | NOT APPLICABLE | BUG-015: query already selects `closed` only | None | — | Not reproduced |
| REQ-SCHED-1 | Finance memo “3am local”; ARCHITECTURE Bahrain midnight | Daemon close uses Bahrain business day | `apps/settlement/internal/scheduler` | VERIFIED FIXED | BUG-016 | Scheduler tests | `go test ./internal/scheduler` | Pass (Docker Go `-short`) |
| REQ-TESTM-1 | Finance memo | Test merchants must not enter live settlement | `merchantFlags` / CloseBatch eligibility | VERIFIED FIXED | BUG-018 | Unit regression (prior) | Prior | Prior pass |
| REQ-PL-1 | Incident FP-187 | Expired payment links not payable | payment-link pay route | VERIFIED FIXED | BUG-019 | Server `now()` | pay expiry new test (prior) | Prior pass |
| REQ-PL-2 | Finance memo | Cancel scoped to merchant | payment-link cancel | VERIFIED FIXED | BUG-020 / 040 | Merchant WHERE | Prior | Prior pass |
| REQ-PL-3 | Incident 2026-05-14 | Two buyers cannot both charge one link | payment-link reservation | VERIFIED FIXED | BUG-048 | Attempt key + lease (`0077`) | Prior | Prior pass |
| REQ-OTP-1 | Finance memo; incident note | Login requires OTP | `0074_live_sessions_authenticated.sql` | VERIFIED FIXED | BUG-022 | View filter | Prior | Prior pass |
| REQ-OTP-2 | Incident note | OTP bound to merchant, not first email | login OTP lookup | VERIFIED FIXED | BUG-021 / 041 | Scoped lookup | Prior | Prior pass |
| REQ-OTP-3 | Incident note | Guess limits not bypassable | OTP attempt counters | VERIFIED FIXED | BUG-044 | Serialized limits | Prior | Prior pass |
| REQ-WH-1 | Incident FP-240 | Sign the bytes sent | `dispatcher.ts` + `canonicalJson` | VERIFIED FIXED | BUG-023 | Canonical body | `dispatcher.test.ts` refund envelope | Pass this pass (8/9; backoff flake unrelated) |
| REQ-CB-1 | Incident FP-201 | Redelivered `callback_id` is one note | `callbacks.ts` + `0078` | VERIFIED FIXED | BUG-049 | Unique index + `ON CONFLICT DO NOTHING` | `callbacks.replay.new.test.ts` | Pass 2/2 |
| REQ-PAYOUT-1 | Incident 2026-08-21 | One payout-rail row per batch | `payoutDisbursement.ts` + `0078` | VERIFIED FIXED | BUG-051 | Unique index + `ON CONFLICT` | `payoutDisbursement.dup.new.test.ts` | Pass 2/2 |
| REQ-PAYOUT-2 | Incident 2026-08-21 | One `settlement.paid` outbox event | `0075` + notify claim | VERIFIED FIXED | BUG-024 / 042 | Unique + claim | Prior | Prior pass |
| REQ-WH-2 | `apps/api/src/index.ts` comment; staging 2 replicas | Dispatcher claim uses `SKIP LOCKED` | `dispatcher.ts` `claimDueDeliveries` | VERIFIED FIXED | BUG-050 | `FOR UPDATE SKIP LOCKED` + 2 min lease | `dispatcher.skipLocked.new.test.ts` | Pass 1/1 |
| REQ-VOL-1 | Finance memo lifetime drift | int4 volume must not wrap | `0076` + saturate | VERIFIED FIXED | BUG-046 | Saturation | Prior DB regression | Prior pass |
| REQ-TIER-1 | Capture vs close | Settlement fee is capture-time, not later tier | `batch.go` | VERIFIED FIXED | BUG-045 | Capture-time fee metadata | Prior + Go close tests | Pass (Docker Go) |
| REQ-SEC-1 | Briefing audit | Unsigned acquirer callbacks not default-open in prod | config | VERIFIED FIXED | BUG-004 | Production default | Prior health/config tests | Prior pass |
| REQ-OPS-1 | Briefing host Dilmune | One server, 1 vCPU / 2 GB, API 0.5 / 512 MB | `ops/docker-compose.hosted.yml` | IMPLEMENTED BUT UNVERIFIED | Hosted overlay exists | `7a84622` | Not deployed this pass | Not run against Dilmune |
| REQ-BOOT-1 | Repo migrate | Fresh DB applies all migrations | `0054`, `0055`, through `0078` | VERIFIED FIXED | BUG-001 / 002 | View + chart columns | `npm run migrate` | Applied `0078`; 71 already up to date |
| REQ-FP300-1 | Briefing reverse; ONBOARDING FP-212 | Full refund via API | `POST /v1/refunds` | VERIFIED FIXED | BUG-026 / 030 | Wired route | `initiateMerchantRefund.test.ts` | Pass |
| REQ-FP300-2 | Same | Partial refunds + excess rejected | refund validation + route | VERIFIED FIXED | BUG-032 | Captured ceiling | `POST /v1/refunds supports partial refunds and rejects excess retries` | Pass |
| REQ-FP300-3 | Same; Huda recon | Ledger balanced, fee reversed | `processRefund.ts` | VERIFIED FIXED | BUG-047 | Cumulative fee allocation | `processRefund.cumulativeFee.test.ts` | Pass |
| REQ-FP300-4 | Same | Concurrent refunds cannot overspend | advisory lock | VERIFIED FIXED | BUG-027 / 033 | `pg_advisory_lock` | `different idempotency keys cannot concurrently refund beyond the captured balance` | Pass |
| REQ-FP300-5 | Same | Merchant isolation | scoped lookup | VERIFIED FIXED | BUG-031 | Merchant WHERE | `a merchant cannot refund another merchant's transaction by UUID` | Pass |
| REQ-FP300-6 | Same | Webhook `refund.succeeded` | dispatcher allowlist + envelope | VERIFIED FIXED | BUG-035 | Added type | `dispatcher.test.ts` refund envelope | Pass |
| REQ-FP300-7 | Same | Settlement deducts refunds | CloseBatch refund claim | VERIFIED FIXED | BUG-034 / 043 | Refund IDs in batch | `TestCloseBatch_NetsSuccessfulRefundsIntoNextPayout` | Pass (Docker Go `-short`) |
| REQ-FP300-8 | Same | Reporting rollup | reporting consumer | VERIFIED FIXED | BUG-036 | `0073` + consumer | `applyEvent.test.ts` (prior) | Prior pass; not re-run this batch |
| REQ-FP300-9 | Same | Timeline / UI | `RefundDrawer.tsx` | IMPLEMENTED BUT UNVERIFIED | Drawer posts `/v1/refunds` with idempotency key | Wired in `TransactionDetailPage` | No browser run this pass | UI not exercised in a browser |
| REQ-FP300-10 | Briefing reverse | Hosted on Dilmune | overlay only | BLOCKED | Needs user approval to push/deploy | Overlay in `7a84622` | — | Not deployed |
| REQ-IDOR-1 | Incident “admin role checks” | Admin roles enforced server-side | `/v1/admin/*` | IMPLEMENTED BUT UNVERIFIED | Spot-check only | Existing middleware | Not re-audited line-by-line this pass | Residual risk |
| REQ-KEYROT-1 | Incident note | Key rotation UX | api key rotate | OPEN | Rotate does not revoke previous key; tests lock overlap | None this pass | Locked tests | Left as known limitation |

## Documents read

| Document | Location | Notes |
|---|---|---|
| Briefing card | attachment PDF | Front: audit/fix/explain/build. Reverse: FP-300 “missing feature” done-when list |
| Finance memo | attachment PDF | 225 vs 245, CSV 10x, scheme over, splits, March double, 3am close, OTP, cancel IDOR |
| Incident log | attachment PDF | FP-187, FP-201, FP-203, FP-209, FP-240, 2026-05-14 double charge, 2026-08-21 dup payout |
| Day 1 MC deck | attachment PDF | Process/scoring only; no extra product rules |
| ARCHITECTURE.md | `docs/` | Fils, Bahrain day, ledger, security |
| HANDOVER.md | `docs/` | Refunds 501 (then), residue not posted, callbacks, March |
| ONBOARDING.md | `docs/` | FP-212 refunds = briefing FP-300 |
| ADR-0001 … 0006 | `docs/adr/` | Money, residue, report windows, balance rebuild, shadow ledger, display |
| FP-300.pdf | **not found** | Ask the user if a separate spec exists |

## Intentionally not claimed complete

A full-repository security/financial audit cannot prove that every latent defect is gone. Items above marked OPEN / UNVERIFIED / NOT APPLICABLE remain. Locked CSV cents tests still fail under a full `npm test`. Reporting consumer still fails closed on poison-pill outbox rows missing `merchantId`.
