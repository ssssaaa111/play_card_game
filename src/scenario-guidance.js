const TRIO_OMEGA_SCENARIOS = new Set([
  "protagonistTrioOmega",
  "protagonistTrioOmegaChallenge",
  "protagonistTrioOmegaStory",
  "protagonistTrioOmegaFull"
]);

function cardTemplateId(card) {
  return card?.id || card?.templateId || "";
}

function hasCard(duelist = {}, zones = [], templateId = "") {
  return zones.some((zone) =>
    (duelist[zone] || []).some((card) => cardTemplateId(card) === templateId)
  );
}

function activeContinuousEffects(events = []) {
  const active = new Map();
  events.forEach((event) => {
    if (event.type === "CONTINUOUS_EFFECT_REGISTERED") active.set(event.id, event);
    if (event.type === "CONTINUOUS_EFFECT_RELEASED") active.delete(event.id);
  });
  return [...active.values()];
}

export function scenarioTacticalGoal(state = {}) {
  if (!state.started || !TRIO_OMEGA_SCENARIOS.has(state.scenarioId)) return "";

  const player = state.player || {};
  const ai = state.ai || {};
  const sunOnField = hasCard(ai, ["field"], "trio-sun-judicator");
  const moonPressureActive = activeContinuousEffects(state.gameEvents).some((effect) =>
    effect.playerId === "ai" && effect.effectId === "lunarDominion"
  );
  const solarSnareSet = hasCard(player, ["traps"], "trio-solar-snare");
  const solarSnareInHand = hasCard(player, ["hand"], "trio-solar-snare");
  const moonbreakerInHand = hasCard(player, ["hand"], "trio-moonbreaker-ray");
  const pawnInHand = hasCard(player, ["hand"], "trio-ember-pawn");
  const pawnInGrave = hasCard(player, ["grave"], "trio-ember-pawn");
  const pawnOnField = hasCard(player, ["field"], "trio-ember-pawn");
  const recallInHand = hasCard(player, ["hand"], "trio-ember-recall");
  const finalCounterInHand = hasCard(player, ["hand"], "trio-final-counter");

  if (state.turn === "ai") {
    return sunOnField && solarSnareSet
      ? "对手行动中：日冕诱锁已经就位，等待曜冕裁决者进入反制。"
      : "对手行动中：保住低星资源和生命值，等待下一次反击窗口。";
  }

  if (sunOnField) {
    if (solarSnareSet) {
      return "防御准备完成：结束回合，让日冕诱锁处理曜冕裁决者。";
    }
    if (solarSnareInHand) {
      return "先布防：盖放日冕诱锁，不要急着攻击或消耗终局资源。";
    }
    return "先守住日曜攻势：寻找防御手段，不要用低星怪正面硬换。";
  }

  if (moonPressureActive) {
    return moonbreakerInHand
      ? "反击窗口：用碎月解幕指定月曜帷幕，先解除持续压制。"
      : "月曜帷幕仍在生效：继续保留低星资源，等待碎月解幕。";
  }

  if (solarSnareSet) {
    return "防御准备完成：结束回合，保留低星资源，等待对手建立日曜攻势。";
  }

  if (pawnInGrave && recallInHand) {
    return "回召真正的终局资源：余烁归轨优先选择余烁小卫。";
  }
  if (pawnInHand) {
    return "持续压制已解除：召唤并保留余烁小卫，准备终局突破。";
  }
  if (pawnOnField && finalCounterInHand) {
    return "终局窗口已打开：对余烁小卫发动三曜终断，再连续突破残余三曜。";
  }
  if (pawnOnField) {
    return "围绕余烁小卫继续展开，保留它作为低星终局突破点。";
  }

  return "展开阶段：优先铺低星怪和防御陷阱，不要过早消耗墓地回收。";
}
