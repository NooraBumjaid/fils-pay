import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCheckoutUrl } from "./serialize.js";

test("buildCheckoutUrl mints /pay/:token on the configured public origin", () => {
  assert.equal(
    buildCheckoutUrl("http://example.test", "tok_abc"),
    "http://example.test/pay/tok_abc",
  );
});

test("buildCheckoutUrl does not inject localhost when given a public base", () => {
  const url = buildCheckoutUrl("http://203.0.113.10", "tok_abc");
  assert.equal(url.includes("localhost"), false);
  assert.equal(url.includes("5173"), false);
});
