import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.js";

const productionEnv = () => ({
  DATABASE_URL: "postgres://localhost/filspay",
  NODE_ENV: "production",
  SETTLEMENT_INTERNAL_TOKEN: "test-settlement-token",
  ACQUIRER_CALLBACK_SIGNING_SECRET: "test-acquirer-secret",
  WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
});

test("production requires signed acquirer callbacks by default", () => {
  assert.equal(loadConfig(productionEnv()).acquirerCallbackRequireSignature, true);
});

test("development keeps callback signature enforcement configurable", () => {
  const development = loadConfig({ DATABASE_URL: "postgres://localhost/filspay", NODE_ENV: "development" });
  assert.equal(development.acquirerCallbackRequireSignature, false);
  assert.equal(Buffer.from(development.webhookSecretEncryptionKey, "base64").length, 32);
  assert.equal(
    loadConfig({ ...productionEnv(), ACQUIRER_CALLBACK_REQUIRE_SIGNATURE: "false" }).acquirerCallbackRequireSignature,
    false,
  );
});
