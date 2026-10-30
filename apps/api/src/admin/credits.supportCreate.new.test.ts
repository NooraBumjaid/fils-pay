/**
 * Creating a credit posts money when it is under the threshold.
 * Migration 0031: money-adjacent admin writes are finance/super_admin.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "../adminAuth/passwords.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "credits.supportCreate.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate` first)",
  );
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  OTP_DEV_EXPOSE: "true",
  SETTLEMENT_INTERNAL_TOKEN: "test-settlement-token",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = buildApp(config, pool);
const ADMIN_PASSWORD = "admin-test-password-9000!";
let cachedHash: string | null = null;

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

async function signedIn(role: "support" | "finance"): Promise<string> {
  cachedHash ??= await hashPassword(ADMIN_PASSWORD, config);
  const email = `${role}-${randomUUID()}@admin.test`;
  await pool.query(
    `INSERT INTO admin_users (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4)`,
    [email, cachedHash, role, role],
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

test("a support admin cannot create a credit that would post merchant payable", async () => {
  const cookie = await signedIn("support");
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Support Credit ${randomUUID()}`],
  );
  const res = await app.inject({
    method: "POST",
    url: `/v1/admin/merchants/${merchant.rows[0]!.id}/credits`,
    headers: { cookie },
    payload: {
      reasonCode: "goodwill",
      effectiveDate: new Date().toISOString().slice(0, 10),
      baseAmountFils: 10_000,
    },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "forbidden");
});
