# FP-300 verification

**Official product PDF `FP-300.pdf` was not in the repo or the case-file attachments.** The briefing-card reverse labels the missing feature **FP-300**. `docs/ONBOARDING.md` specifies the same work as **FP-212**. This checklist uses those two sources plus `docs/HANDOVER.md`. No extra business rules were invented.

## Done-when (briefing reverse)

| Criterion | Implementation | Test evidence this pass | Status |
|---|---|---|---|
| Works end to end through the API | `POST /v1/refunds` in `apps/api/src/routes/refunds.ts` → `initiateMerchantRefund` → `processRefund` | 25/25 focused refund tests pass | VERIFIED |
| Money is right in the ledger, down to the fils | Balanced refund group; captured ceiling; no refund of uncaptured auth | `the refund's ledger group balances…`; excess 422 | VERIFIED |
| Fees and payouts come out right | Cumulative fee reversal (500+500 → 12+13); CloseBatch nets refunds | `processRefund.cumulativeFee.test.ts`; `TestCloseBatch_NetsSuccessfulRefundsIntoNextPayout` (Docker Go) | VERIFIED |
| Shop gets the right webhook | `refund.succeeded` in dispatcher allowlist + envelope | `refund.succeeded reaches the merchant endpoint with a signed public envelope` | VERIFIED |
| Timeline, reports, reconciliation | Events + reporting consumer + settlement refund columns (`0073`) | Reporting refund rollup tested earlier; not re-run this batch | IMPLEMENTED; reporting not re-run |
| Live on Dilmune Cloud | Hosted compose overlay exists | Not deployed (no push) | BLOCKED on user approval |

## ONBOARDING FP-212 matrix

| Piece | Required | Current | Evidence |
|---|---|---|---|
| Route | Wire stub | Returns 200 on success, not 501 | `POST /v1/refunds completes a full refund through the authenticated route` |
| Core helper | Keep `processRefund` | Used as-is plus cumulative fee path | `processRefund.test.ts` 10 cases |
| Validation / state | Keep | Captured-amount ceiling; refundable statuses | `an invalid refund amount is refused`; voided refused |
| Fee reversal | `calculateRefundFee` + remainder | Cumulative vs independently rounded | `partial refund fee reversals cumulatively recover the exact captured fee` |
| Schema | `refunds`, `refunded_fils` | Present; reason default `unspecified` | migrate through `0078` |
| Settlement | Next batch adjustment | CloseBatch claims succeeded refunds | Docker Go `TestCloseBatch_NetsSuccessfulRefundsIntoNextPayout` |
| Webhook | Add `refund.succeeded` | In `WEBHOOK_ELIGIBLE_EVENT_TYPES` | dispatcher refund test pass |
| UI | `RefundDrawer` | Posts `/v1/refunds` with `Idempotency-Key`; owner/finance only | Code review; **no browser run** |

## Eligibility and isolation

- Refundable statuses: `captured`, `partially_captured`, `partially_refunded`.
- Ceiling: remaining captured fils, not authorized.
- `merchants.refunds_enabled === false` refuses the refund.
- Lookup is merchant-scoped (cross-merchant UUID → 404).
- `Idempotency-Key` required; replay returns the first body.
- Concurrent different keys: `pg_advisory_lock` + `FOR UPDATE`; over-refund test passed.

## Not in any official FP-300 text (left as existing product behavior)

- Default reason `unspecified` (DB constraint, not a briefing rule).
- Feature-flag comments in cursor rules claiming v1.9 501 — contradicted by the briefing card; the briefing wins.

## Gaps

1. **No browser verification** of `RefundDrawer` this pass.
2. **Reporting refund rollup** not re-executed this batch (implemented; prior unit pass).
3. **Dilmune hosting** not performed.
4. If a separate `FP-300.pdf` exists, re-check this file against it before claiming spec completeness.
