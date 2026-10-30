/**
 * POST /v1/refunds is owner/finance, matching RefundDrawer.
 * A merchant support session must not move money through the refund API.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { issueApiKey } from "../apiKeys/issue.js";
import { randomToken, sha256Hex } from "../lib/crypto.js";
import { recordKycReview } from "../onboarding/review.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "refunds.support.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate` first)",
  );
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  ACQUIRER_FAILURE_RATE: "0",
  ACQUIRER_LATENCY_MIN_MS: "0",
  ACQUIRER_LATENCY_MAX_MS: "1",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = buildApp(config, pool);
const VALID_CARD = { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" };

test.after(async () => {
  await app.close();
  await pool.end();
});

test("a merchant support session cannot POST /v1/refunds", async () => {
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Refund Support ${randomUUID()}`],
  );
  const merchantId = merchant.rows[0]!.id;
  const owner = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, 'owner', 'unused') RETURNING id`,
    [merchantId, `owner-${randomUUID()}@refund-support.test`],
  );
  const support = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, 'support', 'unused') RETURNING id`,
    [merchantId, `support-${randomUUID()}@refund-support.test`],
  );
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const issued = await issueApiKey(pool, config, {
    merchantId,
    createdBy: owner.rows[0]!.id,
    label: "refund-support",
  });

  const authorized = await app.inject({
    method: "POST",
    url: "/v1/transactions",
    headers: { authorization: `Bearer ${issued.rawKey}`, "idempotency-key": randomUUID() },
    payload: { amountFils: 4_000, card: VALID_CARD, reference: "refund-support" },
  });
  assert.equal(authorized.statusCode, 201, authorized.body);
  const txnId = (authorized.json() as { id: string }).id;
  const captured = await app.inject({
    method: "POST",
    url: `/v1/transactions/${txnId}/capture`,
    headers: { authorization: `Bearer ${issued.rawKey}`, "idempotency-key": randomUUID() },
    payload: {},
  });
  assert.equal(captured.statusCode, 200, captured.body);

  const rawToken = randomToken(32);
  await pool.query(
    `INSERT INTO sessions (merchant_user_id, token_hash, authenticated, authenticated_at, expires_at)
     VALUES ($1, $2, true, now(), now() + interval '1 hour')`,
    [support.rows[0]!.id, sha256Hex(rawToken)],
  );
  const cookie = `${config.cookieName}=${rawToken}`;

  const refundRes = await app.inject({
    method: "POST",
    url: "/v1/refunds",
    headers: { cookie, "idempotency-key": randomUUID() },
    payload: { transactionId: txnId },
  });
  assert.equal(refundRes.statusCode, 403, refundRes.body);
  assert.equal(refundRes.json().error, "forbidden");

  const refunds = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM refunds WHERE transaction_id = $1`,
    [txnId],
  );
  assert.equal(refunds.rows[0]!.c, 0);
});
