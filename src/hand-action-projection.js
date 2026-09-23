import {
  collectLegalTargetSelections,
  prepareDefaultTargetSelection,
  resolveSelectedTargetSelection,
  targetSelectionScope,
  targetSelectionTargetLabel
} from "./target-selection.js";

function unavailableTargetReason(card, selection) {
  const reasons = {
    ownGraveMonster: "我方墓地没有可回召的怪兽",
    ownGraveCard: "我方墓地没有可选择的卡牌",
    enemySpellTrap: "敌方魔陷区没有可选择的卡牌",
    ownMonster: "我方场上没有符合条件的怪兽",
    enemyMonster: "敌方场上没有符合条件的怪兽"
  };
  const detail = reasons[selection?.mode] || `没有符合条件的${targetSelectionScope(selection)}`;
  return `${card?.name || "这张卡"}：${detail}，不能发动。`;
}

function unavailableTargetLabel(selection) {
  const labels = {
    ownGraveMonster: "墓地无怪兽",
    ownGraveCard: "墓地无卡可选",
    enemySpellTrap: "无敌方魔陷",
    ownMonster: "我方无目标",
    enemyMonster: "敌方无目标"
  };
  return labels[selection?.mode] || "无合法目标";
}

function readyTargetReason(selection, legalTargets, selectedTarget) {
  if (legalTargets.length === 1) {
    return `唯一合法目标：${targetSelectionTargetLabel(legalTargets[0])}。点击后会自动选中。`;
  }
  if (selectedTarget) {
    return `已选择：${targetSelectionTargetLabel(selectedTarget)}。确认后发动。`;
  }
  return `${targetSelectionScope(selection)}共有 ${legalTargets.length} 个合法目标，点击后再选择。`;
}

export function conciseHandBlockLabel(card, reason = "", fallback = "条件不足") {
  const text = String(reason).replace(/^不能切换到这张卡[：:]\s*/, "");
  const lpLimitMatch = String(card?.text || "").match(/(?:LP|生命值)\s*[≤<＝=]\s*(\d+)|生命值\s*(\d+)\s*以下/i);
  const lpLimit = lpLimitMatch?.[1] || lpLimitMatch?.[2];
  if (/月曜帷幕.*(?:压制|清除)|先清除.*月曜帷幕/.test(text)) return "先清月幕";
  if (/余烁小卫不在场/.test(text)) return "需余烁小卫";
  if (/生命值.*(?:终局|条件)|生命值高于/.test(text)) return lpLimit ? `需 LP≤${lpLimit}` : "生命值未达条件";
  if (/墓地没有可回召的怪兽/.test(text)) return "墓地无怪兽";
  if (/墓地没有可回收的卡/.test(text)) return "墓地无卡可收";
  if (/(?:召唤区|怪兽区)已满/.test(text)) return "怪兽区已满";
  if (/魔陷区已满/.test(text)) return "魔陷区已满";
  if (/对手魔陷区没有/.test(text)) return "无敌方魔陷";
  if (/对手场上没有怪兽/.test(text)) return "敌方无怪兽";
  if (/场上没有怪兽/.test(text)) return "我方无怪兽";
  const deckCount = text.match(/卡组不足\s*(\d+)\s*张/);
  if (deckCount) return `卡组需 ${deckCount[1]} 张`;
  if (/缺少指定融合素材|素材不足/.test(text)) return "缺融合素材";
  if (/没有可融合登场的怪兽/.test(text)) return "缺融合怪兽";
  if (/没有可进化登场的王牌/.test(text)) return "缺进化王牌";
  const emptySlots = text.match(/需要至少\s*(\d+)\s*个空怪兽区/);
  if (emptySlots) return `需 ${emptySlots[1]} 个空位`;
  const elementCount = text.match(/需要场上至少\s*(\d+)\s*种属性/);
  if (elementCount) return `需 ${elementCount[1]} 种属性`;
  if (/火属性和风属性/.test(text)) return "需火 + 风";
  if (/光属性和暗属性/.test(text)) return "需光 + 暗";
  if (/星火引魂童和微光机巧卫/.test(text)) return "需双素材";
  if (/本回合已经通常召唤|本回合已经召唤/.test(text)) return "本回合已召唤";
  if (/已经跳过攻击/.test(text)) return "已跳过攻击";
  if (/没有可攻击怪兽/.test(text)) return "无可攻怪兽";
  if (/已经有直接攻击许可/.test(text)) return "已有直击许可";
  if (/月曜帷幕已经在场/.test(text)) return "月幕已在场";
  return fallback;
}

export function projectHandAction({
  card = null,
  handIndex = -1,
  ruleAction = {},
  timing = { ok: true },
  targetSelection = null,
  pendingTarget = null,
  duelists = {}
} = {}) {
  const activeTargetSelection = Boolean(
    targetSelection && pendingTarget?.handUid && pendingTarget.handUid === card?.uid
  );
  const selection = activeTargetSelection ? pendingTarget : targetSelection;
  const preparedSelection = selection ? prepareDefaultTargetSelection(selection, duelists) : null;
  const legalTargets = preparedSelection
    ? collectLegalTargetSelections(preparedSelection, duelists)
    : [];
  const selectedTarget = preparedSelection
    ? resolveSelectedTargetSelection(preparedSelection, duelists)
    : null;
  const target = preparedSelection
    ? {
        required: true,
        active: activeTargetSelection,
        count: legalTargets.length,
        scope: targetSelectionScope(preparedSelection),
        pending: preparedSelection,
        legalTargets,
        selectedTarget
      }
    : null;
  const switchingFromOtherTarget = Boolean(pendingTarget && !activeTargetSelection);

  let projectedRuleAction = { ...ruleAction };
  if (target) {
    const genericNoTarget = /没有可指定的合法目标|no legal target/i.test(projectedRuleAction.reason || "");
    if (target.count === 0 && (projectedRuleAction.ok || genericNoTarget)) {
      projectedRuleAction = {
        ...projectedRuleAction,
        ok: false,
        label: unavailableTargetLabel(preparedSelection),
        reason: unavailableTargetReason(card, preparedSelection)
      };
    } else if (projectedRuleAction.ok && !switchingFromOtherTarget) {
      projectedRuleAction = {
        ...projectedRuleAction,
        label: activeTargetSelection
          ? selectedTarget
            ? "目标已选"
            : `选目标 · ${target.count}`
          : `可发动 · ${target.count}目标`,
        reason: activeTargetSelection
          ? ruleAction.reason || readyTargetReason(preparedSelection, legalTargets, selectedTarget)
          : readyTargetReason(preparedSelection, legalTargets, selectedTarget)
      };
    }
  }

  if (!projectedRuleAction.ok) {
    projectedRuleAction.label = conciseHandBlockLabel(
      card,
      projectedRuleAction.reason,
      projectedRuleAction.label || "条件不足"
    );
  }

  const ruleOk = Boolean(projectedRuleAction.ok);
  const timingOk = Boolean(timing?.ok);
  const result = timingOk
    ? projectedRuleAction
    : {
        ...projectedRuleAction,
        ok: false,
        label: timing?.label || "等待",
        reason: timing?.reason || "当前不是你的可操作窗口。"
      };

  return {
    ...result,
    handIndex,
    ruleOk,
    timingOk,
    target
  };
}
