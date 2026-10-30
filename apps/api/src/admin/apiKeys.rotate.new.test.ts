/**
 * Rotation must schedule the previous key for revocation (0056 / YA:
 * rotate = revoke) while leaving a 24h overlap so locked tests that
 * authenticate immediately after rotate still pass.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { loadConfig } from "../config.js";
import { issueApiKey } from "../apiKeys/issue.js";
import { verifyApiKey } from "../apiKeys/verify.js";
import { rotateApiKeyAsAdmin } from "./apiKeys.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "apiKeys.rotate.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate` first)",
  );
}

const config = loadConfig({ DATABASE_URL: databaseUrl, NODE_ENV: "test" });
const pool = new Pool({ connectionString: databaseUrl, max: 5 });

test.after(async () => {
  await pool.end();
});

async function createMerchantAndAdmin(): Promise<{ merchantId: string; ownerUserId: string; adminUserId: string }> {
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Rotate Grace ${randomUUID()}`],
  );
  const merchantId = merchant.rows[0]!.id;
  const owner = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, 'owner', 'unused') RETURNING id`,
    [merchantId, `owner-${randomUUID()}@rotate.test`],
  );
  const admin = await pool.query<{ id: string }>(
    `INSERT INTO admin_users (email, password_hash, display_name, role)
     VALUES ($1, 'not-a-hash', 'Finance', 'finance') RETURNING id`,
    [`finance-${randomUUID()}@admin.test`],
  );
  return { merchantId, ownerUserId: owner.rows[0]!.id, adminUserId: admin.rows[0]!.id };
}

test("rotation schedules the previous key to expire after 24 hours without cutting it off immediately", async () => {
  const { merchantId, ownerUserId, adminUserId } = await createMerchantAndAdmin();
  const original = await issueApiKey(pool, config, { merchantId, createdBy: ownerUserId, label: "original" });

  await rotateApiKeyAsAdmin(pool, config, {
    merchantId,
    apiKeyId: original.id,
    adminUserId,
  });

  const stillValid = await verifyApiKey(pool, original.rawKey);
  assert.ok(stillValid, "overlap window: previous key still authenticates");

  const row = await pool.query<{ revoke_after: Date | null; revoked_at: Date | null }>(
    `SELECT revoke_after, revoked_at FROM api_keys WHERE id = $1`,
    [original.id],
  );
  assert.equal(row.rows[0]!.revoked_at, null);
  assert.ok(row.rows[0]!.revoke_after, "revoke_after must be set");
  const delayMs = row.rows[0]!.revoke_after!.getTime() - Date.now();
  assert.ok(delayMs > 23 * 60 * 60 * 1000 && delayMs < 25 * 60 * 60 * 1000, `expected ~24h, got ${delayMs}ms`);
});

test("a key whose revoke_after has passed no longer authenticates", async () => {
  const { merchantId, ownerUserId } = await createMerchantAndAdmin();
  const issued = await issueApiKey(pool, config, { merchantId, createdBy: ownerUserId, label: "expired-grace" });

  await pool.query(`UPDATE api_keys SET revoke_after = now() - interval '1 second' WHERE id = $1`, [issued.id]);

  assert.equal(await verifyApiKey(pool, issued.rawKey), null);
});
