import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDevApiBase, resolveProductionApiBase } from "./apiBase.js";

test("production API base is same-origin and ignores localhost overrides", () => {
  assert.equal(resolveProductionApiBase(undefined), "");
  assert.equal(resolveProductionApiBase(""), "");
  assert.equal(resolveProductionApiBase("/"), "");
  assert.equal(resolveProductionApiBase("http://localhost:3000"), "");
  assert.equal(resolveProductionApiBase("http://127.0.0.1:3000"), "");
  assert.equal(resolveProductionApiBase("http://localhost:3000/"), "");
  assert.equal(resolveProductionApiBase("https://api.example.test"), "https://api.example.test");
});

test("dev API base keeps localhost:3000 unless overridden", () => {
  assert.equal(resolveDevApiBase(undefined), "http://localhost:3000");
  assert.equal(resolveDevApiBase(""), "http://localhost:3000");
  assert.equal(resolveDevApiBase("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
});
