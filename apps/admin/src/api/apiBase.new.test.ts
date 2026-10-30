import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveDevApiBase,
  resolveDevWebBase,
  resolveProductionApiBase,
  resolveProductionWebBase,
} from "./apiBase.js";

test("production admin API base is same-origin and ignores localhost overrides", () => {
  assert.equal(resolveProductionApiBase(undefined), "");
  assert.equal(resolveProductionApiBase("http://localhost:3000"), "");
  assert.equal(resolveProductionApiBase("http://127.0.0.1:3000"), "");
  assert.equal(resolveProductionWebBase(undefined), "/");
  assert.equal(resolveProductionWebBase("http://localhost:5173"), "/");
});

test("dev admin API base keeps loopback defaults", () => {
  assert.equal(resolveDevApiBase(undefined), "http://localhost:3000");
  assert.equal(resolveDevWebBase(undefined), "http://localhost:5173");
});
