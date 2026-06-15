import { fieldElements } from './rules.js';

export const elementComboDefinitions = [
  {
    flag: "fireWind",
    title: "炎岚追击",
    text: "火属性和风属性共鸣，对手受到 300 点伤害，全场怪兽攻击力提升 100。",
    requires: ["fire", "wind"],
    operations: [
      { op: "dealDamage", player: "rival", amount: 300 },
      { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone" }, stat: "tempAtk", amount: 100 }
    ]
  },
  {
    flag: "lightShadow",
    title: "晨昏结界",
    text: "光属性和暗属性共鸣，获得 600 护盾并抽 1 张卡。",
    requires: ["light", "shadow"],
    operations: [
      { op: "gainShield", player: "self", amount: 600 },
      { op: "drawCards", player: "self", count: 1 }
    ]
  },
  {
    flag: "triad",
    title: "三相星阵",
    text: ({ elementCount }) => `场上集齐 ${elementCount} 种属性，全体怪兽攻击力提升 200。`,
    minElements: 3,
    operations: [
      { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone" }, stat: "tempAtk", amount: 200 }
    ]
  },
  {
    flag: "shadowAmbush",
    title: "暗影伏击",
    text: "暗属性怪兽掩护陷阱，获得 300 护盾。",
    requires: ["shadow"],
    source: "trap",
    operations: [{ op: "gainShield", player: "self", amount: 300 }]
  }
];

function comboMatches(definition, elements, source) {
  if (definition.source && definition.source !== source) return false;
  if (definition.minElements && elements.size < definition.minElements) return false;
  if (definition.requires?.some((element) => !elements.has(element))) return false;
  return true;
}

export function availableElementCombos(owner, source = "") {
  const elements = fieldElements(owner);
  return matchingElementCombos({ elements, flags: owner.comboFlags, source });
}

export function matchingElementCombos({ elements, flags = {}, source = "" }) {
  return elementComboDefinitions
    .filter((definition) => !flags[definition.flag] && comboMatches(definition, elements, source))
    .map((definition) => ({
      ...definition,
      elementCount: elements.size,
      text: typeof definition.text === "function"
        ? definition.text({ elementCount: elements.size, elements })
        : definition.text
    }));
}
