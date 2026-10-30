# BUG-001 Test Results

**Date:** 2026-10-29  
**Host:** Windows 10, PowerShell, Node v24.19.0  
**Database:** isolated local Compose Postgres 16 (`ops-postgres-1`)  
**Connection used for migrate/tests:** `postgres://filspay:filspay_dev_password@localhost:5432/filspay?sslmode=disable`

This file records **actual** outcomes. Tests that were not executed are marked **PENDING**.

---

## 1. Environment safety check (before migrate)

| Check | Result |
|---|---|
| Process `DATABASE_URL` initially | empty |
| Compose service | `ops-postgres-1` / `postgres:16-alpine` / healthy |
| Ports | `0.0.0.0:5432->5432/tcp` (localhost only) |
| `current_database` / `current_user` | `filspay` / `filspay` |
| Applied migrations before fix | `0001` … `0053` (51 rows). **`0054` not applied** |
| `transaction_events.settlement_batch_id` | present (UUID, nullable, FK to `settlement_batches`) |
| Relation `settlement_batch_events` | does not exist |

Migrate was run only against this local Compose database.

## 2. `npm run migrate`

**Result:** `0054` **PASS**. Full migrate **FAIL** at unrelated `0055`.

```
SKIP  0001_extensions.sql  (already applied)
...
SKIP  0053_legacy_transactions.sql  (already applied)
APPLY 0054_views.sql
Error: migrate: failed applying 0055_chart_of_accounts_suspense.sql:
  column "code" of relation "chart_of_accounts" does not exist
```

`0055` inserts `(code, name, account_type, description)` into a table defined by `0007` as `(id, name, kind)`. That is a separate defect. It was not modified.

After migrate, `schema_migrations` contains `0054_views.sql`. Later filenames are absent.

## 3. View verification (psql)

### Views created

```
 merchant_payable_position
 v_active_api_keys
 v_unbatched_capture_events
```

### Compiled definition

```
SELECT te.id AS event_id,
   te.transaction_id,
   te.event_type,
   te.amount_fils,
   te.created_at,
   t.merchant_id
  FROM transaction_events te
    JOIN transactions t ON t.id = te.transaction_id
 WHERE te.event_type = 'captured'::text AND te.settlement_batch_id IS NULL;
```

### Empty-table query

```sql
SELECT COUNT(*) AS unbatched_captured FROM v_unbatched_capture_events;
-- unbatched_captured = 0
```

Query succeeded (no 42P01).

### Rolled-back smoke comparison (`partially_captured`)

Inserted, inside `BEGIN` … `ROLLBACK`, one merchant / one transaction with:

- `partially_captured` 4000 fils
- `captured` 6000 fils
- both `settlement_batch_id` NULL

| source | event_type | amount_fils |
|---|---|---|
| closebatch_eligible | captured | 6000 |
| closebatch_eligible | partially_captured | 4000 |
| view_rows | captured | 6000 |

The view matches the preserved `event_type = 'captured'` filter. CloseBatch-style SQL also includes `partially_captured`. Transaction rolled back; no fixture left behind.

## 4. `npm test`

**Command:** `npm test` with `DATABASE_URL` pointing at the local Compose DB.  
**Overall:** FAIL (workspace failures). Duration ~33s for the workspace run.

Root script is `npm run test --workspaces --if-present && tsx --test scripts/*.test.ts`. Workspace failures therefore skipped the trailing `scripts/*.test.ts` invocation. Those script tests were run separately afterward (section 5).

| Workspace | Tests | Pass | Fail | Notes |
|---|---:|---:|---:|---|
| `@filspay/events` | 4 | 4 | 0 | PASS |
| `@filspay/money` | 40 | 40 | 0 | PASS |
| `@filspay/api` | 362 | 302 | 60 | FAIL — see below |
| `@filspay/reporting` | 11 | 7 | 4 | FAIL — see below |
| `@filspay/web` | 8 | 8 | 0 | PASS |

### Settlement tests relevant to BUG-001 (`apps/api/src/routes/settlement.test.ts`)

These exercise `settlement_batch_id IS NULL` on `transaction_events`, not the view. They confirm the canonical eligibility path still works after `0054` applied.

| Test | Result |
|---|---|
| GET /v1/settlement/batches lists a merchant's own batches | PASS |
| GET /v1/settlement/batches/:id returns detail | PASS |
| GET /v1/settlement/batches/:id/transactions returns truncated scheme-export line | PASS |
| GET /v1/settlement/reconciliation reports gapFils === 0 for a fully-batched period | PASS |
| GET /v1/settlement/reconciliation with an unbatched capture reports pendingUnbatchedFils | PASS |
| GET /v1/settlement/summary sums captured amounts | PASS |
| GET /v1/settlement/summary is forbidden for a 'support' session role | FAIL — `relation "live_sessions" does not exist` (`0058` not applied) |
| GET /v1/settlement/summary succeeds for a 'finance' session role | FAIL — same `live_sessions` |
| GET /v1/settlement/reconciliation is forbidden for a 'support' session role | FAIL — same `live_sessions` |
| GET /v1/settlement/reconciliation succeeds for a 'finance' session role | FAIL — same `live_sessions` |

Capture path still green:

- authorize → capture (full) happy path — PASS
- authorize → capture (partial) → capture (remainder) — PASS

### API failures (60) — not caused by the view SQL

Almost all are the `0055` cascade (objects from later migrations missing):

| Missing object | Introduced by | Example failing suite |
|---|---|---|
| `adjustment_imports` / `adjustment_import_rows` | 0065 / 0066 | `adjustmentImport.test.ts`, admin import routes |
| `credit_requests` | 0060 | `credits.test.ts`, `adminCredits.test.ts` |
| `live_sessions` | 0058 | sessions, KYC upload, some settlement role tests |
| `reporting_saved_filters` | 0069 | `savedFilters.test.ts` |
| `webhook_delivery_archives` | 0068 | `archiveReplay.test.ts` |
| `settlement_payout_disbursements` | 0057 | `payoutDisbursement.test.ts` |
| `chart_of_accounts.manual_balance_adjustment_contra` | 0064 | `adjustMerchantBalanceJournaled` |
| `chart_of_accounts` goodwill / credit accounts | 0061 | credit journal tests |

One API failure is **not** a missing relation:

- `dispatcher.test.ts` — `Expected 934 === 1000` on backoff/exhaustion timing. Unrelated to BUG-001.

### Reporting failures (4) — not caused by the view SQL

All four failed with:

```
null value in column "merchant_id" of relation "merchant_daily_volume"
violates not-null constraint
```

Suites: `rebuild.test.ts` (1), `runConsumerPass.test.ts` (3). Pre-existing consumer/payload issue; not the `0054` view.

## 5. Root `scripts/*.test.ts` (ran separately)

`npm test` did not reach this step because workspaces already failed. Re-run:

```
npx tsx --test scripts/*.test.ts
```

**Result:** PASS — 5 tests, 0 fail, ~1.3s.

- expire_holds SQL builder (2) — PASS
- reconcile_march unit (2) — PASS
- reconcile_march integration, 2000 synthetic ledger entries — PASS (`db-computed residue: 9097 fils`)

## 6. Go settlement tests

**PENDING** — `go` is not installed / not on `PATH`:

```
go : The term 'go' is not recognized as the name of a cmdlet...
```

Not executed:

- `cd apps/settlement && go test ./...`
- `go test -short ./...` (Windows skip for slow/timezone-flaky tests)

`RefreshBalanceCache` (`refresh.go`) now has `merchant_payable_position` available because `0054` applied. That path was not exercised in Go.

## 7. Tests not applicable / not run

| Item | Status |
|---|---|
| Dedicated unit test for `v_unbatched_capture_events` | None exists. Not added (test files locked; no consumer). |
| Browser / UI verification | Not applicable (SQL migration only). |
| Production / shared database migrate | Not run (policy). |
| `npm run seed` | Not run. |

## 8. Conclusion

BUG-001 is fixed and verified at the database layer: `0054_views.sql` applies, the view exists, and it uses `settlement_batch_id IS NULL`.

`npm test` is **not** green on this machine because migrate still stops at `0055`. Settlement tests that only need schema through `0054` (batches, reconciliation with unbatched captures, capture flows) **passed**. Go tests remain **PENDING**.
