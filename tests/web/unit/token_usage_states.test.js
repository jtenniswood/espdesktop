"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");
const cases = require("../../../compatibility/fixtures/token_usage_states.json");

test("Token Usage matches the display states for old and current readings", () => {
  const { allowanceState, allowanceTileText } = loadTypeScriptModule("src/webserver/model/token_usage_state.ts");
  for (const { name, connected, now, observedAt, resetsAt, state } of cases) {
    assert.equal(allowanceState(connected, now, observedAt, resetsAt), state, name);
    const { value, detail } = allowanceTileText(41, connected, now, observedAt, resetsAt);
    if (state === "last_known") assert.deepEqual({ value, detail }, { value: "41% left", detail: "Last known" }, name);
    if (state === "available") assert.equal(detail, "", name);
    if (state === "countdown") assert.equal(detail, "Resets 2h", name);
  }
});
