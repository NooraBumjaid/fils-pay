/**
 * Impersonation is read-only except super_admin (mapped to owner).
 * Capture/void/refund have no requireMerchantRole, so the writer actor is
 * the grant write gate.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenError } from "../lib/errors.js";
import { requireMerchantWriterActor, type MerchantAuthContext } from "./requireMerchantAuth.js";

function auth(overrides: Partial<MerchantAuthContext>): MerchantAuthContext {
  return {
    merchantId: "00000000-0000-4000-8000-000000000001",
    actorType: "merchant_session",
    actorId: "00000000-0000-4000-8000-000000000002",
    role: "owner",
    ...overrides,
  };
}

test("support impersonation cannot be resolved as a writer", () => {
  assert.throws(
    () =>
      requireMerchantWriterActor(
        auth({ actorType: "admin_impersonation", role: "support" }),
      ),
    (err: unknown) => err instanceof ForbiddenError && err.code === "forbidden",
  );
});

test("finance impersonation cannot be resolved as a writer", () => {
  assert.throws(
    () =>
      requireMerchantWriterActor(
        auth({ actorType: "admin_impersonation", role: "finance" }),
      ),
    (err: unknown) => err instanceof ForbiddenError && err.code === "forbidden",
  );
});

test("super_admin impersonation mapped to owner may write as merchant_session", () => {
  const actor = requireMerchantWriterActor(
    auth({ actorType: "admin_impersonation", role: "owner", actorId: "grant-id" }),
  );
  assert.deepEqual(actor, { type: "merchant_session", id: "grant-id" });
});

test("a real merchant support session may still write (capture/void exception)", () => {
  const actor = requireMerchantWriterActor(auth({ role: "support" }));
  assert.equal(actor.type, "merchant_session");
});

test("an API key is always a writer", () => {
  const actor = requireMerchantWriterActor(
    auth({ actorType: "merchant_api_key", role: null, actorId: "key-id" }),
  );
  assert.deepEqual(actor, { type: "merchant_api_key", id: "key-id" });
});
