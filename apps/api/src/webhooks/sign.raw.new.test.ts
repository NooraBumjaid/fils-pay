import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { signRawBody } from "./sign.js";

const SECRET = "whsec_test";

test("signRawBody MACs the exact JSON string that will be posted", () => {
  const body = JSON.stringify({ id: "d1", type: "settlement.paid", data: { b: 2, a: 1 } });
  const { timestamp, signature } = signRawBody(body, SECRET, 1_700_000_000);
  const expected = createHmac("sha256", SECRET).update(`1700000000.${body}`).digest("hex");
  assert.equal(signature, `t=${timestamp},v1=${expected}`);
});
