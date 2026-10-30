# FilsPay — final audit summary

**Hackathon:** The Handover (Reboot01)  
**Branch:** `hackathon/fixes`  
**Date:** 2026-10-30

## Executive summary

FilsPay could not boot a fresh database, could not refund a captured payment, and disagreed with itself on fils arithmetic. This branch repairs bootstrap, finishes merchant refunds (FP-300), and closes the highest-impact finance and auth holes without rewriting frozen money packages or weakening ledger constraints.

**1 BHD = 1000 fils** (`docs/ARCHITECTURE.md`, ADR-0001). Cursor-rule comments that say “cents” are wrong; the money package and architecture win.

## Measurable impact

| Area | Before | After |
|---|---|---|
| Migrations | Stopped at `0054`/`0055` | Local migrate through `0077` |
| Merchant refunds | `POST /v1/refunds` → 501 | Full/partial refunds, locks, webhooks, settlement, reporting |
| Login | Pending session authenticated | `live_sessions` requires `authenticated` |
| Payment links | Client `submittedAt` bypassed expiry | Server `now()`; lease + attempt key for crash recovery |
| CSV adjustments | `4.75` BD → 475 fils | `4.75` BD → 4750 fils |
| Scheme export | 2dp `amount` rounded up vs truncated fils | `amount` from truncated fils |
| Split payouts | Remainder fils dropped | Last-child remainder |
| Hosted box | Missing Dockerfiles, open Postgres, committed DB password | Compose overlay with RAM/CPU caps |

## Counts

- Confirmed fixed in inventory: **BUG-001 through BUG-048**, excluding 014 (not a bug) and 015 (not reproduced). BUG-011 still needs a locked-test policy decision.
- FP-300: **implemented** (`90d4e06`, `ceae017`).
- Go tests: **PENDING** (`go` not installed here).
- Push/PR: **not done** (per instruction).

## Recommended deploy SHA

HEAD of `hackathon/fixes` after the local finalize commits. See `CHECKPOINT.md`.

## Remaining work (priority order)

1. Run `go test -short ./...` in `apps/settlement` on a machine with Go.
2. Decide BUG-011 vs the locked 245 bps assertion.
3. Optional: skip/log reporting poison-pill events missing `merchantId`.
4. TLS + `COOKIE_SECURE=true` if Dilmune terminates HTTPS.
