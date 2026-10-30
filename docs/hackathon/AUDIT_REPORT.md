# Audit report — current branch (`hackathon/fixes`, 2026-10-30)

Full traceability: `REQUIREMENTS_TRACEABILITY.md`. FP-300: `FP300_VERIFICATION.md`. Inventory: `BUG_INVENTORY.md`.

This batch compared official case files (briefing, finance memo, incident log, Day 1 deck) plus in-repo ADRs/HANDOVER/ONBOARDING/ARCHITECTURE against code. `FP-300.pdf` was not found.

Confirmed and fixed here: FP-201 callback uniqueness, payout disbursement uniqueness, dispatcher SKIP LOCKED, CloseBatch scheme residue, current-fee 225 bps display. Tests: uniqueness/fee 14/14; refunds 25/25; Docker Go `-short ./...` ok. Dispatcher jitter assertion still flakes. Full `npm test` not re-run.

The original BUG-001 report is preserved below.

---

# BUG-001 Audit Report — Broken Database Migration

**Project:** FilsPay Reboot01
**Bug ID:** BUG-001
**Date:** 2026-10-29
**Auditor:** PostgreSQL / backend fix (local Compose DB)
**Status:** Fixed in `db/migrations/0054_views.sql`. Not committed.

---

## 1. Bug description

`npm run migrate` failed while applying `db/migrations/0054_views.sql`:

```
relation "settlement_batch_events" does not exist (PostgreSQL 42P01)
```

The failing statement was the `CREATE OR REPLACE VIEW v_unbatched_capture_events` definition, which used a `NOT EXISTS` subquery against `settlement_batch_events`.

## 2. Severity

**High for local/CI bootstrap. Low for live settlement math.**

| Dimension | Assessment |
|---|---|
| Local / CI | **High.** Migration runner aborts inside a transaction, so `0054` never lands and every later file (`0055` onward) is blocked until this is fixed. Fresh databases cannot finish schema setup. |
| Production batching | **Low / none for this view.** CloseBatch does **not** read `v_unbatched_capture_events`. It already selects from `transaction_events` with `settlement_batch_id IS NULL`. |
| Collateral | **Medium.** The same failed file also creates `merchant_payable_position`, which `apps/settlement/internal/ledger/refresh.go` queries when rebuilding `merchant_balances`. Until `0054` applies, that rebuild path cannot run. |

## 3. Root cause

Settlement assignment lives on `transaction_events.settlement_batch_id`, added by `db/migrations/0023_transaction_events_settlement_batch.sql`:

- `NULL` means the event has not been claimed by a batch.
- Non-`NULL` is permanent: a row belongs to at most one batch.
- Eligibility is documented in that migration as `settlement_batch_id IS NULL`.
- A partial index, `idx_transaction_events_unbatched`, already encodes that predicate.

No migration creates `settlement_batch_events`. A repository-wide search finds that identifier only in the broken `0054` view.

`0054_views.sql` was written against a join table that was never shipped. The runner wraps each file in `BEGIN` / `COMMIT` and rolls back on error, so the broken view never persisted. `schema_migrations` stopped at `0053_legacy_transactions.sql` until this fix.

## 4. Impact

Before the fix:

1. `npm run migrate` could not complete on a database that had reached `0054`.
2. Views `v_unbatched_capture_events`, `merchant_payable_position`, and `v_active_api_keys` did not exist.
3. Downstream migrations (`0055`–`0072`) were unreachable on that database.
4. Settlement **production path** was unaffected: `CloseBatch` (`apps/settlement/internal/settlement/batch.go`) and the TypeScript reconciliation query (`apps/api/src/settlement/query.ts`) already filter `te.settlement_batch_id IS NULL`.

After the fix, `0054_views.sql` applied successfully. The three views exist and `v_unbatched_capture_events` is queryable. Migrate then stopped at an **unrelated** failure in `0055_chart_of_accounts_suspense.sql` (see Remaining risks).

## 5. Consumer analysis

### `v_unbatched_capture_events`

No application, test, or reporting query references this view. The only occurrence in the repo is the view definition itself.

Live unbatched-event consumers query `transaction_events` directly:

| Consumer | Event types | Unbatched predicate |
|---|---|---|
| `CloseBatch` in `batch.go` | `'captured', 'partially_captured'` | `te.settlement_batch_id IS NULL` |
| Reconciliation in `query.ts` | `'captured', 'partially_captured'` | `te.settlement_batch_id IS NULL` |
| `apps/api/src/routes/settlement.test.ts` helper | `'captured', 'partially_captured'` | `te.settlement_batch_id IS NULL` |
| Index `idx_transaction_events_unbatched` | `'captured', 'partially_captured'` | `settlement_batch_id IS NULL` |

### Other views in `0054` (unchanged)

- `merchant_payable_position` — used by `RefreshBalanceCache` in `refresh.go`. Left untouched.
- `v_active_api_keys` — no consumers found. Left untouched.

## 6. `partially_captured` discrepancy (observed, not changed)

The view keeps `WHERE te.event_type = 'captured'` as instructed. That is narrower than every live batching query.

Evidence from a rolled-back smoke insert of one `captured` event (6000 fils) and one `partially_captured` event (4000 fils) on the same transaction:

| Source | Rows returned |
|---|---|
| `v_unbatched_capture_events` | `captured` / 6000 only |
| CloseBatch eligibility SQL | `captured` / 6000 **and** `partially_captured` / 4000 |

Instalment / partial-capture flows write `partially_captured` for every capture except the last (`apps/api/src/payments/capture.ts`, seed fixtures). If this view were later used as a batching source, those events would be omitted and gross/fee/net would understate.

There is **no current consumer**, so the filter was not widened. Changing it would be a separate, evidence-backed change.

## 7. Before / after SQL

Only the unbatched predicate in `v_unbatched_capture_events` changed. `event_type = 'captured'` and the other two views are unchanged.

**Before**

```sql
 WHERE te.event_type = 'captured'
   AND NOT EXISTS (
     SELECT 1 FROM settlement_batch_events sbe WHERE sbe.transaction_event_id = te.id
   );
```

**After**

```sql
 WHERE te.event_type = 'captured'
   AND te.settlement_batch_id IS NULL;
```

## 8. Remaining risks

1. **`0055_chart_of_accounts_suspense.sql` still fails** after this fix. It inserts into `(code, name, account_type, description)`, but `chart_of_accounts` (migration `0007`) has `(id, name, kind)`. PostgreSQL error: `column "code" of relation "chart_of_accounts" does not exist (42703)`. Out of scope for BUG-001.
2. Because migrate stops at `0055`, objects from `0056`–`0072` are still missing (`live_sessions`, `credit_requests`, `settlement_payout_disbursements`, `adjustment_imports`, `reporting_saved_filters`, extra chart accounts, etc.). Many `npm test` failures are this cascade, not BUG-001.
3. **Latent view vs CloseBatch mismatch** on `partially_captured` if a future caller uses the view for eligibility.
4. **Editing an already-applied migration.** The runner tracks filename only (no checksum). `0054` had never committed, so in-place edit was the correct repair. Databases that already recorded `0054_views.sql` would skip the file and would need a new numbered migration instead. None were observed here.
5. Go settlement tests were not executed: `go` is not on `PATH` on this machine.

## 9. Files inspected

- `db/migrations/0023_transaction_events_settlement_batch.sql`
- `db/migrations/0054_views.sql`
- `docs/ARCHITECTURE.md`, `docs/HANDOVER.md`, `docs/adr/*`, `CHANGELOG.md`
- `apps/settlement/internal/settlement/batch.go`
- `apps/api/src/settlement/query.ts`
- `apps/settlement/internal/ledger/refresh.go`
