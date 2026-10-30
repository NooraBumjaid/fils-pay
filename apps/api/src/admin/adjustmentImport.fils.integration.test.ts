import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { applyAdjustmentImport, getAdjustmentImportRows } from "./adjustmentImport.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("adjustmentImport.fils.integration.test.ts requires DATABASE_URL and a migrated Postgres");
}

const pool = new Pool({ connectionString: databaseUrl, max: 3 });

test.after(async () => {
  await pool.end();
});

test("BD adjustment CSV values are journaled and cached in fils", async () => {
  const admin = await pool.query<{ id: string }>(
    `INSERT INTO admin_users (email, password_hash, display_name, role)
     VALUES ($1, 'not-a-real-hash', 'Fils CSV Test', 'finance') RETURNING id`,
    [`fils-csv-${randomUUID()}@admin.test`],
  );
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps, status, test_mode)
     VALUES ($1, 250, 'active', false) RETURNING id`,
    [`fils-csv-${randomUUID()}`],
  );

  const result = await applyAdjustmentImport(pool, {
    adminUserId: admin.rows[0]!.id,
    originalFilename: "finance-bd-adjustment.csv",
    rows: [{ merchantId: merchant.rows[0]!.id, amount: "4.75", reason: "BD amount from finance sheet" }],
  });

  assert.equal(result.totalPostedFils, 4_750);
  const rows = await getAdjustmentImportRows(pool, result.importId);
  assert.equal(rows[0]?.rawAmountText, "4.75");
  assert.equal(rows[0]?.parsedAmountFils, 4_750);

  const ledger = await pool.query<{ amount_fils: string }>(
    `SELECT amount_fils FROM ledger_entries
      WHERE merchant_id = $1 AND description = 'CSV adjustment import' ORDER BY id`,
    [merchant.rows[0]!.id],
  );
  assert.deepEqual(ledger.rows.map((row) => Number(row.amount_fils)), [4_750, 4_750]);

  const balance = await pool.query<{ cached_payable_fils: string }>(
    `SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id = $1`,
    [merchant.rows[0]!.id],
  );
  assert.equal(Number(balance.rows[0]?.cached_payable_fils), 4_750);
});
