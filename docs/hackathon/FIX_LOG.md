# BUG-001 Fix Log

**Bug:** Broken migration `0054_views.sql` (`settlement_batch_events` does not exist)  
**Date:** 2026-10-29  
**Change type:** One-line SQL correction in an unapplied migration  
**Commit:** none (not committed, not pushed)

---

## Decision

Replace the `NOT EXISTS` subquery against the nonexistent `settlement_batch_events` table with the canonical unbatched predicate already documented in migration `0023` and used by CloseBatch:

```sql
te.settlement_batch_id IS NULL
```

Do this **in place** in `0054_views.sql` because:

- The previous apply rolled back; `schema_migrations` did not contain `0054_views.sql`.
- The runner has no checksum; it only skips files already recorded by filename.
- A new migration would leave a permanently failing `0054` on every fresh database.

## File changed

`db/migrations/0054_views.sql` — `v_unbatched_capture_events` only.

## Before

```sql
CREATE OR REPLACE VIEW v_unbatched_capture_events AS
SELECT te.id AS event_id,
       te.transaction_id,
       te.event_type,
       te.amount_fils,
       te.created_at,
       t.merchant_id
  FROM transaction_events te
  JOIN transactions t ON t.id = te.transaction_id
 WHERE te.event_type = 'captured'
   AND NOT EXISTS (
     SELECT 1 FROM settlement_batch_events sbe WHERE sbe.transaction_event_id = te.id
   );
```

## After

```sql
CREATE OR REPLACE VIEW v_unbatched_capture_events AS
SELECT te.id AS event_id,
       te.transaction_id,
       te.event_type,
       te.amount_fils,
       te.created_at,
       t.merchant_id
  FROM transaction_events te
  JOIN transactions t ON t.id = te.transaction_id
 WHERE te.event_type = 'captured'
   AND te.settlement_batch_id IS NULL;
```

## Explicitly not changed

| Item | Reason |
|---|---|
| `event_type = 'captured'` | Task required preserving it. No application consumer of the view exists, so there is no evidence to widen the filter. |
| `merchant_payable_position` | Unrelated; already correct; used by `RefreshBalanceCache`. |
| `v_active_api_keys` | Unrelated. |
| `0023_transaction_events_settlement_batch.sql` | Already applied; already defines the column and index. |
| `0055_chart_of_accounts_suspense.sql` | Separate schema bug (`code` / `account_type` vs `id` / `kind`). Out of scope. |
| `packages/money/`, Go money package, financial calculations | Frozen / unrelated. |
| Existing `*.test.ts` / `*_test.go` | Tests are regression-locked. |
| Git commit / push | Explicitly not requested. |

## Why this is safe

- Matches `0023` comments and `idx_transaction_events_unbatched`.
- Matches CloseBatch and the TypeScript reconciliation query.
- `NULL` remains the only “not yet batched” signal; no join table is introduced.
- `CREATE OR REPLACE VIEW` does not alter tables, amounts, or fee logic.
- Failed previous applies were rolled back, so this is the first committed definition of the view.

## Verification performed

See `docs/hackathon/TEST_RESULTS.md`.

- Confirmed `DATABASE_URL` target was local Compose Postgres (`ops-postgres-1`, `filspay` / `filspay`, `localhost:5432`).
- `npm run migrate` applied `0054_views.sql`.
- `pg_get_viewdef('v_unbatched_capture_events')` shows `settlement_batch_id IS NULL`.
- `SELECT COUNT(*) FROM v_unbatched_capture_events` succeeded.
- Rolled-back smoke rows confirmed `captured` is included and `partially_captured` is still excluded by the preserved filter.
