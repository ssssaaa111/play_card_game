import test from "node:test";
import assert from "node:assert/strict";

import {
  canActivateTrapResponse,
  createTrapResponse,
  resolveTrapResponse,
  selectTrapResponse
} from "../src/response-state.js";

function trap(name) {
  return { type: "trap", name };
}

test("creates serializable trap response choices with unique candidates", () => {
  const response = createTrapResponse({
    eventName: "attack",
    details: { attackerIndex: 1 },
    candidates: [{ index: 2 }, { index: 2 }, { index: -1 }, {}, { index: 0 }]
  });

  assert.deepEqual(response, {
    owner: "player",
    eventName: "attack",
    details: { attackerIndex: 1 },
    trapIndexes: [2, 0],
    selectedIndex: -1
  });
  assert.doesNotThrow(() => structuredClone(response));
});

test("auto-selects one candidate and only selects legal trap indexes", () => {
  const single = createTrapResponse({ eventName: "direct", candidates: [{ index: 1 }] });
  assert.equal(single.selectedIndex, 1);

  const response = createTrapResponse({ eventName: "attack", candidates: [{ index: 0 }, { index: 2 }] });
  const selected = selectTrapResponse(response, 2);

  assert.equal(response.selectedIndex, -1);
  assert.equal(selected.selectedIndex, 2);
  assert.equal(selectTrapResponse(response, 1), null);
});

test("resolves activation or decline from the selected live trap", () => {
  const traps = [trap("镜光反制"), null, trap("星界封锁")];
  const response = selectTrapResponse(
    createTrapResponse({ eventName: "attack", candidates: [{ index: 0 }, { index: 2 }] }),
    2
  );

  assert.equal(canActivateTrapResponse(response, traps), true);
  assert.deepEqual(resolveTrapResponse(response, true, traps), {
    ok: true,
    trapIndex: 2,
    skippedName: "星界封锁"
  });
  assert.deepEqual(resolveTrapResponse(response, false, traps), {
    ok: true,
    trapIndex: -1,
    skippedName: "星界封锁"
  });
});

test("rejects activation when selection is missing or the trap left its slot", () => {
  const response = createTrapResponse({ eventName: "attack", candidates: [{ index: 0 }, { index: 2 }] });
  const selected = selectTrapResponse(response, 2);

  assert.equal(canActivateTrapResponse(response, [trap("镜光反制"), null, trap("星界封锁")]), false);
  assert.deepEqual(resolveTrapResponse(response, true, [trap("镜光反制"), null, trap("星界封锁")]), {
    ok: false,
    reason: "missing-selection",
    trapIndex: -1,
    skippedName: ""
  });
  assert.equal(canActivateTrapResponse(selected, [trap("镜光反制"), null, null]), false);
  assert.deepEqual(resolveTrapResponse(selected, true, [trap("镜光反制"), null, null]), {
    ok: false,
    reason: "missing-trap",
    trapIndex: -1,
    skippedName: ""
  });
});
