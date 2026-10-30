import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { toFils } from "@filspay/money";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { issueApiKey } from "../apiKeys/issue.js";
import { recordKycReview } from "../onboarding/review.js";
import type { AcquirerRefundResult, AcquirerSimulator } from "../acquirer/types.js";
import { processRefund } from "./processRefund.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("processRefund.cumulativeFee.test.ts requires DATABASE_URL and a migrated Postgres");
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token",
  ACQUIRER_FAILURE_RATE: "0",
  ACQUIRER_LATENCY_MIN_MS: "0",
  ACQUIRER_LATENCY_MAX_MS: "1",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const app = buildApp(config, pool);
const acquirer: AcquirerSimulator = {
  authorize() { throw new Error("not used"); },
  capture() { throw new Error("not used"); },
  refund(req): Promise<AcquirerRefundResult> {
    return Promise.resolve({ outcome: "approved", acquirerReference: req.acquirerReference, latencyMs: 0 });
  },
};

test.after(async () => {
  await app.close();
  await pool.end();
});

test("partial refund fee reversals cumulatively recover the exact captured fee", async () => {
  const suffix = randomUUID();
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Refund fee rounding ${suffix}`],
  );
  const merchantId = merchant.rows[0]!.id;
  const user = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, 'owner', 'unused') RETURNING id`,
    [merchantId, `refund-fee-${suffix}@example.test`],
  );
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const apiKey = await issueApiKey(pool, config, { merchantId, createdBy: user.rows[0]!.id, label: "fee rounding" });

  const authorized = await app.inject({
    method: "POST",
    url: "/v1/transactions",
    headers: { authorization: `Bearer ${apiKey.rawKey}`, "idempotency-key": randomUUID() },
    payload: { amountFils: 1_000, card: { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" } },
  });
  assert.equal(authorized.statusCode, 201, authorized.body);
  const transactionId = (authorized.json() as { id: string }).id;
  const captured = await app.inject({
    method: "POST",
    url: `/v1/transactions/${transactionId}/capture`,
    headers: { authorization: `Bearer ${apiKey.rawKey}`, "idempotency-key": randomUUID() },
    payload: {},
  });
  assert.equal(captured.statusCode, 200, captured.body);

  const actorRow = await pool.query<{ id: string }>(
    `SELECT id FROM api_keys WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [merchantId],
  );
  const actor = { type: "merchant_api_key" as const, id: actorRow.rows[0]!.id };
  for (const amountFils of [500, 500]) {
    const result = await processRefund(pool, acquirer, {
      transactionId,
      merchantId,
      amountFils: toFils(amountFils),
      idempotencyKey: randomUUID(),
      actor,
    });
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
  }

  const refunds = await pool.query<{ fee_reversed_fils: string }>(
    `SELECT fee_reversed_fils FROM refunds WHERE transaction_id = $1 ORDER BY occurred_at, id`,
    [transactionId],
  );
  assert.deepEqual(refunds.rows.map((row) => Number(row.fee_reversed_fils)), [12, 13]);
  assert.equal(refunds.rows.reduce((sum, row) => sum + Number(row.fee_reversed_fils), 0), 25);
});
