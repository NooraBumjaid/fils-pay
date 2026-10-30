/**
 * Incident 2026-08-21: two dispatchers must not insert two payout-rail rows
 * for the same settlement batch. Requires DATABASE_URL and migration 0078.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { recordPayoutDisbursementEffect } from "./payoutDisbursement.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "payoutDisbursement.dup.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate` first)",
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 5 });

test.after(async () => {
  await pool.end();
});

async function createPaidBatch(netPayoutFils: number): Promise<string> {
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, $2) RETURNING id`,
    [`Disbursement Dup Merchant ${randomUUID()}`, 250],
  );
  const batch = await pool.query<{ id: string }>(
    `INSERT INTO settlement_batches
        (merchant_id, batch_date, status, gross_fils, fee_fils, net_payout_fils, closed_at, paid_at)
     VALUES ($1, current_date, 'paid', $2, 0, $2, now(), now())
     RETURNING id`,
    [merchant.rows[0]!.id, netPayoutFils],
  );
  return batch.rows[0]!.id;
}

test("recording the same batch twice inserts exactly one disbursement row", async () => {
  const batchId = await createPaidBatch(471_300);

  await recordPayoutDisbursementEffect(pool, batchId, 471_300);
  await recordPayoutDisbursementEffect(pool, batchId, 471_300);

  const result = await pool.query(
    `SELECT id FROM settlement_payout_disbursements WHERE settlement_batch_id = $1`,
    [batchId],
  );
  assert.equal(result.rows.length, 1);
});

test("concurrent recording of the same batch inserts exactly one disbursement row", async () => {
  const batchId = await createPaidBatch(250_000);

  await Promise.all([
    recordPayoutDisbursementEffect(pool, batchId, 250_000),
    recordPayoutDisbursementEffect(pool, batchId, 250_000),
  ]);

  const result = await pool.query(
    `SELECT id FROM settlement_payout_disbursements WHERE settlement_batch_id = $1`,
    [batchId],
  );
  assert.equal(result.rows.length, 1);
});
