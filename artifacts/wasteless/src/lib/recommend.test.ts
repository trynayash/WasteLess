import assert from "node:assert/strict";
import test from "node:test";
import { recommendFromKind } from "./recommend";

test("manual fallback gives batteries a safe recycle path", () => {
  const result = recommendFromKind("battery", "broken");

  assert.equal(result.identified, true);
  assert.equal(result.best_option, "recycle");
  assert.match(result.warning ?? "", /ignite|shorted|household waste/i);
  assert.equal(result.steps.length, 4);
  assert.deepEqual(
    result.other_options.map((option) => option.type),
    ["reuse", "donate", "sell"],
  );
});

test("manual fallback is deterministic for the same item and condition", () => {
  const first = recommendFromKind("clothing", "needs_repair");
  const second = recommendFromKind("clothing", "needs_repair");

  assert.deepEqual(second, first);
  assert.equal(first.best_option, "donate");
  assert.match(first.condition_check.if_good, /mend|donation/i);
});