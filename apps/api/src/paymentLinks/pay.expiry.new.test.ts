import assert from "node:assert/strict";
import { test } from "node:test";
import { expiryReferenceTime } from "./pay.js";

test("submittedAt in the past is a client clock, not an expiry bypass token", () => {
  const past = "2020-01-01T00:00:00.000Z";
  const resolved = expiryReferenceTime(past);
  assert.equal(resolved.toISOString(), past);
});
