/**
 * FP-201: a redelivered callback_id must not insert a second note.
 * Requires DATABASE_URL and migration 0078 (unique callback_id).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { applyAcquirerCallback, type AcquirerCallbackInput } from "./callbacks.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "callbacks.replay.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate` first)",
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 5 });

test.after(async () => {
  await pool.end();
});

async function createTransaction(): Promise<string> {
  const merchantResult = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, $2) RETURNING id`,
    [`Callback Replay Merchant ${randomUUID()}`, 250],
  );
  const txnResult = await pool.query<{ id: string }>(
    `INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference)
     VALUES ($1, 'captured', 50000, 50000, $2)
     RETURNING id`,
    [merchantResult.rows[0]!.id, `acqref_${randomUUID()}`],
  );
  return txnResult.rows[0]!.id;
}

function callbackFor(transactionId: string, callbackId: string): AcquirerCallbackInput {
  return {
    callbackId,
    type: "fraud_review.completed",
    transactionId,
    occurredAt: "2026-09-16T10:00:00.000Z",
    outcome: "cleared",
    note: "Manual review cleared; no further action needed.",
  };
}

test("a redelivered callback_id inserts exactly one note", async () => {
  const transactionId = await createTransaction();
  const callbackId = `acqcb_${randomUUID()}`;
  const callback = callbackFor(transactionId, callbackId);

  await applyAcquirerCallback(pool, callback);
  await applyAcquirerCallback(pool, callback);

  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM acquirer_callback_notes WHERE callback_id = $1`,
    [callbackId],
  );
  assert.equal(result.rows[0]!.count, "1");
});

test("concurrent redeliveries of the same callback_id still insert exactly one note", async () => {
  const transactionId = await createTransaction();
  const callbackId = `acqcb_${randomUUID()}`;
  const callback = callbackFor(transactionId, callbackId);

  await Promise.all([applyAcquirerCallback(pool, callback), applyAcquirerCallback(pool, callback)]);

  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM acquirer_callback_notes WHERE callback_id = $1`,
    [callbackId],
  );
  assert.equal(result.rows[0]!.count, "1");
});
