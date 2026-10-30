-- Two concurrent EnqueuePayoutNotifications scans can both pass NOT EXISTS
-- and insert duplicate settlement.paid events (incident 2026-08-21).

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_settlement_paid_once
  ON outbox_events (aggregate_id)
  WHERE event_type = 'settlement.paid';
