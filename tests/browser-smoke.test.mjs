import test from "node:test";
import assert from "node:assert/strict";

import { createTestSnapshot } from "../src/browser-smoke.js";

test("builds read-only browser smoke snapshots from live state", () => {
  const state = {
    started: true,
    paused: false,
    turn: "player",
    phase: "main",
    timing: "mainOpen",
    actionWindow: "main",
    scenarioId: "direct",
    soundOn: false,
    voiceOn: false,
    selected: { zone: "playerField", index: 0 },
    gameEvents: [
      { id: 1, type: "CARD_MOVED", playerId: "player", cardId: "star-lancer" },
      { id: 2, type: "TRAP_SET", playerId: "player", cardId: "mirror-snare" }
    ],
    log: ["攻击无效：必须先攻击怪兽。"],
    pendingTarget: null,
    player: {
      lp: 4000,
      shield: 0,
      attacksSkipped: false,
      directAttacks: 1,
      hand: [{ id: "star-breach" }],
      field: [{ id: "star-lancer", uid: "star-lancer-ui", type: "monster", used: false, mode: "attack" }],
      traps: [null]
    },
    ai: {
      lp: 2200,
      shield: 0,
      hand: [{ id: "solar-knight" }],
      field: [{ id: "iron-guardian" }],
      traps: [null]
    }
  };
  const els = {
    chainModal: { classList: { contains: () => true } },
    chainText: { textContent: "是否发动陷阱" }
  };
  const snapshot = createTestSnapshot({
    testMode: true,
    state,
    els,
    currentPlayerActions: () => ({ attack: true, spell: false })
  })();

  assert.equal(snapshot.mode, "test");
  assert.equal(snapshot.currentPlayer, "player");
  assert.equal(snapshot.gameEventCount, 2);
  assert.deepEqual(snapshot.latestGameEvents, ["CARD_MOVED", "TRAP_SET"]);
  assert.equal(snapshot.latestGameEventDetails.at(-1).cardId, "mirror-snare");
  assert.equal(snapshot.latestLog, "攻击无效：必须先攻击怪兽。");
  assert.equal(snapshot.machine.phase, "main");
  assert.equal(snapshot.machine.chainLength, 0);
  assert.equal(snapshot.selectedCard.id, "star-lancer");
  assert.equal(snapshot.selection.pendingKind, "");
  assert.equal(snapshot.selection.conflicted, false);
  assert.equal(snapshot.activePlayerMonsters[0].canAttack, true);
  assert.equal(snapshot.controls.skipAttackButtonDisabled, false);
  assert.equal(snapshot.player.directAttacks, 1);
  assert.deepEqual(snapshot.player.hand, ["star-breach"]);
  assert.deepEqual(snapshot.ai.field, ["iron-guardian"]);
  assert.equal(snapshot.chain.open, true);
  assert.deepEqual(snapshot.actions, { attack: true, spell: false });
  assert.equal(snapshot.audit.ok, true);
});
