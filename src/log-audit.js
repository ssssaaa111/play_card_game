export const LOG_AUDIT_LIMIT = 8;

const spellExpectations = {
  "爆裂符文": {
    pattern: /造成 \d+ 点伤害/,
    message: "爆裂符文发动后应记录实际伤害。"
  },
  "星泉再生": {
    pattern: /回复 \d+ 点生命值/,
    message: "星泉再生发动后应记录实际回复。"
  },
  "预见之召": {
    pattern: /抽了 2 张卡/,
    message: "预见之召发动后应记录抽 2 张。"
  },
  "星盾展开": {
    pattern: /获得 800 点护盾|护盾/,
    message: "星盾展开发动后应记录护盾结算。"
  },
  "双重召唤": {
    pattern: /额外通常召唤/,
    message: "双重召唤发动后应记录额外召唤资源。"
  },
  "星隙穿透": {
    pattern: /直接攻击许可/,
    message: "星隙穿透发动后应记录直接攻击许可。"
  }
};

function normalizeText(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

export function normalizeLogEntries(source = [], { newestFirst = true } = {}) {
  const entries = source
    .map((entry, index) => {
      if (typeof entry === "string") {
        return { index, step: null, kind: "", text: normalizeText(entry) };
      }
      return {
        index,
        step: Number.isFinite(entry?.step) ? entry.step : null,
        kind: entry?.kind || "",
        text: normalizeText(entry?.text || "")
      };
    })
    .filter((entry) => entry.text);

  if (entries.some((entry) => entry.step !== null)) {
    return [...entries].sort((a, b) => (a.step ?? a.index) - (b.step ?? b.index));
  }
  return newestFirst ? [...entries].reverse() : entries;
}

function pushIssue(issues, code, message, entry, severity = "warning") {
  issues.push({
    code,
    severity,
    message,
    step: entry?.step ?? null,
    text: entry?.text || ""
  });
}

function isRepeatableActionLog(text = "") {
  return /召唤了|盖放了|抽了 \d+ 张卡/.test(text);
}

function auditDuplicateNeighbors(entries, issues) {
  for (let i = 1; i < entries.length; i += 1) {
    if (entries[i].text === entries[i - 1].text && !isRepeatableActionLog(entries[i].text)) {
      pushIssue(issues, "duplicate-log", "连续出现完全相同的日志，可能是重复触发或重复播报。", entries[i]);
    }
  }
}

function auditSpellExpectations(entries, issues) {
  entries.forEach((entry, index) => {
    const match = entry.text.match(/(?:你|AI) 发动魔法卡 ([^。]+)。?/);
    if (!match) return;
    const expectation = spellExpectations[match[1]];
    if (!expectation) return;
    const followups = entries.slice(index + 1, index + 5);
    if (!followups.some((candidate) => expectation.pattern.test(candidate.text))) {
      pushIssue(issues, "missing-spell-resolution", expectation.message, entry);
    }
  });
}

function auditDirectAttackFlow(entries, issues) {
  let blockedDirectNeedsPermission = false;
  entries.forEach((entry) => {
    if (/回合开始|决斗开始/.test(entry.text)) {
      blockedDirectNeedsPermission = false;
    }
    if (/击破|破坏了|相杀/.test(entry.text)) {
      blockedDirectNeedsPermission = false;
    }
    if (/攻击无效：对手场上还有怪兽|攻击被规则拦截：对手场上还有怪兽/.test(entry.text)) {
      blockedDirectNeedsPermission = true;
    }
    if (/获得 1 次直接攻击许可/.test(entry.text)) {
      blockedDirectNeedsPermission = false;
    }
    if (blockedDirectNeedsPermission && /直接攻击，造成 \d+ 点伤害/.test(entry.text)) {
      pushIssue(issues, "direct-after-block", "直击刚被规则拦截后又成功直击，中间没有看到许可或清场日志。", entry, "error");
      blockedDirectNeedsPermission = false;
    }
  });
}

function isAttackResolution(text = "") {
  return /直接攻击，造成|ATK \d+|取消了攻击|无效了本次攻击|破坏了 .*|削弱了 .*攻击继续结算|让直接攻击伤害变为 0|攻击被规则拦截|攻击无效|规则校验：.*没有产生任何状态影响/.test(text);
}

function isActionBoundary(text = "") {
  return /回合开始|发动魔法卡|召唤了|盖放了|抽了|主动结束回合|跳过了本回合/.test(text);
}

function auditAttackPreviewResolution(entries, issues) {
  entries.forEach((entry, index) => {
    if (!/攻击预判：|AI 攻击预判：/.test(entry.text)) return;
    const followups = entries.slice(index + 1);
    const resolution = followups.find((candidate) => isAttackResolution(candidate.text) || isActionBoundary(candidate.text));
    if (!resolution || isAttackResolution(resolution.text)) return;
    pushIssue(issues, "missing-attack-resolution", "攻击预判后进入了其他行动，但没有看到攻击结算、陷阱取消或规则拦截。", entry, "error");
  });
}

function auditRuleCheckEntries(entries, issues) {
  entries.forEach((entry) => {
    if (/规则校验：.*没有产生任何状态影响/.test(entry.text)) {
      pushIssue(issues, "attack-no-impact", "攻击结算前后没有任何状态变化，通常表示规则事件漏结算或目标丢失。", entry, "error");
    }
  });
}

export function auditLogEntries(source = [], options = {}) {
  const entries = normalizeLogEntries(source, options);
  const issues = [];
  auditDuplicateNeighbors(entries, issues);
  auditSpellExpectations(entries, issues);
  auditDirectAttackFlow(entries, issues);
  auditAttackPreviewResolution(entries, issues);
  auditRuleCheckEntries(entries, issues);
  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    issues: issues.slice(0, options.limit || LOG_AUDIT_LIMIT)
  };
}
