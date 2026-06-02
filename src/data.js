export const library = [
  { id: "ember-drake", type: "monster", name: "赤焰幼龙", element: "fire", stars: 4, atk: 1500, def: 900, icon: "炎", text: "被召唤时，对对手造成 200 点伤害。", onSummon: "burn200" },
  { id: "solar-knight", type: "monster", name: "日冕骑士", element: "light", stars: 4, atk: 1700, def: 1200, icon: "光", text: "稳健的光属性战士，适合抢节奏。" },
  { id: "gale-mage", type: "monster", name: "疾风术士", element: "wind", stars: 3, atk: 1200, def: 1400, icon: "风", text: "召唤时抽 1 张卡。", onSummon: "draw1" },
  { id: "void-hound", type: "monster", name: "虚影猎犬", element: "shadow", stars: 4, atk: 1600, def: 800, icon: "影", text: "攻击后自身攻击力提升 200。", afterAttack: "grow200" },
  { id: "iron-guardian", type: "monster", name: "铁壁守卫", element: "light", stars: 4, atk: 900, def: 2100, icon: "盾", text: "光属性。防御很高，但当前原型只计算攻击力。" },
  { id: "star-lancer", type: "monster", name: "星轨枪兵", element: "wind", stars: 4, atk: 1800, def: 1000, icon: "星", text: "风属性。高攻击力的前线怪兽。" },
  { id: "night-oracle", type: "monster", name: "夜幕司祭", element: "shadow", stars: 3, atk: 1100, def: 1600, icon: "月", text: "召唤时回复 300 点生命值。", onSummon: "heal300" },
  { id: "flare-titan", type: "monster", name: "熔核巨像", element: "fire", stars: 5, atk: 2200, def: 1500, icon: "核", text: "火属性。强力王牌怪兽，第一版无需祭品即可召唤。" },
  { id: "flame-captain", type: "monster", name: "焰心指挥官", element: "fire", stars: 4, atk: 1400, def: 1300, icon: "令", text: "召唤时，如果你场上还有火属性怪兽，我方攻击力最高怪兽提升 300。", onSummon: "fireBuff" },
  { id: "prism-saint", type: "monster", name: "辉棱圣徒", element: "light", stars: 3, atk: 1000, def: 1800, icon: "棱", text: "召唤时获得 400 护盾。" , onSummon: "shield400" },
  { id: "sky-raider", type: "monster", name: "天岚突袭者", element: "wind", stars: 4, atk: 1550, def: 900, icon: "岚", text: "攻击后，如果你场上有风属性怪兽，抽 1 张卡。", afterAttack: "windDraw" },
  { id: "dusk-alchemist", type: "monster", name: "暮影炼术师", element: "shadow", stars: 4, atk: 1450, def: 1500, icon: "炼", text: "召唤时，如果你场上有暗属性怪兽，对手受到 300 伤害。", onSummon: "shadowBurn" },
  { id: "burst-rune", type: "spell", name: "爆裂符文", icon: "爆", text: "对对手造成 500 点伤害。", effect: "burn500" },
  { id: "renewal", type: "spell", name: "星泉再生", icon: "泉", text: "回复 700 点生命值。", effect: "heal700" },
  { id: "war-chant", type: "spell", name: "战意高扬", icon: "战", text: "你场上攻击力最高的怪兽提升 500 攻击力。", effect: "buff500" },
  { id: "seer-call", type: "spell", name: "预见之召", icon: "抽", text: "抽 2 张卡。", effect: "draw2" },
  { id: "element-echo", type: "spell", name: "元素共鸣", icon: "鸣", text: "若你场上有至少 2 种属性，全体怪兽攻击力提升 200，并抽 1 张卡。", effect: "elementEcho" },
  { id: "twin-summon", type: "spell", name: "双重召唤", icon: "双", text: "本回合可以额外通常召唤 1 次。", effect: "extraSummon" },
  { id: "rally-strike", type: "spell", name: "连携突击", icon: "突", text: "让我方攻击力最高怪兽提升 300，并获得 1 次攻击重置；若已有怪兽攻击过，会优先让它再次可攻击。", effect: "rallyAttack" },
  { id: "star-shield", type: "spell", name: "星盾展开", icon: "盾", text: "获得 800 护盾，护盾会优先抵挡伤害。", effect: "shield800" },
  { id: "pierce-line", type: "spell", name: "破阵星芒", icon: "破", text: "让对手攻击力最高的怪兽 ATK/DEF 下降 400，并对对手造成 200 点伤害。", effect: "pierceLine" },
  { id: "grave-return", type: "spell", name: "星尘回收", icon: "收", text: "将墓地 1 张非本卡的卡放回卡组顶，然后抽 1 张卡。", effect: "graveReturn" },
  { id: "battle-trance", type: "spell", name: "战斗狂热", icon: "狂", text: "我方攻击力最高的怪兽提升 200，并获得 1 次攻击重置。", effect: "battleTrance" },
  { id: "star-breach", type: "spell", name: "星隙穿透", icon: "隙", text: "本回合获得 1 次直接攻击许可：即使对手有怪兽，也可以点击敌方角色造成直接伤害。", effect: "directStrike" },
  { id: "flame-gale-burst", type: "spell", name: "炎岚合击", icon: "岚", text: "需要我方场上有火和风属性怪兽；对对手造成 400 点伤害，并让我方全体怪兽 ATK 提升 200。", effect: "fireWindCombo" },
  { id: "eclipse-barrier", type: "spell", name: "晨昏星界", icon: "界", text: "需要我方场上有光和暗属性怪兽；获得 600 护盾，并抽 1 张卡。", effect: "lightShadowCombo" },
  { id: "mirror-snare", type: "trap", name: "镜光反制", icon: "镜", text: "盖放后自动触发：对手攻击时，破坏攻击怪兽。", trigger: "attackDestroy" },
  { id: "guard-sigil", type: "trap", name: "守护刻印", icon: "印", text: "盖放后自动触发：你将受到直接攻击时，伤害变为 0，并抽 1 张卡。", trigger: "directShield" },
  { id: "summon-flare", type: "trap", name: "召雷陷阵", icon: "雷", text: "盖放后自动触发：对手召唤怪兽时，对其造成 400 点伤害。", trigger: "summonBurn" },
  { id: "counter-array", type: "trap", name: "反击阵列", icon: "阵", text: "盖放后自动触发：对手攻击时，取消攻击并让我方攻击力最低怪兽提升 400。", trigger: "counterBoost" },
  { id: "storm-shift", type: "trap", name: "风暴转移", icon: "转", text: "盖放后自动触发：对手攻击时，取消攻击并获得 400 护盾。", trigger: "attackShift" },
  { id: "void-lock", type: "trap", name: "星界封锁", icon: "封", text: "盖放后自动触发：对手攻击时，无效本次攻击并消耗攻击机会。", trigger: "attackNegate" },
  { id: "phantom-switch", type: "trap", name: "幻影换位", icon: "换", text: "盖放后自动触发：对手攻击时，将攻击目标改为我方另一只守备力最高的怪兽。", trigger: "redirectAttack" },
  { id: "weakening-web", type: "trap", name: "弱化力场", icon: "弱", text: "盖放后自动触发：对手攻击时，攻击怪兽 ATK/DEF 下降 500，攻击继续结算。", trigger: "weakenAttack" },
  { id: "reversal-flare", type: "trap", name: "逆焰护壁", icon: "返", text: "盖放后自动触发：你将受到直接攻击时，伤害变为 0，并反弹 500 点伤害。", trigger: "directRebound" }
];

export const monsterAssets = {
  "ember-drake": "assets/monster-fire-dragon.png",
  "flare-titan": "assets/monster-fire-dragon.png",
  "flame-captain": "assets/monster-fire-dragon.png",
  "solar-knight": "assets/monster-light-knight.png",
  "iron-guardian": "assets/monster-light-knight.png",
  "prism-saint": "assets/monster-light-knight.png",
  "gale-mage": "assets/monster-wind-mage.png",
  "star-lancer": "assets/monster-wind-mage.png",
  "sky-raider": "assets/monster-wind-mage.png",
  "void-hound": "assets/monster-shadow-wolf.png",
  "night-oracle": "assets/monster-shadow-wolf.png",
  "dusk-alchemist": "assets/monster-shadow-wolf.png"
};

export const roleProfiles = {
  star: {
    name: "星辉使者",
    skill: "星脉连携",
    kind: "draw",
    text: "每回合首次触发组合技时抽 1 张卡。"
  },
  blaze: {
    name: "炎岚指挥官",
    skill: "燃阵号令",
    kind: "buff",
    amount: 300,
    text: "每回合首次触发组合技时，强化我方攻击力最高怪兽。"
  },
  guard: {
    name: "辉棱守望者",
    skill: "棱光庇护",
    kind: "shield",
    amount: 500,
    text: "每回合首次触发组合技时，获得 500 护盾。"
  }
};

export const aiProfiles = {
  balanced: {
    label: "均衡策士",
    deckPreset: "balanced",
    profile: {
      name: "影刃策士",
      skill: "暗影压迫",
      kind: "burn",
      amount: 150,
      text: "每回合首次触发组合技时对你造成 150 伤害。"
    }
  },
  aggressive: {
    label: "强攻斗士",
    deckPreset: "aggressive",
    profile: {
      name: "炎狩斗士",
      skill: "灼热追打",
      kind: "burn",
      amount: 220,
      text: "每回合首次触发组合技时对你造成 220 伤害。"
    }
  },
  control: {
    label: "防守控场",
    deckPreset: "control",
    profile: {
      name: "棱镜守卫",
      skill: "镜域稳固",
      kind: "shield",
      amount: 450,
      text: "每回合首次触发组合技时获得 450 护盾。"
    }
  }
};

export const deckPresets = {
  balanced: {
    label: "均衡星魂",
    ids: [
      "ember-drake", "solar-knight", "gale-mage", "void-hound",
      "iron-guardian", "star-lancer", "night-oracle", "flare-titan",
      "flame-captain", "prism-saint", "sky-raider", "dusk-alchemist",
      "burst-rune", "renewal", "war-chant", "seer-call",
      "element-echo", "twin-summon", "rally-strike", "star-shield",
      "ember-drake", "solar-knight", "void-hound", "star-lancer",
      "flame-captain", "sky-raider", "dusk-alchemist",
      "burst-rune", "renewal", "war-chant", "seer-call", "element-echo",
      "pierce-line", "grave-return", "battle-trance", "star-breach", "flame-gale-burst", "eclipse-barrier",
      "mirror-snare", "guard-sigil", "summon-flare", "mirror-snare", "counter-array", "storm-shift", "void-lock", "phantom-switch", "weakening-web", "reversal-flare"
    ]
  },
  aggressive: {
    label: "速攻炎风",
    ids: [
      "ember-drake", "ember-drake", "flare-titan", "flame-captain",
      "flame-captain", "star-lancer", "star-lancer", "sky-raider",
      "sky-raider", "gale-mage", "gale-mage", "void-hound",
      "burst-rune", "burst-rune", "war-chant", "war-chant",
      "rally-strike", "rally-strike", "seer-call", "twin-summon",
      "element-echo", "ember-drake", "sky-raider", "flame-captain",
      "star-lancer", "void-hound", "solar-knight",
      "mirror-snare", "summon-flare", "summon-flare", "counter-array", "storm-shift", "void-lock", "phantom-switch",
      "burst-rune", "war-chant", "rally-strike", "seer-call", "twin-summon", "element-echo",
      "pierce-line", "battle-trance", "star-breach", "flame-gale-burst", "reversal-flare"
    ]
  },
  control: {
    label: "守护反制",
    ids: [
      "iron-guardian", "iron-guardian", "prism-saint", "prism-saint",
      "night-oracle", "night-oracle", "solar-knight", "dusk-alchemist",
      "dusk-alchemist", "void-hound", "gale-mage", "star-lancer",
      "renewal", "renewal", "star-shield", "star-shield",
      "seer-call", "seer-call", "element-echo", "twin-summon",
      "war-chant", "iron-guardian", "prism-saint", "night-oracle",
      "solar-knight", "dusk-alchemist", "void-hound",
      "mirror-snare", "mirror-snare", "guard-sigil", "guard-sigil",
      "counter-array", "counter-array", "storm-shift", "storm-shift", "void-lock", "phantom-switch",
      "summon-flare", "star-shield", "element-echo",
      "grave-return", "pierce-line", "eclipse-barrier", "weakening-web", "reversal-flare"
    ]
  }
};

export const characterProfiles = {
  player: { ...roleProfiles.star },
  ai: { ...aiProfiles.balanced.profile }
};

export const scenarioSetups = {
  normal: {
    label: "正常决斗",
    text: "随机起手和常规流程。"
  },
  chain: {
    label: "连锁测试",
    text: "起手包含弱化力场、反击阵列和怪兽，AI 场上有攻击怪兽，方便验证连续陷阱。",
    goal: "盖放两张陷阱并召唤怪兽，让 AI 攻击时连续发动陷阱。",
    playerHand: ["weakening-web", "counter-array", "void-lock", "iron-guardian", "gale-mage", "storm-shift", "dusk-alchemist"],
    aiHand: ["war-chant", "twin-summon", "star-lancer", "solar-knight"],
    aiField: ["sky-raider"]
  },
  combo: {
    label: "组合魔法",
    text: "我方场上预置火+风，手牌含炎岚合击，用来验证属性组合发动条件。",
    goal: "直接发动炎岚合击，观察属性组合魔法和全体加攻。",
    playerHand: ["flame-gale-burst", "eclipse-barrier", "war-chant", "battle-trance", "seer-call"],
    playerField: ["ember-drake", "gale-mage"],
    aiField: ["iron-guardian"],
    aiHand: ["mirror-snare", "solar-knight"]
  },
  ace: {
    label: "王牌攻势",
    text: "起手给熔核巨像和强化卡，对手场上有目标，方便查看王牌攻击 cut-in。",
    goal: "召唤熔核巨像后攻击对手怪兽，观察王牌攻势 cut-in。",
    playerHand: ["flare-titan", "war-chant", "battle-trance", "seer-call", "mirror-snare"],
    aiField: ["iron-guardian"],
    aiHand: ["guard-sigil", "solar-knight"]
  },
  direct: {
    label: "直击许可",
    text: "我方场上有可攻击怪兽，对手场上有怪兽，手牌含星隙穿透，用来验证特殊直击规则。",
    goal: "先点敌方角色会被拦截；发动星隙穿透后再点敌方角色，就能绕过怪兽直接攻击玩家。",
    playerHand: ["star-breach", "war-chant", "mirror-snare"],
    playerField: ["star-lancer"],
    aiField: ["iron-guardian"],
    aiHand: ["solar-knight"]
  },
  skipLock: {
    label: "跳攻锁定",
    text: "我方场上已有可攻击怪兽，手牌含新怪兽，用来验证跳过攻击后新召唤也不能攻击。",
    goal: "点击跳过攻击后再召唤熔核巨像，牌面应显示攻击已跳过且不能继续攻击。",
    playerHand: ["flare-titan", "war-chant", "mirror-snare"],
    playerField: ["star-lancer"],
    aiField: ["iron-guardian"],
    aiHand: ["solar-knight"]
  },
  redirect: {
    label: "换位陷阱",
    text: "我方场上有低守备目标和高守备守卫，手牌含幻影换位，用来验证攻击改目标。",
    goal: "盖放幻影换位后让 AI 攻击，攻击会被改到铁壁守卫身上。",
    playerHand: ["phantom-switch", "war-chant", "seer-call"],
    playerField: ["gale-mage", "iron-guardian"],
    aiField: ["star-lancer"],
    aiHand: ["burst-rune"]
  },
  target: {
    label: "目标选择",
    text: "我方和 AI 场上都有多只怪兽，手牌含强化、削弱和再攻魔法，用来验证指定目标结算。",
    goal: "发动战意高扬只能选择我方攻击力最高怪兽；发动破阵星芒只能选择敌方攻击力最高怪兽。",
    playerHand: ["war-chant", "pierce-line", "battle-trance", "rally-strike", "seer-call", "renewal"],
    playerField: ["star-lancer", "ember-drake"],
    aiField: ["iron-guardian", "sky-raider"],
    aiHand: ["solar-knight"]
  }
};
