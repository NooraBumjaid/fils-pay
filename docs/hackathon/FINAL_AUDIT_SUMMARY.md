# FilsPay — final audit summary

**Hackathon:** The Handover (Reboot01)  
**Branch:** `hackathon/fixes`  
**Date:** 2026-10-30

## Executive summary

FilsPay could not boot a fresh database, could not refund a captured payment, and disagreed with itself on fils arithmetic. This branch repairs bootstrap, finishes merchant refunds (FP-300 / briefing reverse / ONBOARDING FP-212), and closes the highest-impact finance, callback, dispatcher, and scheme-residue holes without rewriting frozen money packages.

**1 BHD = 1000 fils** (`docs/ARCHITECTURE.md`, ADR-0001).

**Official `FP-300.pdf` is missing.** Acceptance criteria used: briefing-card reverse + ONBOARDING FP-212.

## Measurable impact

| Area | Before | After |
|---|---|---|
| Migrations | Stopped at `0054`/`0055` | Local migrate through `0078` |
| Merchant refunds | `POST /v1/refunds` → 501 | Full/partial refunds, locks, webhooks, settlement, reporting |
| Login | Pending session authenticated | `live_sessions` requires `authenticated` |
| Payment links | Client `submittedAt` bypassed expiry | Server `now()`; lease + attempt key |
| CSV adjustments | `4.75` BD → 475 fils | `4.75` BD → 4750 fils (`parseBhdToFils`) |
| Current fee display | Backfilled 245 bps | Live 225 bps (`effective_from`) |
| Scheme export | Untruncated / no residue journal | Truncate + ADR-0002 residue legs |
| Callbacks | Duplicate notes on replay | Unique `callback_id` |
| Payout rail | Duplicate disbursement rows | Unique per batch |
| Webhook claim | No SKIP LOCKED | Claim + 2-minute lease |
| Hosted box | Missing Dockerfiles, open Postgres | Compose overlay with RAM/CPU caps |

## Counts (this branch, not “every bug in existence”)

| Metric | Figure |
|---|---|
| Requirements traced | 40 rows in `REQUIREMENTS_TRACEABILITY.md` |
| Requirements verified with a test this or a prior recorded pass | See matrix; FP-300 API criteria verified this pass |
| Bugs in inventory | BUG-001 … BUG-052 |
| Not a bug / not reproduced | BUG-014, BUG-015 |
| Newly verified this batch | BUG-011, 049, 050, 051, 052 |
| Remaining unresolved / unverified | CSV locked-test conflict (BUG-010), reporting poison pills, key rotation, Dilmune live, browser UI, admin role line-by-line |

## FP-300

Implemented and API-verified. Dilmune hosting and dashboard browser flow unverified. Details: `FP300_VERIFICATION.md`.

## Tests by component (this batch)

| Component | Result |
|---|---|
| API uniqueness / fee display | 14 pass / 0 fail |
| API refunds | 25 pass / 0 fail |
| API dispatcher (locked file) | 8 pass / 1 fail (jitter) |
| Go settlement (`-short ./...` in Docker) | all packages ok |
| Full `npm test` | not re-run |
| Web / admin browser | not run |

## Financial and security invariants checked

- Integer fils; scheme truncate to 10; residue journaled when gap > 0.
- Refund ceiling = remaining captured; concurrent keys cannot overspend.
- Ledger refund groups balance; cumulative fee reversal 12+13.
- Callback and disbursement uniqueness under concurrency.
- Webhook claim does not double-send under overlapping passes.
- Cross-merchant refund UUID → 404.

Not proven globally: every admin route’s role check, every reporting aggregation, live Dilmune TLS.

## Deployment readiness

- Overlay: `ops/docker-compose.hosted.yml` (1 vCPU / 2 GB, API 0.5 / 512 MB).
- This batch adds one unique-index migration and small claim/journal SQL — no extra processes, no extra RAM.
- **Recommended commit:** HEAD of `hackathon/fixes` after local commits in this batch.
- **Fallback:** `7a84622`.
- **Do not push or deploy without approval.**

## Remaining risks

Locked CSV cents tests, reporting null `merchantId`, backoff jitter flake, key-rotation overlap, unverified UI/hosting, missing official FP-300.pdf. This report does **not** claim every bug has been found.
