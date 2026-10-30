import assert from "node:assert/strict";
import { test } from "node:test";
import type { PoolClient } from "pg";
import { reconcileSandboxFlag } from "./merchantFlags.js";

test("status recomputation never promotes a test merchant into live settlement", async () => {
  const client = {
    query: async () => {
      throw new Error("reconcileSandboxFlag must not change merchant flags");
    },
  } as unknown as PoolClient;

  const updated = await reconcileSandboxFlag(client, "merchant-id", { scanned: 3, openAuthorizations: 0 });
  assert.deepEqual(updated, []);
});
