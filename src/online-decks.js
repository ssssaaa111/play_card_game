import { deckPresets, library } from "./data.js";
import { normalizeDeckName, validateCustomDeck } from "./custom-decks.js";
import { trapDefinition } from "./traps.js";

const cards = new Map(library.map((card) => [card.id, card]));

export class OnlineDeckError extends Error {
  constructor(message) {
    super(message);
    this.name = "OnlineDeckError";
    this.code = "INVALID_DECK";
  }
}

export function onlineCardSupported(card) {
  return Boolean(card && !card.token && (card.type !== "trap" ||
    ["attack", "direct", "summon", "chain"].includes(trapDefinition(card.trigger)?.event)));
}

export function normalizeOnlineDeckChoice(choice) {
  if (choice == null) return null; // Keep the existing 40-card online starter.
  if (typeof choice !== "object" || Array.isArray(choice)) throw new OnlineDeckError("卡组选择格式无效。");
  let ids;
  let name;
  if (choice.kind === "preset") {
    const preset = typeof choice.id === "string" && Object.hasOwn(deckPresets, choice.id) ? deckPresets[choice.id] : null;
    if (!preset || preset.setupVisibility === "internal") throw new OnlineDeckError("请选择可用于玩家对战的预设卡组。");
    ids = preset.ids;
    name = preset.label;
  } else if (choice.kind === "custom") {
    ids = choice.ids;
    name = normalizeDeckName(choice.name);
  } else {
    throw new OnlineDeckError("未知卡组类型。");
  }
  if (!Array.isArray(ids) || ids.length > 60 || ids.some((id) => typeof id !== "string")) {
    throw new OnlineDeckError("卡组必须是最多 60 张卡牌 ID 的列表。");
  }
  const validation = validateCustomDeck(ids);
  if (!validation.ok) throw new OnlineDeckError(validation.errors.map((error) => error.message).join("；"));
  const unsupported = [...new Set(ids)].filter((id) => !onlineCardSupported(cards.get(id)));
  if (unsupported.length) {
    throw new OnlineDeckError(`以下卡牌不能加入联机主卡组：${unsupported.map((id) => cards.get(id)?.name || id).join("、")}。衍生物只能由效果生成。`);
  }
  return {
    kind: choice.kind,
    ...(choice.kind === "preset" ? { id: choice.id } : {}),
    name,
    ids: [...ids]
  };
}

export function onlineDeckOptions(customDecks = []) {
  return [
    { value: "default", label: "联机基础卡组（40 张）", choice: null },
    ...Object.entries(deckPresets).filter(([, preset]) => preset.setupVisibility !== "internal")
      .map(([id, preset]) => ({ value: `preset:${id}`, label: `${preset.label}（${preset.ids.length} 张）`, choice: { kind: "preset", id } })),
    ...customDecks.map((deck) => ({ value: deck.id, label: `自定义 · ${deck.name}（${deck.ids.length} 张）`, choice: { kind: "custom", name: deck.name, ids: [...deck.ids] } }))
  ];
}
