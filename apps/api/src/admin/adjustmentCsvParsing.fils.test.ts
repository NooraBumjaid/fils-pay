import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAdjustmentAmountFils } from "./adjustmentCsvParsing.js";

test("4.75 BD is 4750 fils, not 475 cents", () => {
  assert.equal(parseAdjustmentAmountFils("4.75"), 4_750);
});

test("4.755 BD keeps the third decimal as 4755 fils, not 4750", () => {
  assert.equal(parseAdjustmentAmountFils("4.755"), 4_755);
});

test("negative BD amounts parse in fils", () => {
  assert.equal(parseAdjustmentAmountFils("-1.250"), -1_250);
});
