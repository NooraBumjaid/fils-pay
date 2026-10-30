-- Pending (pre-OTP) sessions must not authenticate. 0058 omitted this
-- predicate; CREATE OR REPLACE is safe if 0058 already ran.

CREATE OR REPLACE VIEW live_sessions AS
SELECT id,
       merchant_user_id,
       token_hash,
       authenticated,
       created_at,
       expires_at
  FROM sessions
 WHERE revoked_at IS NULL
   AND expires_at > now()
   AND authenticated;
