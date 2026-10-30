/**
 * Two overlapping dispatch passes must send a due delivery only once.
 * SKIP LOCKED plus a short claim lease covers the in-flight HTTP window.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { enqueueEvent } from "@filspay/events";
import { loadConfig } from "../config.js";
import { createWebhookEndpoint } from "./create.js";
import { runDispatchPass } from "./dispatcher.js";
import type { WebhookTransport } from "./transport.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "dispatcher.skipLocked.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate` first)",
  );
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
  WEBHOOK_MAX_ATTEMPTS: "3",
  WEBHOOK_BACKOFF_BASE_MS: "1000",
  WEBHOOK_BACKOFF_CAP_MS: "60000",
  WEBHOOK_REQUEST_TIMEOUT_MS: "5000",
});

const pool = new Pool({ connectionString: databaseUrl, max: 5 });

test.after(async () => {
  await pool.end();
});

test("overlapping dispatch passes deliver a pending row only once", async () => {
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, $2) RETURNING id`,
    [`Skip Locked Merchant ${randomUUID()}`, 250],
  );
  const merchantId = merchant.rows[0]!.id;
  const url = `http://skip-locked.test/webhook-${randomUUID()}`;
  await createWebhookEndpoint(pool, config, {
    merchantId,
    url,
    createdByType: "merchant_session",
    createdById: randomUUID(),
  });
  await enqueueEvent(pool, {
    eventType: "transaction.captured",
    aggregateType: "transaction",
    aggregateId: randomUUID(),
    payload: {
      merchantId,
      amountCapturedFils: 4_750,
      feeFils: 71,
      newStatus: "captured",
      capturedTotalFils: 4_750,
    },
  });

  let calls = 0;
  let releaseFirst: (() => void) | undefined;
  const firstEntered = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const holdFirst = new Promise<void>((resolve) => {
    setTimeout(resolve, 400);
  });

  const transport: WebhookTransport = async (req) => {
    if (req.url !== url) return { statusCode: 200, body: "ok" };
    calls += 1;
    releaseFirst?.();
    await holdFirst;
    return { statusCode: 200, body: "ok" };
  };

  const first = runDispatchPass(pool, transport, config);
  await firstEntered;
  const second = runDispatchPass(pool, transport, config);
  await Promise.all([first, second]);

  assert.equal(calls, 1);
});
