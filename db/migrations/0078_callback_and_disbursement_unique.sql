-- FP-201: a redelivered acquirer callback_id must not insert a second note.
-- Incident 2026-08-21: two dispatchers must not insert two payout-rail rows
-- for the same settlement batch.

DELETE FROM acquirer_callback_notes a
      USING acquirer_callback_notes b
      WHERE a.callback_id = b.callback_id
        AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_acquirer_callback_notes_callback_id
    ON acquirer_callback_notes (callback_id);

DELETE FROM settlement_payout_disbursements a
      USING settlement_payout_disbursements b
      WHERE a.settlement_batch_id = b.settlement_batch_id
        AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_payout_disbursements_batch
    ON settlement_payout_disbursements (settlement_batch_id);
