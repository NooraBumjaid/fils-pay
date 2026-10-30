-- Finance memo: the lifetime payout estimate drifted for high-volume
-- merchants because the column was REAL (float32). Store integer fils.

ALTER TABLE merchants
    ALTER COLUMN lifetime_net_payout_monitoring_estimate TYPE BIGINT
    USING ROUND(lifetime_net_payout_monitoring_estimate::numeric)::bigint;
