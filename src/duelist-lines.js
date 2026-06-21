export function duelistLabel(duelist) {
  return duelist?.owner === "player" ? "你" : "AI";
}

export function duelistName(owner) {
  return owner === "player" ? "你" : "AI";
}

export function lineFor(owner, action, card, detail = "") {
  if (detail) return detail;
  const player = owner === "player";
  const name = card?.name || "";
  const lines = {
    summon: player ? `回应我的呼唤，${name}，降临战场！` : `现身吧，${name}，压碎他的防线。`,
    ace: player ? `王牌登场，${name}！撕开战局吧！` : `这就是终结战局的王牌，${name}。`,
    spell: player ? `魔法发动，${name}！星光听我号令！` : `发动魔法卡，${name}。局势已经改变了。`,
    trap: player ? `连锁发动，${name}！就是现在！` : `陷阱已经等你很久了，${name}。`,
    attack: player ? `${name}，全力攻击！` : `${name}，粉碎目标。`,
    hit: player ? "这点冲击还挡不住我。" : "哼，还差得远。",
    break: player ? "击破目标，继续压制！" : "目标破坏，攻势继续。",
    direct: player ? "直接攻击，贯穿生命值！" : "直接攻击，生命值下降。",
    clash: "双方怪兽同归于尽。"
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
