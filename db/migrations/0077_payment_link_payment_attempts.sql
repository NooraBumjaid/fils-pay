-- Keep one durable idempotency scope across stale-reservation recovery.
-- reservation_id is a lease token for the current worker; payment_attempt_key
-- remains stable when that lease expires so a recovery replays the same
-- authorize/capture operations instead of charging again.
ALTER TABLE payment_links
    ADD COLUMN payment_attempt_key TEXT,
    ADD COLUMN reservation_id UUID;
