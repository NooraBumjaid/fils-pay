/**
 * commercial_registration must be PDF bytes, not a JPEG renamed to .pdf.
 * Filename-only checks let a photo through as a registry certificate.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Pool } from "pg";
import { loadConfig } from "../config.js";
import { UnprocessableEntityError } from "../lib/errors.js";
import { recordKycDocument } from "./kyc.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "kyc.pdfOnly.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres (run `npm run migrate` first)",
  );
}

const kycUploadDir = mkdtempSync(join(tmpdir(), "filspay-kyc-pdfonly-"));
const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  KYC_UPLOAD_DIR: kycUploadDir,
});
const pool = new Pool({ connectionString: databaseUrl, max: 3 });

test.after(async () => {
  await pool.end();
  await rm(kycUploadDir, { recursive: true, force: true });
});

test("commercial_registration rejects a JPEG whose filename ends in .pdf", async () => {
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Kyc PdfOnly ${randomUUID()}`],
  );
  const owner = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, 'owner', 'unused') RETURNING id`,
    [merchant.rows[0]!.id, `owner-${randomUUID()}@kyc-pdfonly.test`],
  );

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  await assert.rejects(
    () =>
      recordKycDocument(pool, config, {
        merchantId: merchant.rows[0]!.id,
        documentType: "commercial_registration",
        fileName: "CR-2026.pdf",
        buffer: jpeg,
        uploadedBy: owner.rows[0]!.id,
      }),
    (err: unknown) => err instanceof UnprocessableEntityError && err.code === "document_must_be_pdf",
  );
});
