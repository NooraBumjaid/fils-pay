-- Before the counter was saturated, int4 overflow could wrap this
-- monotonically increasing lifetime total negative. A negative value means
-- the volume tier threshold was necessarily crossed; preserve the earned
-- tier and let the application keep the counter at its threshold.
UPDATE platform_stats
   SET total_processed_fils = 2000000000,
       updated_at = now()
 WHERE total_processed_fils < 0;
