/**
 * A disabled admin must not keep viewing a merchant through an open grant.
 * There is no disable-trigger on impersonation_grants; lookup must check status.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { lookupImpersonationGrant, startImpersonation } from "./impersonation.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "impersonation.disabled.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate` first)",
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 5 });

test.after(async () => {
  await pool.end();
});

test("lookupImpersonationGrant returns null after the admin account is disabled", async () => {
  const admin = await pool.query<{ id: string }>(
    `INSERT INTO admin_users (email, password_hash, display_name, role)
     VALUES ($1, 'not-a-hash', 'Support', 'support') RETURNING id`,
    [`impersonate-${randomUUID()}@admin.test`],
  );
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Impersonate ${randomUUID()}`],
  );
  const started = await startImpersonation(pool, {
    adminUserId: admin.rows[0]!.id,
    merchantId: merchant.rows[0]!.id,
    ttlMinutes: 15,
  });

  const before = await lookupImpersonationGrant(pool, started.rawToken);
  assert.ok(before);
  assert.equal(before.merchantId, merchant.rows[0]!.id);

  await pool.query(`UPDATE admin_users SET status = 'disabled' WHERE id = $1`, [admin.rows[0]!.id]);

  assert.equal(await lookupImpersonationGrant(pool, started.rawToken), null);
});
