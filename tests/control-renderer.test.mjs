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
    selectedPlayerMonsterName: "赤焰幼龙",
    selectedPlayerMonsterMode: "attack",
    selectedPlayerMonsterCanAttack: true,
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
  assert.deepEqual(view.fieldAction, {
    hidden: false,
    name: "赤焰幼龙",
    status: "可攻击 · 选择目标",
    attack: {
      disabled: false,
      text: "攻击",
      title: "选择攻击目标"
    },
    detailDisabled: false
  });
  assert.deepEqual(view.fieldMode, {
    hidden: false,
    disabled: false,
    text: "转守备",
    title: "切换所选怪兽的攻击／守备表示",
    defense: false
  });
  assert.equal(view.detailDisabled, false);
});

test("mode button is disabled after the selected monster already changed position", () => {
  const view = buildDuelControlsView({
    started: true,
    canAct: true,
    phase: "main",
    selectedPlayerMonster: true,
    selectedPlayerMonsterName: "铁壁守卫",
    selectedPlayerMonsterMode: "defense",
    selectedPlayerMonsterCanAttack: false,
    selectedPlayerMonsterAttackReason: "守备表示怪兽不能攻击。",
    selectedPlayerMonsterCanChangeMode: false,
    selectedPlayerMonsterModeReason: "这只怪兽本回合已经切换过表示。"
  });

  assert.equal(view.modeDisabled, true);
  assert.equal(view.modeText, "转攻击");
  assert.deepEqual(view.fieldAction, {
    hidden: false,
    name: "铁壁守卫",
    status: "守备表示怪兽不能攻击。",
    attack: {
      disabled: true,
      text: "守备中",
      title: "守备表示怪兽不能攻击。"
    },
    detailDisabled: true
  });
  assert.deepEqual(view.fieldMode, {
    hidden: false,
    disabled: true,
    text: "守备中",
    title: "这只怪兽本回合已经切换过表示。",
    defense: true
  });
});

test("field action bar stays hidden until an own monster is selected", () => {
  const view = buildDuelControlsView({
    started: true,
    canAct: true,
    phase: "main"
  });

  assert.equal(view.fieldAction.hidden, true);
  assert.equal(view.fieldMode.disabled, true);
});

test("target and fusion selections block turn controls and expose the correct prompt", () => {
  const target = buildDuelControlsView({
    started: true,
    actions: { attack: true },
    canUseTurnControls: true,
    canAct: true,
    pendingTarget: { cardName: "破阵星芒" },
    targetPrompt: "选择对方攻击力最高怪兽。",
    targetSelectionStatus: {
      complete: true,
      confirmLabel: "确认发动",
      text: "选择对方攻击力最高怪兽。\n已默认选择：苍穹骑手（敌方怪兽区 2）。"
    }
  });

  assert.equal(target.skipAttack.disabled, true);
  assert.equal(target.endTurn.disabled, true);
  assert.equal(target.hand.confirmText, "确认发动");
  assert.equal(target.hand.confirmDisabled, false);
  assert.equal(target.choice.text, "选择对方攻击力最高怪兽。\n已默认选择：苍穹骑手（敌方怪兽区 2）。");
  assert.equal(target.choice.target, true);

  const staleTarget = buildDuelControlsView({
    started: true,
    canAct: true,
    pendingTarget: { cardName: "破阵星芒" },
    targetSelectionStatus: {
      complete: false,
      confirmLabel: "请选择目标",
      text: "原目标已失效，请重新选择。"
    }
  });
  assert.equal(staleTarget.choice.confirmDisabled, true);
  assert.equal(staleTarget.choice.confirmText, "请选择目标");

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

test("mechanics readability prompts survive the extracted control renderer", () => {
  const tribute = buildDuelControlsView({
    started: true,
    canAct: true,
    pendingTribute: { cardName: "坠星巨卫" },
    selectionPrompt: "召唤「坠星巨卫」需要解放 2 只怪兽。\n已选择 1 / 2：星火信使"
  });
  assert.match(tribute.choice.text, /已选择 1 \/ 2/);
  assert.equal(tribute.choice.material, true);

  const split = buildDuelControlsView({
    started: true,
    canAct: true,
    pendingTarget: { effect: "splitToken", cardName: "星火分裂" },
    targetPrompt: "将生成 2 只「星火衍生体」。"
  });
  assert.equal(split.choice.split, true);
  assert.match(split.choice.text, /将生成 2 只/);
});
