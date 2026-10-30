import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

test("0055 chart account inserts match the frozen chart_of_accounts schema", () => {
  const schema = readFileSync(join(migrationsDir, "0007_ledger_double_entry.sql"), "utf8");
  const migration = readFileSync(join(migrationsDir, "0055_chart_of_accounts_suspense.sql"), "utf8");

  assert.match(schema, /CREATE TABLE chart_of_accounts\s*\(\s*id\s+TEXT PRIMARY KEY[\s\S]*?kind\s+TEXT NOT NULL CHECK \(kind IN \('asset', 'liability', 'revenue'\)\)/);
  assert.match(migration, /INSERT INTO chart_of_accounts \(id, name, kind\)/);
  assert.match(migration, /ON CONFLICT \(id\) DO NOTHING/);
  assert.doesNotMatch(migration, /\b(code|account_type|description)\b/);
});

test("0072 refund summary joins refunds to their owning transaction", () => {
  const migration = readFileSync(join(migrationsDir, "0072_refund_merchant_summary.sql"), "utf8");

  assert.match(migration, /JOIN transactions t ON t\.id = r\.transaction_id/);
  assert.doesNotMatch(migration, /JOIN transactions t ON t\.id = r\.id\b/);
});

test("Compose has buildable service images and does not publish Postgres off-host", () => {
  const compose = readFileSync(join(migrationsDir, "..", "..", "ops", "docker-compose.yml"), "utf8");
  const opsDir = join(migrationsDir, "..", "..", "ops");

  assert.ok(readFileSync(join(opsDir, "Dockerfile.node"), "utf8").length > 0);
  assert.ok(readFileSync(join(opsDir, "Dockerfile.go"), "utf8").length > 0);
  assert.match(compose, /127\.0\.0\.1:5432:5432/);
  assert.doesNotMatch(compose, /"5432:5432"/);
  assert.match(compose, /env_file:\s*\n\s*- \.env\.docker/);
  assert.doesNotMatch(compose, /filspay_dev_password/);
  assert.match(compose, /POSTGRES_PASSWORD must be set/);
});
