import { publicLogCardIds } from "./battle-log.js";
import { cardDefinitionById, cardDetailViewModel } from "./card-detail.js";

const revealLabels = {
  spell: "AI 发动了",
  trap: "AI 翻开了",
  summon: "AI 召唤了",
  "special-summon": "AI 特殊召唤了",
  "monster-effect": "AI 触发了",
};

const revealKinds = new Set(Object.keys(revealLabels));

export function buildAiCardReveal(input = {}) {
  if (!input || input.actor !== "ai" || !input.public) return null;
  const revealKind = input.revealKind || input.type;
  if (!revealKinds.has(revealKind)) return null;
  const cardId = input.cardId || publicLogCardIds(input)[0] || null;
  const card = cardDefinitionById(cardId);
  if (!card) return null;
  const detail = cardDetailViewModel(card.id);
  if (!detail) return null;
  const label = revealLabels[revealKind] || "AI 公开了";
  return {
    cardId: card.id,
    revealKind,
    title: `${label}「${detail.name}」`,
    name: detail.name,
    type: detail.type,
    summary: input.summary || card.summary || card.text || detail.rule || "",
    card,
  };
}

export function aiRevealProgressText({ index = 1, total = 1 } = {}) {
  const current = Number(index) || 1;
  const count = Number(total) || 1;
  if (count <= 1) return "";
  return `第 ${current} / ${count} 张公开卡`;
}

export function withAiRevealQueuePosition(reveal, position = {}) {
  if (!reveal) return null;
  const index = Number(position.index) || 1;
  const total = Number(position.total) || 1;
  return {
    ...reveal,
    queueIndex: index,
    queueTotal: total,
    progressText: aiRevealProgressText({ index, total })
  };
}
