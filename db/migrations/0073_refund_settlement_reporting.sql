-- Store refund settlement adjustments alongside batch totals so the
-- merchant settlement report and reporting read model can show what was
-- deducted from each payout. The daily rollup columns are consumed by the
-- reporting worker's refund.succeeded handler.

ALTER TABLE settlement_batches
    ADD COLUMN refunded_fils BIGINT NOT NULL DEFAULT 0 CHECK (refunded_fils >= 0),
    ADD COLUMN fee_reversed_fils BIGINT NOT NULL DEFAULT 0 CHECK (fee_reversed_fils >= 0);

ALTER TABLE merchant_payout_trends
    ADD COLUMN refunded_fils BIGINT NOT NULL DEFAULT 0 CHECK (refunded_fils >= 0),
    ADD COLUMN fee_reversed_fils BIGINT NOT NULL DEFAULT 0 CHECK (fee_reversed_fils >= 0);

ALTER TABLE merchant_daily_volume
    ADD COLUMN refund_count INTEGER NOT NULL DEFAULT 0 CHECK (refund_count >= 0),
    ADD COLUMN refund_gross_fils BIGINT NOT NULL DEFAULT 0 CHECK (refund_gross_fils >= 0);
