/**
 * A support impersonation grant must not capture, void, or refund.
 * Those routes have no requireMerchantRole; the writer actor is the gate.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "../adminAuth/passwords.js";
import { issueApiKey } from "../apiKeys/issue.js";
import { recordKycReview } from "../onboarding/review.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "impersonation.write.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate` first)",
  );
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  OTP_DEV_EXPOSE: "true",
  ACQUIRER_FAILURE_RATE: "0",
  ACQUIRER_LATENCY_MIN_MS: "0",
  ACQUIRER_LATENCY_MAX_MS: "1",
  SETTLEMENT_INTERNAL_TOKEN: "test-settlement-token",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = buildApp(config, pool);
const ADMIN_PASSWORD = "admin-test-password-9000!";
let cachedHash: string | null = null;
const VALID_CARD = { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" };

test.after(async () => {
  await app.close();
  await pool.end();
});

function parseCookie(setCookieHeader: string | string[] | undefined, name: string): string {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const header of headers) {
    if (header && header.startsWith(`${name}=`)) {
      return header.split(";")[0] as string;
    }
  }
  throw new Error(`expected a Set-Cookie header for ${name}`);
}

async function signedInSupport(): Promise<string> {
  cachedHash ??= await hashPassword(ADMIN_PASSWORD, config);
  const email = `imp-write-${randomUUID()}@admin.test`;
  await pool.query(
    `INSERT INTO admin_users (email, password_hash, display_name, role) VALUES ($1, $2, $3, 'support')`,
    [email, cachedHash, "Support"],
  );
  const loginRes = await app.inject({
    method: "POST",
    url: "/v1/admin/auth/login",
    payload: { email, password: ADMIN_PASSWORD },
  });
  const loginBody = loginRes.json() as { devOtpCode?: string };
  const cookie = parseCookie(loginRes.headers["set-cookie"], config.adminCookieName);
  const verifyRes = await app.inject({
    method: "POST",
    url: "/v1/admin/auth/otp/verify",
    headers: { cookie },
    payload: { code: loginBody.devOtpCode },
  });
  assert.equal(verifyRes.statusCode, 200, verifyRes.body);
  return cookie;
}

async function approvedMerchantWithKey(): Promise<{ merchantId: string; rawKey: string }> {
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Imp Write ${randomUUID()}`],
  );
  const merchantId = merchant.rows[0]!.id;
  const owner = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, 'owner', 'unused') RETURNING id`,
    [merchantId, `owner-${randomUUID()}@impwrite.test`],
  );
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const issued = await issueApiKey(pool, config, {
    merchantId,
    createdBy: owner.rows[0]!.id,
    label: "imp-write",
  });
  return { merchantId, rawKey: issued.rawKey };
}

async function impersonationCookie(adminCookie: string, merchantId: string): Promise<string> {
  const startRes = await app.inject({
    method: "POST",
    url: `/v1/admin/merchants/${merchantId}/impersonate`,
    headers: { cookie: adminCookie },
  });
  assert.equal(startRes.statusCode, 201, startRes.body);
  return parseCookie(startRes.headers["set-cookie"], config.impersonationCookieName);
}

test("support impersonation cannot capture, void, or refund", async () => {
  const adminCookie = await signedInSupport();
  const { merchantId, rawKey } = await approvedMerchantWithKey();
  const impCookie = await impersonationCookie(adminCookie, merchantId);

  const authorized = await app.inject({
    method: "POST",
    url: "/v1/transactions",
    headers: { authorization: `Bearer ${rawKey}`, "idempotency-key": randomUUID() },
    payload: { amountFils: 5_000, card: VALID_CARD, reference: "imp-write" },
  });
  assert.equal(authorized.statusCode, 201, authorized.body);
  const txnId = (authorized.json() as { id: string }).id;

  const captureRes = await app.inject({
    method: "POST",
    url: `/v1/transactions/${txnId}/capture`,
    headers: { cookie: impCookie, "idempotency-key": randomUUID() },
    payload: {},
  });
  assert.equal(captureRes.statusCode, 403, captureRes.body);
  assert.equal(captureRes.json().error, "forbidden");

  const voidRes = await app.inject({
    method: "POST",
    url: `/v1/transactions/${txnId}/void`,
    headers: { cookie: impCookie },
  });
  assert.equal(voidRes.statusCode, 403, voidRes.body);
  assert.equal(voidRes.json().error, "forbidden");

  const captured = await app.inject({
    method: "POST",
    url: `/v1/transactions/${txnId}/capture`,
    headers: { authorization: `Bearer ${rawKey}`, "idempotency-key": randomUUID() },
    payload: {},
  });
  assert.equal(captured.statusCode, 200, captured.body);

  const refundRes = await app.inject({
    method: "POST",
    url: "/v1/refunds",
    headers: { cookie: impCookie, "idempotency-key": randomUUID() },
    payload: { transactionId: txnId },
  });
  assert.equal(refundRes.statusCode, 403, refundRes.body);
  assert.equal(refundRes.json().error, "forbidden");

  const stillCaptured = await pool.query<{ status: string }>(
    `SELECT status FROM transactions WHERE id = $1`,
    [txnId],
  );
  assert.equal(stillCaptured.rows[0]!.status, "captured");
});
