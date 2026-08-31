import test from "node:test";
import assert from "node:assert/strict";

import { buildAttackRouteSegment } from "../src/attack-route-renderer.js";

test("attack route geometry stays relative to the duel table", () => {
  const route = buildAttackRouteSegment(
    { left: 100, top: 50, width: 900, height: 600 },
    { left: 240, top: 430, width: 120, height: 160 },
    { left: 660, top: 110, width: 120, height: 160 },
    { targetIndex: 2, active: true }
  );

  assert.equal(route.x, 200);
  assert.equal(route.y, 460);
  assert.equal(route.targetIndex, 2);
  assert.equal(route.active, true);
  assert.equal(Math.round(route.length), 528);
  assert.equal(Math.round(route.angle), -37);
});

test("direct attack routes keep their special target state", () => {
  const route = buildAttackRouteSegment(
    { left: 0, top: 0 },
    { left: 100, top: 300, width: 80, height: 100 },
    { left: 400, top: 20, width: 160, height: 80 },
    { targetIndex: -1, direct: true }
  );

  assert.equal(route.targetIndex, -1);
  assert.equal(route.direct, true);
  assert.ok(route.length > 300);
});
