import test from "node:test";
import assert from "node:assert/strict";

import { buildDuelControlsView } from "../src/control-renderer.js";

test("setup modal keeps the header start action blocked and reflects media settings", () => {
  const view = buildDuelControlsView({
    setupModalOpen: true,
    soundOn: false,
    musicOn: true,
    musicMode: "critical",
    musicPlaying: true,
    musicVolume: 0.42,
    voiceOn: false
  });

  assert.deepEqual(view.start, {
    disabled: true,
    title: "请点击准备面板里的开始决斗"
  });
  assert.equal(view.pause.disabled, true);
  assert.deepEqual(view.sound, { text: "音效 关", off: true });
  assert.equal(view.music.text, "音乐 紧张");
  assert.equal(view.music.critical, true);
  assert.equal(view.music.playing, true);
  assert.equal(view.music.volumePercent, 42);
  assert.deepEqual(view.voice, { text: "语音 关", off: true });
});

test("open battle window enables manual turn controls without a pending selection", () => {
  const view = buildDuelControlsView({
    started: true,
    actions: { attack: true },
    canUseTurnControls: true,
    canAct: true,
    selectedHandReady: true,
    selectedHandName: "战意高扬",
    selectedHandReason: "再次点击即可发动",
    confirmLabel: "发动魔法",
    phase: "main",
    selectedPlayerMonster: true,
    focusedCard: { id: "war-chant" }
  });

  assert.equal(view.start.disabled, true);
  assert.equal(view.pause.disabled, false);
  assert.equal(view.skipAttack.disabled, false);
  assert.equal(view.endTurn.disabled, false);
  assert.deepEqual(view.hand, {
    confirmText: "发动魔法",
    confirmDisabled: false,
    cancelText: "取消选择",
    cancelDisabled: false
  });
  assert.equal(view.choice.hidden, false);
  assert.equal(view.choice.text, "战意高扬：再次点击即可发动");
  assert.equal(view.modeDisabled, false);
  assert.equal(view.detailDisabled, false);
});

test("target and fusion selections block turn controls and expose the correct prompt", () => {
  const target = buildDuelControlsView({
    started: true,
    actions: { attack: true },
    canUseTurnControls: true,
    canAct: true,
    pendingTarget: { cardName: "破阵星芒" },
    targetPrompt: "选择对方攻击力最高怪兽。"
  });

  assert.equal(target.skipAttack.disabled, true);
  assert.equal(target.endTurn.disabled, true);
  assert.equal(target.hand.confirmText, "确认推荐目标");
  assert.equal(target.hand.confirmDisabled, false);
  assert.equal(target.choice.text, "选择对方攻击力最高怪兽。 请点击高亮目标；也可点击“确认推荐目标”自动选择。");
  assert.equal(target.choice.target, true);

  const fusion = buildDuelControlsView({
    started: true,
    canAct: true,
    pendingFusion: { cardName: "星魂融合" },
    fusionStatus: {
      needsResult: false,
      selectedCount: 1,
      requiredCount: 2
    }
  });

  assert.equal(fusion.choice.hidden, false);
  assert.equal(fusion.choice.target, false);
  assert.equal(fusion.choice.fusion, true);
  assert.equal(fusion.choice.material, true);
  assert.equal(fusion.choice.text, "星魂融合：选择融合素材 1/2。");
});
