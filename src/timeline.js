import { logEntryMessage } from "./battle-log.js";

export const TIMELINE_LIMIT = Number.POSITIVE_INFINITY;

export function timelineKind(text = "") {
  if (/终章转场|第一神已降临|第二神已降临|最终神已降临|第二次建设开始|最终神窗口/.test(text)) return "phase";
  if (/连锁|陷阱|反制|反击阵列|弱化力场|护壁/.test(text)) return "trap";
  if (/攻击无效|规则拦截|没有发动|保留/.test(text)) return "warning";
  if (/召唤了|额外召唤机会|通常召唤/.test(text)) return "summon";
  if (/攻击|击破|直击|相杀|反击|攻势/.test(text)) return "attack";
  if (/魔法|发动|共鸣|星界|合击|回收|召唤|装备|魔陷|破坏|失效/.test(text)) return "spell";
  if (/抽了|抽 1|抽一/.test(text)) return "draw";
  if (/护盾|防御|守备|抵挡|吸收/.test(text)) return "guard";
  if (/回合开始|决斗开始|暂停|继续|场景/.test(text)) return "turn";
  if (/伤害|生命|损耗/.test(text)) return "damage";
  return "event";
}

export function nextTimelineState(timeline, input, currentStep = 0, limit = TIMELINE_LIMIT) {
  const text = logEntryMessage(input);
  if (!text) return { timeline, step: currentStep };
  const step = currentStep + 1;
  const metadata = input && typeof input === "object" && !Array.isArray(input)
    ? {
        public: Boolean(input.public),
        cardId: input.cardId || null,
        relatedCardIds: Array.isArray(input.relatedCardIds) ? [...input.relatedCardIds] : []
      }
    : {};
  return {
    step,
    timeline: [{ step, kind: timelineKind(text), text, ...metadata }, ...timeline].slice(0, limit)
  };
}
