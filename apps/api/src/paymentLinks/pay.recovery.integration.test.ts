import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool, type Pool as PoolType } from "pg";
import { toFils } from "@filspay/money";
import { recordKycReview } from "../onboarding/review.js";
import { issueApiKey } from "../apiKeys/issue.js";
import { loadConfig } from "../config.js";
import type { AcquirerSimulator } from "../acquirer/types.js";
import { authorizeTransaction } from "../payments/authorize.js";
import { captureTransaction } from "../payments/capture.js";
import { payPaymentLink } from "./pay.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("pay.recovery.integration.test.ts requires DATABASE_URL and a migrated Postgres");
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token",
  ACQUIRER_FAILURE_RATE: "0",
  ACQUIRER_LATENCY_MIN_MS: "0",
  ACQUIRER_LATENCY_MAX_MS: "1",
  PAYMENT_LINK_RESERVATION_TIMEOUT_SECONDS: "60",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});
const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const acquirer: AcquirerSimulator = {
  async authorize(req) {
    return { outcome: "approved", acquirerReference: `recovery_${req.idempotencyKey}`, latencyMs: 0 };
  },
  async capture(req) {
    return { outcome: "approved", acquirerReference: req.acquirerReference, latencyMs: 0 };
  },
  async refund(req) {
    return { outcome: "approved", acquirerReference: req.acquirerReference, latencyMs: 0 };
  },
};

test.after(async () => pool.end());

test("a new client key after capture crash replays the stored payment attempt", async () => {
  const suffix = randomUUID();
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Pay link recovery ${suffix}`],
  );
  const merchantId = merchant.rows[0]!.id;
  const user = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, 'owner', 'unused') RETURNING id`,
    [merchantId, `paylink-recovery-${suffix}@example.test`],
  );
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const apiKey = await issueApiKey(pool, config, {
    merchantId,
    createdBy: user.rows[0]!.id,
    label: "payment recovery test",
  });
  const token = `plink_${suffix.replaceAll("-", "")}`;
  const link = await pool.query<{ id: string; amount_fils: string }>(
    `INSERT INTO payment_links
       (merchant_id, token, amount_fils, reference, expires_at, created_by_type, created_by_id)
     VALUES ($1, $2, 3300, $3, now() + interval '1 hour', 'merchant_api_key', $4)
     RETURNING id, amount_fils`,
    [merchantId, token, `recovery-${suffix}`, apiKey.id],
  );
  const linkId = link.rows[0]!.id;
  const originalClientKey = `initial-${suffix}`;
  const attemptKey = `paylink:${linkId}:${originalClientKey}`;
  const reservationId = randomUUID();

  // Reproduce a crash after capture committed but before the link finalize.
  await pool.query(
    `UPDATE payment_links
        SET status = 'reserved', reserved_at = now() - interval '2 minutes',
            payment_attempt_key = $2, reservation_id = $3
      WHERE id = $1`,
    [linkId, originalClientKey, reservationId],
  );
  const authorized = await authorizeTransaction(pool, acquirer, {
    merchantId,
    amountFils: toFils(Number(link.rows[0]!.amount_fils)),
    card: { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" },
    reference: `recovery-${suffix}`,
    idempotencyKey: `${attemptKey}:authorize`,
    actor: { type: "system" },
  });
  assert.equal(authorized.statusCode, 201);
  const transactionId = (authorized.body as { id: string }).id;
  const captured = await captureTransaction(pool, acquirer, {
    transactionId,
    merchantId,
    idempotencyKey: `${attemptKey}:capture`,
    actor: { type: "system", id: linkId },
  });
  assert.equal(captured.statusCode, 200);

  let shouldCrash = true;
  const crashPool = new Proxy(pool, {
    get(target, property) {
      if (property === "query") {
        return (...args: unknown[]) => {
          const statement = typeof args[0] === "string" ? args[0] : "";
          if (shouldCrash && statement.includes("SET status = 'paid'")) {
            shouldCrash = false;
            throw new Error("simulated process crash before payment-link finalize");
          }
          return target.query(...(args as Parameters<PoolType["query"]>));
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as PoolType;

  await assert.rejects(
    payPaymentLink(crashPool, acquirer, { paymentLinkReservationTimeoutSeconds: 1 }, {
      token,
      card: { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" },
      idempotencyKey: originalClientKey,
    }),
    /simulated process crash/,
  );

  // The in-flight worker refreshed reserved_at before crashing. A second
  // client cannot steal the lease until that reservation times out.
  await new Promise((resolve) => setTimeout(resolve, 1_100));

  const recovered = await payPaymentLink(pool, acquirer, { paymentLinkReservationTimeoutSeconds: 1 }, {
    token,
    card: { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" },
    idempotencyKey: `retry-with-new-key-${suffix}`,
  });
  assert.equal(recovered.statusCode, 200, JSON.stringify(recovered.body));
  assert.equal((recovered.body as { transactionId: string }).transactionId, transactionId);

  const transactionCount = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM transactions WHERE merchant_id = $1`,
    [merchantId],
  );
  assert.equal(Number(transactionCount.rows[0]!.count), 1);
  const finalLink = await pool.query<{ status: string; transaction_id: string }>(
    `SELECT status, transaction_id FROM payment_links WHERE id = $1`,
    [linkId],
  );
  assert.equal(finalLink.rows[0]!.status, "paid");
  assert.equal(finalLink.rows[0]!.transaction_id, transactionId);
});
