export function duelistLabel(duelist) {
  return duelist?.owner === "player" ? "你" : "AI";
}

export function duelistName(owner) {
  return owner === "player" ? "你" : "AI";
}

export function summonVoiceKey(card) {
  if (card?.tributeCost >= 3 || card?.archetype?.includes("神格")) return "divine";
  return card?.stars >= 5 ? "ace" : "summon";
}

export function lineFor(owner, action, card, detail = "") {
  if (detail) return detail;
  const player = owner === "player";
  const name = card?.name || "";
  if (action === "divine" || (action === "ace" && summonVoiceKey(card) === "divine")) {
    const invocation = {
      "trio-sun-judicator": "烈日临空，裁决降临！",
      "trio-moon-warden": "月蚀蔽天，万籁归寂！",
      "trio-star-herald": "群星陨落，终焉降临！",
      "celestial-origin-dragon": "群星听令，创星神龙！"
    };
    return invocation[card?.id] || `${name}，神威降临！`;
  }
  const lines = {
    summon: player ? `${name}，出战！` : `${name}，现身！`,
    ace: player ? `${name}，撕开战局！` : `${name}，镇压全场！`,
    spell: `魔法发动，${name}！`,
    trap: player ? `就是现在，${name}！` : `中计了，${name}！`,
    attack: player ? `${name}，全力攻击！` : `${name}，粉碎目标。`,
    hit: player ? "这点冲击还挡不住我。" : "哼，还差得远。",
    break: player ? "击破！" : "不堪一击。",
    direct: player ? "直接攻击，一决胜负！" : "直接攻击，结束吧！",
    clash: "同归于尽！"
  };
  return lines[action] || name || "效果发动。";
}

export function aceLine(card) {
  if (card?.element === "fire") return "熔炎升腾，王牌降临";
  if (card?.element === "wind") return "疾风开路，王牌降临";
  if (card?.element === "shadow") return "暗影蔓延，王牌降临";
  if (card?.element === "light") return "星辉照耀，王牌降临";
  return "星魂觉醒，王牌降临";
}
