# The Handover — checkpoint

**Branch:** `hackathon/fixes`  
**Date:** 2026-10-30 (document-driven batch)  
**Database:** local Compose Postgres 16 (`filspay` / `localhost:5432`)  
**Fallback SHA:** `7a84622`  
**Do not push.**

## 1. Confirmed bugs fixed

Inventory: `docs/hackathon/BUG_INVENTORY.md`. This batch closed BUG-011, 049, 050, 051, 052.

| Severity | IDs |
|---|---|
| Critical | BUG-004, 010, 019, 022, 030–034, 043–045 |
| High | BUG-001–003, 005–009, 011–013, 016–018, 020–021, 023–027, 029, 035–036, 039–042, 046–052 |
| Medium | BUG-028 |
| Not a bug / not reproduced | BUG-014 (ADR-0004), BUG-015 (query already `closed` only) |

BUG-001 (`ce9cbab`) remains the bootstrap fix. `7a84622` remains a deployable fallback from before this batch.

## 2. Tests this batch

| Result | Count / note |
|---|---|
| Uniqueness + fee display focused | 14 pass / 0 fail |
| Refund / FP-300 focused | 25 pass / 0 fail |
| Dispatcher existing | 8 pass / 1 fail (jitter lock `935 !== 1000`) |
| Docker Go `-short ./...` | all packages `ok` |
| Full `npm test` | **not re-run** |
| Browser | **not run** |

## 3. FP-300

See `FP300_VERIFICATION.md`. API/ledger/webhook/settlement verified. UI and Dilmune not verified. Official `FP-300.pdf` missing.

## 4. Remaining risks

1. Locked CSV tests still expect cents (`4.75` → 475) after BUG-010.
2. Reporting consumer poison-pill `merchantId` null (locked atomicity test forbids skip).
3. Dispatcher backoff jitter assertion flakes.
4. OTP session token is not rotated on promote (locked login helpers reuse the pending cookie).
5. Hosted TLS: `COOKIE_SECURE=false` on HTTP Dilmune.
6. Super_admin impersonation (mapped to owner) can still write, per ADMIN.md / FP-178.

## 5. Deployment

Instructions: `docs/hackathon/DILMUNE_DEPLOY.md`. Overlay: `ops/docker-compose.hosted.yml`.

**Recommended deploy:** HEAD of `hackathon/fixes` after the local commits in this batch (`0f5abab` or later docs commit).  
**Fallback:** `7a84622`.

Note: `7945dd8` is labelled SKIP LOCKED in the subject but contains the CloseBatch residue journal (`batch.go`); the actual SKIP LOCKED change is `0f5abab`. A git index.lock race swapped the staged files. Do not reset.

Nothing has been pushed.
