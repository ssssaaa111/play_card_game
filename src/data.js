export const library = [
  { id: "solar-vanguard", type: "monster", name: "曜锋先锋", element: "light", stars: 5, atk: 2300, def: 1700, icon: "曜", text: "需要 1 只我方场上怪兽作为祭品才能通常召唤。第一版祭品召唤验证用高阶怪兽。", tributeCost: 1 },
  { id: "starfall-colossus", type: "monster", name: "坠星巨卫", element: "light", stars: 8, atk: 3200, def: 2600, icon: "坠", text: "需要 2 只我方场上怪兽作为祭品才能通常召唤。用于验证大型怪兽的双祭品流程。", tributeCost: 2 },
  { id: "celestial-origin-dragon", type: "monster", name: "创星神龙", element: "light", stars: 10, atk: 4000, def: 4000, icon: "神", text: "需要 3 只我方场上怪兽作为祭品才能通常召唤。神格守护：每个己方回合首次将被战斗或效果破坏时，改为防止该次破坏。神格贯穿：攻击守备怪兽并击破时，对对手造成攻击力超出守备力的战斗伤害。神格威压：此卡造成战斗或效果伤害时，先消解对手最多 500 点护盾。神格抗性：不能成为对手非破神效果的指定目标。", summary: "三祭品登场，拥有每己方回合一次的破坏防护，并能贯穿守备、压穿护盾，免疫对手普通指定效果。", tributeCost: 3, destructionProtection: { type: "divineGuard", uses: 1, refresh: "controllerTurn" }, piercingDamage: { type: "divinePierce" }, shieldPierce: { type: "divinePressure", amount: 500 }, targetResistance: { type: "divineTarget" }, rarity: "UR", archetype: "神格" },
  { id: "ember-drake", type: "monster", name: "赤焰幼龙", element: "fire", stars: 4, atk: 1500, def: 900, icon: "炎", text: "被召唤时，对对手造成 200 点伤害。", onSummon: "burn200" },
  { id: "solar-knight", type: "monster", name: "日冕骑士", element: "light", stars: 4, atk: 1700, def: 1200, icon: "光", text: "稳健的光属性战士，适合抢节奏。" },
  { id: "gale-mage", type: "monster", name: "疾风术士", element: "wind", stars: 3, atk: 1200, def: 1400, icon: "风", text: "召唤时抽 1 张卡。", onSummon: "draw1" },
  { id: "flare-gale-archon", type: "monster", name: "焰岚合星者", element: "fire", stars: 6, atk: 2400, def: 1800, icon: "融", text: "由赤焰幼龙和疾风术士融合召唤。攻击后自身攻击力提升 200。", summary: "指定素材融合登场的高阶进攻怪兽。", afterAttack: "grow200" },
  { id: "tempest-aegis-archon", type: "monster", name: "岚耀守星者", element: "wind", stars: 6, atk: 2000, def: 2600, icon: "守", text: "由赤焰幼龙和疾风术士融合召唤。召唤时获得 400 护盾。", summary: "与焰岚合星者共用素材的防御形态，登场后立即建立护盾。", onSummon: "shield400" },
  { id: "void-hound", type: "monster", name: "虚影猎犬", element: "shadow", stars: 4, atk: 1600, def: 800, icon: "影", text: "攻击后自身攻击力提升 200。", afterAttack: "grow200" },
  { id: "iron-guardian", type: "monster", name: "铁壁守卫", element: "light", stars: 4, atk: 900, def: 2100, icon: "盾", text: "光属性。守备表示时用守备力结算，适合挡住高攻击怪兽。" },
  { id: "star-lancer", type: "monster", name: "星轨枪兵", element: "wind", stars: 4, atk: 1800, def: 1000, icon: "星", text: "风属性。高攻击力的前线怪兽。" },
  { id: "night-oracle", type: "monster", name: "夜幕司祭", element: "shadow", stars: 3, atk: 1100, def: 1600, icon: "月", text: "召唤时回复 300 点生命值。", onSummon: "heal300" },
  { id: "flare-titan", type: "monster", name: "熔核巨像", element: "fire", stars: 5, atk: 2200, def: 1500, icon: "核", text: "火属性。强力王牌怪兽，第一版无需祭品即可召唤。" },
  { id: "flame-captain", type: "monster", name: "焰心指挥官", element: "fire", stars: 4, atk: 1400, def: 1300, icon: "令", text: "召唤时，如果你场上还有火属性怪兽，我方攻击力最高怪兽提升 300。", onSummon: "fireBuff" },
  { id: "prism-saint", type: "monster", name: "辉棱圣徒", element: "light", stars: 3, atk: 1000, def: 1800, icon: "棱", text: "召唤时获得 400 护盾。" , onSummon: "shield400" },
  { id: "sky-raider", type: "monster", name: "天岚突袭者", element: "wind", stars: 4, atk: 1550, def: 900, icon: "岚", text: "攻击后，如果你场上有风属性怪兽，抽 1 张卡。", afterAttack: "windDraw" },
  { id: "dusk-alchemist", type: "monster", name: "暮影炼术师", element: "shadow", stars: 4, atk: 1450, def: 1500, icon: "炼", text: "召唤时，如果你场上有暗属性怪兽，对手受到 300 伤害。", onSummon: "shadowBurn" },
  { id: "nova-squire", type: "monster", name: "新星侍从", element: "fire", stars: 3, atk: 1250, def: 1100, icon: "新", text: "用于装备练习的火属性新手怪兽。" },
  { id: "aegis-mender", type: "monster", name: "庇护修补师", element: "light", stars: 3, atk: 900, def: 1700, icon: "护", text: "召唤时获得 400 护盾。", onSummon: "shield400" },
  { id: "star-soul-apprentice", type: "monster", name: "星魂学徒", element: "light", stars: 3, atk: 1100, def: 1300, icon: "魂", text: "召唤时，若我方场上有至少 2 种属性的怪兽，抽 1 张卡。", onSummon: "starSoulSurvey" },
  { id: "rift-bulwark", type: "monster", name: "裂隙壁卫", element: "shadow", stars: 4, atk: 1300, def: 1900, icon: "壁", text: "召唤时，若我方场上有至少 2 只暗属性怪兽，获得 300 护盾。", onSummon: "riftShelter" },
  { id: "burst-rune", type: "spell", name: "爆裂符文", icon: "爆", text: "对对手造成 500 点伤害。", effect: "burn500" },
  { id: "renewal", type: "spell", name: "星泉再生", icon: "泉", text: "回复 700 点生命值。", effect: "heal700" },
  { id: "war-chant", type: "spell", name: "战意高扬", icon: "战", text: "你场上攻击力最高的怪兽提升 500 攻击力。", effect: "buff500" },
  { id: "seer-call", type: "spell", name: "预见之召", icon: "抽", text: "抽 2 张卡。", effect: "draw2" },
  { id: "element-echo", type: "spell", name: "元素共鸣", icon: "鸣", text: "若你场上有至少 2 种属性，全体怪兽攻击力提升 200，并抽 1 张卡。", effect: "elementEcho" },
  { id: "twin-summon", type: "spell", name: "双重召唤", icon: "双", text: "本回合可以额外通常召唤 1 次。", effect: "extraSummon" },
  { id: "rally-strike", type: "spell", name: "连携突击", icon: "突", text: "让我方攻击力最高怪兽提升 300，并获得 1 次攻击重置；若已有怪兽攻击过，会优先让它再次可攻击。", effect: "rallyAttack" },
  { id: "star-shield", type: "spell", name: "星盾展开", icon: "盾", text: "获得 800 护盾，护盾会优先抵挡伤害。", effect: "shield800" },
  { id: "pierce-line", type: "spell", name: "破阵星芒", icon: "破", text: "让对手攻击力最高的怪兽攻击力和守备力下降 400，并对对手造成 200 点伤害。", effect: "pierceLine" },
  { id: "godbreaker-spear", type: "spell", name: "破神星矛", icon: "弑", text: "破神：选择对手攻击力最高的怪兽，无视神格目标抗性，使其攻击力和守备力下降 400，并对对手造成 200 点伤害。", summary: "可越过神格目标抗性的指定削弱魔法。", effect: "pierceLine", targetResistanceBypass: "divineTarget", rarity: "SR", archetype: "破神" },
  { id: "grave-return", type: "spell", name: "星尘回收", icon: "收", text: "将墓地 1 张非本卡的卡放回卡组顶，然后抽 1 张卡。", effect: "graveReturn" },
  { id: "battle-trance", type: "spell", name: "战斗狂热", icon: "狂", text: "我方攻击力最高的怪兽提升 200，并获得 1 次攻击重置。", effect: "battleTrance" },
  { id: "star-breach", type: "spell", name: "星隙穿透", icon: "隙", text: "本回合获得 1 次直接攻击许可：即使对手有怪兽，也可以点击敌方角色造成直接伤害。", effect: "directStrike" },
  { id: "flame-gale-burst", type: "spell", name: "炎岚合击", icon: "岚", text: "需要我方场上有火和风属性怪兽；对对手造成 400 点伤害，并让我方全体怪兽攻击力提升 200。", effect: "fireWindCombo" },
  { id: "starforge-fusion", type: "spell", name: "星魂融合", icon: "融", text: "选择我方手牌或场上的赤焰幼龙和疾风术士作为融合素材送入墓地，从手牌或卡组融合召唤焰岚合星者或岚耀守星者。", summary: "把手牌或场上的指定素材送入墓地，在进攻与防御两种融合形态中选择其一。", effect: "fusionSummon", fusion: { result: "flare-gale-archon", materials: ["ember-drake", "gale-mage"], options: [{ result: "flare-gale-archon", materials: ["ember-drake", "gale-mage"] }, { result: "tempest-aegis-archon", materials: ["ember-drake", "gale-mage"] }] } },
  { id: "eclipse-barrier", type: "spell", name: "晨昏星界", icon: "界", text: "需要我方场上有光和暗属性怪兽；获得 600 护盾，并抽 1 张卡。", effect: "lightShadowCombo" },
  { id: "blade-sigil", type: "spell", name: "锋刃刻印", icon: "刃", text: "装备给我方 1 只怪兽。只要此卡留在魔陷区，目标攻击力 +300。", effect: "equipBlade" },
  { id: "aegis-plate", type: "spell", name: "庇护甲片", icon: "甲", text: "装备给我方 1 只怪兽。只要此卡留在魔陷区，目标守备力 +500。", effect: "equipAegis" },
  { id: "prism-drive", type: "spell", name: "棱光驱动", icon: "棱", text: "装备给我方 1 只怪兽。目标攻击力 +200、守备力 +200。", effect: "equipPrism" },
  { id: "overclock-core", type: "spell", name: "超频核心", icon: "核", text: "装备给我方 1 只怪兽。目标攻击力 +600、守备力 -300。", effect: "equipOverclock" },
  { id: "dispelling-ray", type: "spell", name: "解印射线", icon: "解", text: "选择对手魔陷区 1 张卡破坏。若破坏装备魔法，持续加成会立刻失效。", effect: "destroySpellTrap" },
  { id: "soul-resonance", type: "spell", name: "星魂共鸣", icon: "鸣", text: "我方攻击力最高的怪兽攻击力和守备力提升 200。", effect: "soulResonance" },
  { id: "mirror-snare", type: "trap", name: "镜光反制", icon: "镜", text: "盖放后自动触发：对手攻击时，破坏攻击怪兽。", trigger: "attackDestroy" },
  { id: "guard-sigil", type: "trap", name: "守护刻印", icon: "印", text: "盖放后自动触发：你将受到直接攻击时，伤害变为 0，并抽 1 张卡。", trigger: "directShield" },
  { id: "summon-flare", type: "trap", name: "召雷陷阵", icon: "雷", text: "盖放后自动触发：对手召唤怪兽时，对其造成 400 点伤害。", trigger: "summonBurn" },
  { id: "counter-array", type: "trap", name: "反击阵列", icon: "阵", text: "盖放后自动触发：对手攻击时，取消攻击并让我方攻击力最低怪兽提升 400。", trigger: "counterBoost" },
  { id: "storm-shift", type: "trap", name: "风暴转移", icon: "转", text: "盖放后自动触发：对手攻击时，取消攻击并获得 400 护盾。", trigger: "attackShift" },
  { id: "void-lock", type: "trap", name: "星界封锁", icon: "封", text: "盖放后自动触发：对手攻击时，无效本次攻击并消耗攻击机会。", trigger: "attackNegate" },
  { id: "phantom-switch", type: "trap", name: "幻影换位", icon: "换", text: "盖放后自动触发：对手攻击时，将攻击目标改为我方另一只守备力最高的怪兽。", trigger: "redirectAttack" },
  { id: "weakening-web", type: "trap", name: "弱化力场", icon: "弱", text: "盖放后自动触发：对手攻击时，攻击怪兽攻击力和守备力下降 500，攻击继续结算。", trigger: "weakenAttack" },
  { id: "soul-parry", type: "trap", name: "星魂格挡", icon: "格", text: "盖放后自动触发：对手攻击时，攻击怪兽攻击力下降 300，并获得 300 护盾，攻击继续结算。", trigger: "soulParry" },
  { id: "reversal-flare", type: "trap", name: "逆焰护壁", icon: "返", text: "盖放后自动触发：你将受到直接攻击时，伤害变为 0，并反弹 500 点伤害。", trigger: "directRebound" },
  { id: "chain-nullifier", type: "trap", name: "断链裁决", icon: "断", text: "对手发动陷阱时可以连锁发动：无效那张陷阱的效果。", trigger: "chainNegate" }
  ,
  { id: "spark-runner", type: "monster", name: "星火信使", element: "wind", stars: 2, atk: 800, def: 1200, icon: "信", text: "召唤时抽 1 张卡。逆境中用来补足场面的小型星魂。", onSummon: "draw1" },
  { id: "spark-fragment-token", type: "monster", name: "星火衍生体", element: "wind", stars: 1, atk: 500, def: 500, icon: "衍", text: "由分裂效果生成的公开衍生物。可作为场上怪兽参与后续规则结算。", summary: "分裂效果生成的低星衍生物。", token: true },
  { id: "astral-comet-ace", type: "monster", name: "天穹逆星者", element: "light", stars: 5, atk: 2300, def: 1800, icon: "逆", text: "攻击后自身攻击力提升 200。主角在濒败时呼唤的反击核心。", afterAttack: "grow200" },
  { id: "last-spark", type: "spell", name: "余烬星愿", icon: "愿", text: "抽 2 张卡。卡组不足 2 张时不能发动。", effect: "comebackDraw" },
  { id: "spark-split", type: "spell", name: "星火分裂", icon: "分", text: "选择我方场上 1 只怪兽；在我方空怪兽区生成 2 只星火衍生体。", summary: "选择我方怪兽后生成两个公开衍生物。", effect: "splitToken" },
  { id: "starwake-recall", type: "spell", name: "醒星回召", icon: "召", text: "选择我方墓地 1 只怪兽，特殊回到怪兽区。", effect: "graveRevive" },
  { id: "dawn-edge", type: "spell", name: "破晓锋印", icon: "锋", text: "选择我方 1 只怪兽，攻击力提升 900。", effect: "dawnEdge" },
  { id: "limit-break-oath", type: "spell", name: "临界誓辉", icon: "誓", text: "生命值 1500 以下才能发动；选择我方攻击力最高的怪兽，攻击力提升 700。", effect: "lastStandSurge" },
  { id: "last-light-guard", type: "trap", name: "残光护幕", icon: "幕", text: "盖放后自动触发：对手攻击时，无效本次攻击并消耗攻击机会。", trigger: "attackNegate" },
  { id: "backlash-mirror", type: "trap", name: "逆光折返", icon: "返", text: "盖放后自动触发：你将受到直接攻击时，伤害变为 0，并反弹 500 点伤害。", trigger: "directRebound" },
  { id: "ember-soul-initiate", type: "monster", name: "星火引魂童", element: "fire", stars: 2, atk: 700, def: 1000, icon: "引", text: "王牌进化素材。小型星魂，擅长把火种接入更高阶的星铠。" },
  { id: "lumen-gearlet", type: "monster", name: "微光机巧卫", element: "light", stars: 2, atk: 900, def: 900, icon: "机", text: "王牌进化素材。守住场面并为星铠展开供能。" },
  { id: "starwell-runner", type: "monster", name: "星井巡游者", element: "wind", stars: 3, atk: 1000, def: 1300, icon: "巡", text: "召唤时抽 1 张卡，用来寻找进化资源。", onSummon: "draw1" },
  { id: "astral-forge-dragon", type: "monster", name: "天炉星铠王", element: "light", stars: 6, atk: 2500, def: 2100, icon: "铠", text: "由星魂铸升特殊召唤的王牌。攻击后自身攻击力提升 200。", afterAttack: "grow200" },
  { id: "void-siege-breaker", type: "monster", name: "虚痕镇压者", element: "shadow", stars: 5, atk: 2600, def: 1200, icon: "镇", text: "对手压制用高攻怪兽，擅长逼迫主角交出守护资源。" },
  { id: "soulforge-ascent", type: "spell", name: "星魂铸升", icon: "升", text: "需要我方场上有星火引魂童和微光机巧卫；将它们送入墓地，从手牌或卡组特殊召唤天炉星铠王，并压低对手场上怪兽。", effect: "aceEvolution" },
  { id: "material-reclaim", type: "spell", name: "星屑返轨", icon: "返", text: "将墓地 1 张非本卡的卡放回卡组顶，然后抽 1 张卡。", effect: "graveReturn" },
  { id: "corebreak-edict", type: "spell", name: "裂核裁令", icon: "裁", text: "选择对手攻击力最高的怪兽，攻击力和守备力下降 500。", effect: "aceCrackdown" },
  { id: "ace-vow-guard", type: "trap", name: "王牌誓护", icon: "誓", text: "盖放后自动触发：对手攻击时，无效本次攻击，并让我方攻击力最高的怪兽提升 900。", trigger: "aceGuard" },
  { id: "trio-sun-judicator", type: "monster", name: "曜冕裁决者", element: "light", stars: 7, atk: 3000, def: 1800, icon: "日", text: "三曜王牌之一。攻击结算后会破坏对手最靠前的魔陷区卡牌，逼迫防御资源提前交出。", afterAttack: "sunflareSunder" },
  { id: "trio-moon-warden", type: "monster", name: "月蚀守密者", element: "light", stars: 6, atk: 2100, def: 2500, icon: "月", text: "三曜王牌之一。配合月曜帷幕压低关键怪兽，使墓地回场后的反击无法直接成形。" },
  { id: "trio-star-herald", type: "monster", name: "星坠宣告者", element: "light", stars: 6, atk: 2400, def: 1400, icon: "星", text: "三曜王牌之一。攻击后追加 300 点终局压力，并提升自身攻击力 300。", afterAttack: "starDoomCharge" },
  { id: "trio-decoy-ward", type: "monster", name: "折光诱标卫", element: "light", stars: 2, atk: 1000, def: 3700, icon: "诱", text: "低星防线。正确路线中用来吸引日曜攻势，为反击回合争取窗口。" },
  { id: "trio-ember-pawn", type: "monster", name: "余烁小卫", element: "fire", stars: 1, atk: 600, def: 600, icon: "烁", text: "表面攻击力很低的终局关键怪兽。只有资源铺垫完成后才能突破三曜阵线。" },
  { id: "trio-moon-dominion", type: "spell", name: "月曜帷幕", icon: "幕", text: "持续魔法：选择对手 1 只怪兽，攻击力和守备力下降 900。此卡离场时修正会失效。", effect: "lunarDominion" },
  { id: "trio-solar-snare", type: "trap", name: "日冕诱锁", icon: "锁", text: "盖放后自动触发：对手攻击时，破坏攻击怪兽。用来诱导第一张三曜王牌踏入反制。", trigger: "attackDestroy" },
  { id: "trio-moonbreaker-ray", type: "spell", name: "碎月解幕", icon: "碎", text: "选择对手魔陷区 1 张卡破坏。用于清除持续压制后再展开墓地资源。", effect: "destroySpellTrap" },
  { id: "trio-ember-recall", type: "spell", name: "余烁归轨", icon: "归", text: "选择我方墓地 1 只怪兽，特殊回到怪兽区。终局战中用来让低星关键怪回场。", effect: "graveRevive" },
  { id: "trio-chain-veil", type: "trap", name: "星线护续", icon: "续", text: "盖放后自动触发：对手攻击时，无效本次攻击并消耗攻击机会。", trigger: "attackNegate" },
  { id: "trio-final-counter", type: "spell", name: "三曜终断", icon: "断", text: "生命值 1600 以下、余烁小卫在场，且月曜帷幕不在对手魔陷区时才能发动；强化攻击力最低的我方怪兽并获得一次攻击重置。", effect: "trioFinalCounter" }
];

export const monsterAssets = {
  "solar-vanguard": "assets/monster-solar-vanguard.png",
  "starfall-colossus": "assets/monster-starfall-colossus.png",
  "celestial-origin-dragon": "assets/monster-celestial-origin-dragon.png",
  "ember-drake": "assets/monster-ember-drake.png",
  "flare-gale-archon": "assets/monster-flare-gale-archon.png",
  "tempest-aegis-archon": "assets/monster-tempest-aegis-archon.png",
  "flare-titan": "assets/monster-flare-titan.png",
  "flame-captain": "assets/monster-flame-captain.png",
  "solar-knight": "assets/monster-solar-knight.png",
  "iron-guardian": "assets/monster-iron-guardian.png",
  "prism-saint": "assets/monster-prism-saint.png",
  "gale-mage": "assets/monster-gale-mage.png",
  "star-lancer": "assets/monster-star-lancer.png",
  "sky-raider": "assets/monster-sky-raider.png",
  "void-hound": "assets/monster-void-hound.png",
  "night-oracle": "assets/monster-night-oracle.png",
  "dusk-alchemist": "assets/monster-dusk-alchemist.png",
  "nova-squire": "assets/monster-nova-squire.png",
  "aegis-mender": "assets/monster-aegis-mender.png",
  "star-soul-apprentice": "assets/monster-star-soul-apprentice.png",
  "rift-bulwark": "assets/monster-rift-bulwark.png",
  "spark-runner": "assets/monster-spark-runner.png",
  "spark-fragment-token": "assets/monster-spark-fragment-token.png",
  "astral-comet-ace": "assets/monster-astral-comet-ace.png",
  "ember-soul-initiate": "assets/monster-ember-soul-initiate.png",
  "lumen-gearlet": "assets/monster-lumen-gearlet.png",
  "starwell-runner": "assets/monster-starwell-runner.png",
  "astral-forge-dragon": "assets/monster-astral-forge-dragon.png",
  "void-siege-breaker": "assets/monster-void-siege-breaker.png",
  "trio-sun-judicator": "assets/monster-trio-sun-judicator.png",
  "trio-moon-warden": "assets/monster-trio-moon-warden.png",
  "trio-star-herald": "assets/monster-trio-star-herald.png",
  "trio-decoy-ward": "assets/monster-trio-decoy-ward.png",
  "trio-ember-pawn": "assets/monster-trio-ember-pawn.png"
};

export const roleProfiles = {
  star: {
    name: "星辉使者",
    skill: "星脉连携",
    kind: "draw",
    passive: {
      id: "starLink",
      name: "星脉连携",
      operations: [{ op: "drawCards", player: "self", count: 1 }]
    },
    text: "每回合首次触发组合技时抽 1 张卡。"
  },
  blaze: {
    name: "炎岚指挥官",
    skill: "燃阵号令",
    kind: "buff",
    amount: 300,
    passive: {
      id: "blazeCommand",
      name: "燃阵号令",
      operations: [
        { op: "modifyStat", cardId: { playerId: "$action.playerId", zone: "monsterZone", rule: "strongestAtk" }, stat: "tempAtk", amount: 300 }
      ]
    },
    text: "每回合首次触发组合技时，强化我方攻击力最高怪兽。"
  },
  guard: {
    name: "辉棱守望者",
    skill: "棱光庇护",
    kind: "shield",
    amount: 500,
    passive: {
      id: "prismGuard",
      name: "棱光庇护",
      operations: [{ op: "gainShield", player: "self", amount: 500 }]
    },
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
      passive: {
        id: "shadowPressure",
        name: "暗影压迫",
        operations: [{ op: "dealDamage", player: "rival", amount: 150 }]
      },
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
      passive: {
        id: "scorchPursuit",
        name: "灼热追打",
        operations: [{ op: "dealDamage", player: "rival", amount: 220 }]
      },
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
      passive: {
        id: "mirrorStability",
        name: "镜域稳固",
        operations: [{ op: "gainShield", player: "self", amount: 450 }]
      },
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
      "nova-squire", "aegis-mender", "blade-sigil", "aegis-plate", "prism-drive", "overclock-core", "dispelling-ray",
      "mirror-snare", "guard-sigil", "summon-flare", "mirror-snare", "counter-array", "storm-shift", "void-lock", "phantom-switch", "weakening-web", "reversal-flare", "chain-nullifier"
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
      "pierce-line", "battle-trance", "star-breach", "flame-gale-burst", "nova-squire", "blade-sigil", "overclock-core", "dispelling-ray", "reversal-flare", "chain-nullifier"
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
      "grave-return", "pierce-line", "eclipse-barrier", "aegis-mender", "aegis-plate", "prism-drive", "dispelling-ray", "weakening-web", "reversal-flare", "chain-nullifier"
    ]
  },
  basicExpansion: {
    label: "星魂基础扩展 01",
    ids: [
      "star-soul-apprentice", "star-soul-apprentice", "rift-bulwark", "rift-bulwark",
      "gale-mage", "night-oracle", "solar-knight", "iron-guardian",
      "sky-raider", "dusk-alchemist", "nova-squire", "aegis-mender",
      "ember-drake", "star-lancer", "prism-saint", "void-hound",
      "soul-resonance", "soul-resonance", "seer-call", "seer-call",
      "element-echo", "star-shield", "war-chant", "twin-summon",
      "battle-trance", "grave-return", "pierce-line", "eclipse-barrier",
      "blade-sigil", "aegis-plate", "dispelling-ray",
      "soul-parry", "soul-parry", "weakening-web", "storm-shift",
      "guard-sigil", "mirror-snare", "counter-array", "void-lock",
      "reversal-flare", "chain-nullifier", "summon-flare"
    ]
  },
  protagonistComeback: {
    label: "星魂主角战役 01：逆境觉醒",
    ids: [
      "spark-runner", "spark-runner", "astral-comet-ace", "astral-comet-ace",
      "star-soul-apprentice", "gale-mage", "night-oracle", "solar-knight",
      "iron-guardian", "aegis-mender", "nova-squire", "void-hound",
      "star-lancer", "sky-raider", "ember-drake", "prism-saint",
      "last-spark", "last-spark", "starwake-recall", "starwake-recall",
      "dawn-edge", "dawn-edge", "limit-break-oath", "war-chant",
      "seer-call", "seer-call", "battle-trance", "rally-strike",
      "grave-return", "star-shield", "element-echo",
      "blade-sigil", "prism-drive", "pierce-line", "burst-rune",
      "last-light-guard", "last-light-guard", "backlash-mirror", "backlash-mirror",
      "mirror-snare"
    ]
  },
  protagonistAceEvolution: {
    label: "星魂主角战役 02：王牌进化",
    ids: [
      "ember-soul-initiate", "ember-soul-initiate", "ember-soul-initiate",
      "lumen-gearlet", "lumen-gearlet", "lumen-gearlet",
      "starwell-runner", "starwell-runner", "spark-runner", "spark-runner",
      "astral-forge-dragon", "astral-forge-dragon",
      "star-soul-apprentice", "gale-mage", "night-oracle", "solar-knight",
      "aegis-mender", "nova-squire", "prism-saint", "void-hound",
      "soulforge-ascent", "soulforge-ascent", "soulforge-ascent",
      "material-reclaim", "material-reclaim", "seer-call", "seer-call",
      "battle-trance", "battle-trance", "rally-strike", "star-shield",
      "soul-resonance", "dawn-edge", "grave-return", "element-echo",
      "ace-vow-guard", "ace-vow-guard", "last-light-guard", "backlash-mirror",
      "soul-parry", "storm-shift", "mirror-snare", "guard-sigil"
    ]
  },
  aceSuppressionRival: {
    label: "王牌压制对手",
    ids: [
      "void-siege-breaker", "void-siege-breaker", "void-siege-breaker",
      "corebreak-edict", "corebreak-edict", "corebreak-edict",
      "star-lancer", "star-lancer", "flare-titan", "flare-titan",
      "sky-raider", "sky-raider", "ember-drake", "ember-drake",
      "flame-captain", "flame-captain", "void-hound", "dusk-alchemist",
      "solar-knight", "iron-guardian", "gale-mage", "nova-squire",
      "burst-rune", "burst-rune", "war-chant", "war-chant",
      "rally-strike", "rally-strike", "pierce-line", "pierce-line",
      "battle-trance", "star-breach", "flame-gale-burst", "element-echo",
      "overclock-core", "blade-sigil", "dispelling-ray",
      "summon-flare", "summon-flare", "mirror-snare", "counter-array",
      "void-lock", "phantom-switch", "weakening-web", "chain-nullifier"
    ]
  },
  protagonistTrioOmega: {
    label: "星魂主角战役 03：终局三曜",
    ids: [
      "trio-decoy-ward", "trio-decoy-ward", "trio-decoy-ward",
      "trio-ember-pawn", "trio-ember-pawn", "trio-ember-pawn",
      "spark-runner", "spark-runner", "starwell-runner", "starwell-runner",
      "star-soul-apprentice", "gale-mage", "night-oracle", "aegis-mender",
      "solar-knight", "iron-guardian", "prism-saint", "nova-squire",
      "trio-ember-recall", "trio-ember-recall", "starwake-recall",
      "trio-moonbreaker-ray", "trio-moonbreaker-ray", "dispelling-ray",
      "trio-final-counter", "trio-final-counter", "last-spark", "seer-call",
      "battle-trance", "rally-strike", "soul-resonance", "star-shield",
      "trio-solar-snare", "trio-solar-snare", "trio-chain-veil", "trio-chain-veil",
      "last-light-guard", "backlash-mirror", "soul-parry", "phantom-switch",
      "weakening-web", "guard-sigil"
    ]
  },
  protagonistTrioOmegaFull: {
    label: "星魂主角战役 03：终局三曜完整对局",
    ids: [
      "spark-runner", "trio-solar-snare", "seer-call", "star-shield", "trio-ember-recall",
      "trio-moonbreaker-ray", "trio-ember-pawn", "trio-final-counter", "battle-trance", "trio-chain-veil",
      "starwell-runner", "trio-decoy-ward", "soul-resonance", "rally-strike", "trio-ember-pawn",
      "gale-mage", "star-soul-apprentice", "dispelling-ray", "last-spark", "trio-solar-snare",
      "iron-guardian", "prism-saint", "trio-ember-recall", "trio-moonbreaker-ray", "backlash-mirror",
      "last-light-guard", "aegis-mender", "spark-runner", "star-shield", "seer-call",
      "trio-decoy-ward", "spark-runner", "seer-call", "battle-trance", "rally-strike",
      "trio-solar-snare", "trio-chain-veil", "dispelling-ray", "starwake-recall", "grave-return"
    ]
  },
  trioOmegaRival: {
    label: "三曜压制对手",
    ids: [
      "trio-sun-judicator", "trio-sun-judicator", "trio-sun-judicator",
      "trio-moon-warden", "trio-moon-warden", "trio-moon-warden",
      "trio-star-herald", "trio-star-herald", "trio-star-herald",
      "trio-moon-dominion", "trio-moon-dominion", "trio-moon-dominion",
      "void-siege-breaker", "void-siege-breaker", "flare-titan", "flare-titan",
      "star-lancer", "star-lancer", "sky-raider", "sky-raider",
      "void-hound", "dusk-alchemist", "ember-drake", "flame-captain",
      "corebreak-edict", "corebreak-edict", "war-chant", "war-chant",
      "pierce-line", "pierce-line", "battle-trance", "rally-strike",
      "star-breach", "flame-gale-burst", "overclock-core", "blade-sigil",
      "summon-flare", "summon-flare", "mirror-snare", "counter-array",
      "void-lock", "phantom-switch", "chain-nullifier"
    ]
  },
  trioOmegaRivalFull: {
    label: "三曜完整压制对手",
    ids: [
      "trio-moon-dominion", "trio-sun-judicator", "trio-moon-warden", "trio-star-herald", "mirror-snare",
      "chain-nullifier", "trio-star-herald", "trio-sun-judicator", "war-chant", "trio-moon-dominion",
      "trio-moon-warden", "void-siege-breaker", "corebreak-edict", "summon-flare", "pierce-line",
      "trio-moon-dominion", "flare-titan", "star-lancer", "trio-sun-judicator", "void-lock",
      "trio-star-herald", "battle-trance", "trio-moon-warden", "mirror-snare", "overclock-core",
      "sky-raider", "dusk-alchemist", "ember-drake", "chain-nullifier", "rally-strike",
      "trio-moon-dominion", "trio-sun-judicator", "trio-moon-warden", "trio-star-herald", "mirror-snare",
      "chain-nullifier", "void-siege-breaker", "corebreak-edict", "pierce-line", "summon-flare"
    ]
  },
  suppressionRival: {
    label: "压制型对手",
    ids: [
      "star-lancer", "star-lancer", "flare-titan", "flare-titan",
      "sky-raider", "sky-raider", "ember-drake", "ember-drake",
      "flame-captain", "flame-captain", "void-hound", "dusk-alchemist",
      "solar-knight", "iron-guardian", "gale-mage", "nova-squire",
      "burst-rune", "burst-rune", "war-chant", "war-chant",
      "rally-strike", "rally-strike", "pierce-line", "pierce-line",
      "battle-trance", "star-breach", "flame-gale-burst", "element-echo",
      "overclock-core", "blade-sigil", "dispelling-ray",
      "summon-flare", "summon-flare", "mirror-snare", "mirror-snare",
      "counter-array", "void-lock", "phantom-switch", "weakening-web",
      "reversal-flare", "chain-nullifier", "guard-sigil"
    ]
  }
};

export const characterProfiles = {
  player: { ...roleProfiles.star },
  ai: { ...aiProfiles.balanced.profile }
};

export const scenarioSetups = {
  tributeSummon: {
    label: "祭品召唤测试",
    difficulty: "demo",
    text: "起手提供 1 只场上怪兽和 1 只需要祭品的高阶怪兽，用来验证祭品召唤流程。",
    goal: "选择曜锋先锋，献祭场上的星火信使后完成祭品召唤。",
    objectives: ["选择手牌中的曜锋先锋。", "选择场上的星火信使作为祭品。", "确认祭品召唤后继续决斗。"],
    hints: ["祭品召唤不会改变旧的普通召唤次数规则。", "被献祭的怪兽会进入己方墓地。"],
    playerHand: ["solar-vanguard", "war-chant"],
    playerField: ["spark-runner"],
    playerDeck: ["solar-knight"],
    aiField: ["iron-guardian"],
    aiHand: [],
    aiDeck: []
  },
  tributeSummonDouble: {
    label: "双祭品召唤测试",
    difficulty: "demo",
    text: "起手提供 2 只场上怪兽和 1 只需要双祭品的大型怪兽，用来验证多素材祭品召唤流程。",
    goal: "选择坠星巨卫，献祭两只我方场上怪兽后完成双祭品召唤。",
    objectives: ["选择手牌中的坠星巨卫。", "选择场上的星火信使和微光机巧卫作为祭品。", "确认双祭品召唤后继续决斗。"],
    hints: ["双祭品召唤必须正好选择 2 只我方场上怪兽。", "被献祭的怪兽都会进入己方墓地。"],
    playerHand: ["starfall-colossus", "war-chant"],
    playerField: ["spark-runner", "lumen-gearlet"],
    playerDeck: ["solar-knight"],
    aiField: ["iron-guardian"],
    aiHand: [],
    aiDeck: []
  },
  divineSummon: {
    label: "神格召唤测试",
    difficulty: "demo",
    text: "起手提供 3 只场上怪兽和 1 只需要三祭品的神格怪兽，用来验证神卡登场流程。",
    goal: "选择创星神龙，献祭三只我方场上怪兽后完成神格召唤。",
    objectives: ["选择手牌中的创星神龙。", "依次选择三只我方场上怪兽作为祭品。", "确认后让创星神龙登场，并检查日志与详情。"],
    hints: ["神格怪需要 3 只祭品登场，并拥有每己方回合一次的破坏防护。", "被献祭的三只怪兽都会进入己方墓地，神格怪会占用其中一个离场后的召唤区。"],
    playerHand: ["celestial-origin-dragon", "war-chant"],
    playerField: ["spark-runner", "lumen-gearlet", "ember-soul-initiate"],
    playerDeck: ["solar-knight"],
    aiField: ["iron-guardian"],
    aiHand: [],
    aiDeck: []
  },
  divineGuard: {
    label: "神格守护测试",
    difficulty: "demo",
    text: "创星神龙已经在场，AI 盖着镜光反制，用来验证神格守护会防止首次破坏。",
    goal: "用创星神龙攻击铁壁守卫，触发镜光反制后确认神格守护保留创星神龙。",
    objectives: ["选择场上的创星神龙。", "攻击 AI 场上的铁壁守卫。", "确认镜光反制公开后，创星神龙没有被破坏。"],
    hints: ["神格守护只防止破坏，不会免疫伤害、祭品、回手或其它非破坏移动。", "防护用掉后会显示为已用，并在己方下个回合开始时恢复。"],
    playerHand: ["war-chant"],
    playerField: ["celestial-origin-dragon"],
    playerDeck: ["solar-knight"],
    aiField: ["iron-guardian"],
    aiTraps: ["mirror-snare"],
    aiHand: [],
    aiDeck: []
  },
  divinePierce: {
    label: "神格贯穿测试",
    difficulty: "demo",
    text: "创星神龙已经在场，AI 的铁壁守卫处于守备表示，用来验证神格贯穿会造成守备差值伤害。",
    goal: "用创星神龙攻击守备表示的铁壁守卫，确认守备怪被击破且 AI 承受贯穿伤害。",
    objectives: ["选择场上的创星神龙。", "攻击 AI 守备表示的铁壁守卫。", "确认战斗日志写出神格贯穿并造成差值伤害。"],
    hints: ["普通怪兽击破守备怪兽不会造成生命值伤害。", "神格贯穿只在攻击守备怪兽且攻击力高于守备力时生效。"],
    playerHand: ["war-chant"],
    playerField: ["celestial-origin-dragon"],
    playerDeck: ["solar-knight"],
    aiField: [{ id: "iron-guardian", mode: "defense", changedMode: true }],
    aiHand: [],
    aiDeck: []
  },
  divinePressure: {
    label: "神格威压测试",
    difficulty: "demo",
    text: "创星神龙已经在场，AI 拥有 800 护盾但没有怪兽，用来验证神格威压会先消解护盾再结算伤害。",
    goal: "用创星神龙直接攻击 AI，确认神格威压先消解 500 护盾，剩余护盾再吸收伤害。",
    objectives: ["选择场上的创星神龙。", "直接攻击 AI。", "确认战斗日志写出神格威压并造成正确生命值伤害。"],
    hints: ["普通伤害会先被护盾完整吸收。", "神格威压只消解护盾，不会在没有造成伤害时凭空扣生命值。"],
    playerHand: ["war-chant"],
    playerField: ["celestial-origin-dragon"],
    playerDeck: ["solar-knight"],
    aiShield: 800,
    aiField: [],
    aiHand: [],
    aiDeck: []
  },
  divineResistance: {
    label: "神格抗性测试",
    difficulty: "demo",
    text: "AI 场上有创星神龙和坠星巨卫，用来验证对手效果不能指定神格怪兽。",
    goal: "发动破阵星芒，确认创星神龙不会成为指定目标，效果改为命中下一只可被指定的最高攻击怪兽。",
    objectives: ["查看 AI 场上的创星神龙详情。", "发动手牌中的破阵星芒。", "选择 AI 场上的坠星巨卫并确认创星神龙未被削弱。"],
    hints: ["神格抗性只阻止对手的指定目标效果，不会阻止战斗、祭品或非指定全场效果。", "最高攻击力目标会在可被指定的怪兽中重新计算。"],
    playerHand: ["pierce-line", "war-chant"],
    playerField: ["star-lancer"],
    playerDeck: ["solar-knight"],
    aiField: ["celestial-origin-dragon", "starfall-colossus"],
    aiHand: [],
    aiDeck: []
  },
  divineBreak: {
    label: "破神对策测试",
    difficulty: "demo",
    text: "AI 场上有创星神龙和坠星巨卫，用来验证带有破神标签的指定效果可以越过神格抗性。",
    goal: "发动破神星矛，指定攻击力最高的创星神龙，确认神格抗性被越过并正确结算削弱。",
    objectives: ["查看破神星矛的完整效果。", "发动破神星矛并选择 AI 场上的创星神龙。", "确认创星神龙攻守下降，且牌局仍能继续。"],
    hints: ["只有明确带有对应破神标签的效果才能越过神格目标抗性。", "普通破阵星芒仍然不能指定创星神龙，旧有抗性规则没有失效。"],
    playerHand: ["godbreaker-spear", "pierce-line"],
    playerField: ["star-lancer"],
    playerDeck: ["solar-knight"],
    aiField: ["celestial-origin-dragon", "starfall-colossus"],
    aiHand: [],
    aiDeck: []
  },
  fusionSummon: {
    label: "融合召唤测试",
    difficulty: "demo",
    text: "起手提供融合魔法、两只公开素材和卡组中的融合怪兽，用来验证手动选择素材的融合召唤流程。",
    goal: "选择星魂融合，再选择赤焰幼龙和疾风术士作为融合素材，融合召唤焰岚合星者。",
    objectives: ["选择手牌中的星魂融合。", "选择场上的赤焰幼龙和疾风术士作为融合素材。", "确认融合召唤后继续决斗。"],
    hints: ["融合素材必须已经在我方场上。", "被选为融合素材的怪兽会进入己方墓地。", "融合怪兽会从手牌或卡组特殊召唤到素材离开的格子。"],
    playerHand: ["starforge-fusion", "war-chant"],
    playerField: ["ember-drake", "gale-mage"],
    playerDeck: ["solar-knight", "flare-gale-archon"],
    aiField: ["iron-guardian"],
    aiHand: [],
    aiDeck: []
  },
  fusionMixedMaterials: {
    label: "混合素材融合测试",
    difficulty: "demo",
    text: "赤焰幼龙在场、疾风术士在手牌，用来验证融合召唤可以混合使用手牌与场上素材。",
    goal: "发动星魂融合，分别选择场上的赤焰幼龙和手牌中的疾风术士，融合召唤焰岚合星者。",
    objectives: ["选择手牌中的星魂融合。", "选择场上的赤焰幼龙和手牌中的疾风术士。", "确认两张素材进入墓地且焰岚合星者登场。"],
    hints: ["融合素材可以来自手牌或我方场上，但必须符合卡牌定义中的指定配方。", "手牌素材不会先登场，也不会消耗通常召唤次数。"],
    playerHand: ["starforge-fusion", "gale-mage", "war-chant"],
    playerField: ["ember-drake"],
    playerDeck: ["solar-knight", "flare-gale-archon"],
    aiField: ["iron-guardian"],
    aiHand: [],
    aiDeck: []
  },
  fusionResultChoice: {
    label: "融合形态选择测试",
    difficulty: "demo",
    text: "同一组素材可融合为进攻或防御形态，用来验证玩家明确选择融合结果。",
    goal: "发动星魂融合，选择岚耀守星者，再以赤焰幼龙和疾风术士作为素材完成融合召唤。",
    objectives: ["选择手牌中的星魂融合。", "选择岚耀守星者作为融合结果。", "选择场上与手牌中的指定素材并确认融合召唤。"],
    hints: ["焰岚合星者擅长持续进攻；岚耀守星者拥有更高守备力并在登场时获得护盾。", "选择结果不会改变素材要求，也不会消耗通常召唤次数。"],
    recommendedLine: ["选择岚耀守星者，使用场上的赤焰幼龙和手牌中的疾风术士作为素材。"],
    playerHand: ["starforge-fusion", "gale-mage", "war-chant"],
    playerField: ["ember-drake"],
    playerDeck: ["solar-knight", "flare-gale-archon", "tempest-aegis-archon"],
    aiField: ["iron-guardian"],
    aiHand: [],
    aiDeck: []
  },
  splitToken: {
    label: "分裂衍生物测试",
    difficulty: "demo",
    text: "起手提供分裂魔法和 1 只公开怪兽，用来验证生成衍生物的规则闭环。",
    goal: "选择星火分裂，再选择星火信使作为分裂目标，生成两只星火衍生体。",
    objectives: ["选择手牌中的星火分裂。", "选择场上的星火信使作为分裂目标。", "确认后生成两只星火衍生体。"],
    hints: ["衍生物由规则事件生成，不来自手牌或卡组。", "生成后的衍生物是公开怪兽，可以点击查看详情。"],
    playerHand: ["spark-split", "war-chant"],
    playerField: ["spark-runner"],
    playerDeck: ["solar-knight"],
    aiField: ["iron-guardian"],
    aiHand: [],
    aiDeck: []
  },
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
  counterChain: {
    label: "AI 反制连锁",
    text: "双方都预置陷阱；玩家发动反击阵列后，AI 会用断链裁决追加连锁。",
    goal: "结束回合并发动反击阵列；AI 应追加连锁 2，无效反击阵列，随后攻击继续结算。",
    playerHand: [],
    playerField: ["gale-mage"],
    playerTraps: ["counter-array"],
    playerDeck: [],
    aiField: ["star-lancer"],
    aiTraps: ["chain-nullifier"],
    aiHand: [],
    aiDeck: []
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
    text: "起手给熔核巨像和强化卡，对手场上有目标，方便查看王牌攻击特写动画。",
    goal: "召唤熔核巨像后攻击对手怪兽，观察王牌攻势特写动画。",
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
  directTrap: {
    label: "直击陷阱",
    text: "我方空场且手牌含风暴转移，AI 场上有三只攻击怪兽，用来验证直击扣血和陷阱次数。",
    goal: "盖放风暴转移后结束回合；AI 直击时应提示发动，且本回合只发动一张陷阱。",
    playerHand: ["storm-shift"],
    playerField: [],
    aiField: ["star-lancer", "sky-raider", "gale-mage"],
    aiHand: [],
    aiDeck: ["guard-sigil"]
  },
  trapChoice: {
    label: "陷阱选择",
    text: "我方预置两张可响应攻击的陷阱，AI 场上有攻击怪兽，用来验证响应窗口多选一。",
    goal: "AI 攻击时两张陷阱都应高亮；选择其中一张发动后，另一张保留。",
    playerHand: [],
    playerField: [],
    playerTraps: ["mirror-snare", "void-lock"],
    aiField: ["star-lancer"],
    aiHand: []
  },
  guardSkip: {
    label: "守备停攻",
    text: "我方铁壁守卫守备表示，AI 星轨枪兵攻击力不足，用来验证 AI 不会白撞高防。",
    goal: "结束回合后 AI 应保留攻击，不造成伤害，也不消耗怪兽。",
    playerHand: [],
    playerField: [{ id: "iron-guardian", mode: "defense", changedMode: true }],
    aiField: ["star-lancer"],
    aiHand: [],
    aiDeck: ["guard-sigil"]
  },
  summonEffects: {
    label: "召唤效果",
    text: "手牌含赤焰幼龙、疾风术士和夜幕司祭，验证基础召唤成功效果由引擎事件结算。",
    goal: "召唤后应分别产生伤害、抽卡和回血事件，UI 只根据事件表现。",
    playerHand: ["ember-drake", "gale-mage", "night-oracle"],
    playerDeck: ["solar-knight", "prism-saint"],
    aiHand: [],
    aiDeck: ["guard-sigil"]
  },
  summonFireBuff: {
    label: "召唤火强化",
    text: "场上已有赤焰幼龙，手牌含焰心指挥官，用来验证条件召唤加攻效果由引擎事件结算。",
    goal: "召唤焰心指挥官后，攻击力最高怪兽应通过规则事件获得攻击力提升。",
    playerHand: ["flame-captain"],
    playerField: ["ember-drake"],
    playerDeck: [],
    aiHand: [],
    aiDeck: []
  },
  summonShield: {
    label: "召唤护盾",
    text: "手牌含辉棱圣徒，用来验证召唤护盾效果由引擎事件结算。",
    goal: "召唤后应通过规则事件增加我方护盾。",
    playerHand: ["prism-saint"],
    playerDeck: [],
    aiHand: [],
    aiDeck: []
  },
  summonShadowBurn: {
    label: "召唤暗伤",
    text: "场上已有夜幕司祭，手牌含暮影炼术师，用来验证条件召唤伤害效果由引擎事件结算。",
    goal: "召唤暮影炼术师后，对手应通过规则事件受到 300 点伤害。",
    playerHand: ["dusk-alchemist"],
    playerField: ["night-oracle"],
    playerDeck: [],
    aiHand: [],
    aiDeck: []
  },
  summonTrap: {
    label: "召唤陷阱响应",
    text: "我方手牌含召雷陷阵，AI 手牌只有一只怪兽，用来验证召唤成功后的陷阱响应窗口。",
    goal: "盖放召雷陷阵后结束回合；AI 召唤时发动陷阱，应通过完整连锁造成 400 点伤害。",
    playerHand: ["summon-flare"],
    playerField: [],
    playerDeck: ["renewal"],
    aiField: [],
    aiHand: ["solar-knight"],
    aiDeck: ["guard-sigil"]
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
    goal: "盖放幻影换位后让 AI 攻击低守备目标；发动会改到铁壁守卫，拒绝则按原目标结算。",
    playerHand: ["phantom-switch", "war-chant", "seer-call"],
    playerField: [
      { id: "gale-mage", mode: "defense" },
      { id: "iron-guardian", mode: "defense" }
    ],
    aiField: ["star-lancer"],
    aiHand: ["burst-rune"]
  },
  phantomRedirect: {
    label: "幻影换位回归",
    text: "按连锁测试牌面预置天岚突袭者、暮影炼术师、铁壁守卫和幻影换位，用来复现攻击目标重定向后的结算目标。",
    goal: "盖放幻影换位后结束回合；AI 强化天岚突袭者并攻击暮影炼术师，发动陷阱后应改为铁壁守卫承接战斗。",
    playerHand: ["phantom-switch"],
    playerField: [
      { id: "dusk-alchemist", mode: "attack" },
      { id: "iron-guardian", mode: "defense" }
    ],
    playerDeck: ["seer-call"],
    aiField: ["sky-raider"],
    aiHand: ["war-chant"],
    aiDeck: ["guard-sigil"]
  },
  equipment: {
    label: "装备魔法",
    text: "起手包含怪兽和装备魔法，用来验证持续魔法效果。",
    goal: "发动锋刃刻印和庇护甲片后，卡牌应留在魔陷区，并通过规则事件持续修改目标数值。",
    playerHand: ["blade-sigil", "aegis-plate", "prism-drive", "overclock-core", "dispelling-ray", "nova-squire", "aegis-mender"],
    playerField: ["star-lancer"],
    playerDeck: [],
    aiField: ["iron-guardian"],
    aiHand: [],
    aiDeck: []
  },
  expansionSummon: {
    label: "扩展召唤演示",
    text: "起手包含星魂学徒和星魂共鸣，场上已有风属性怪兽，用来验证基础扩展的召唤抽牌和目标魔法。",
    goal: "召唤星魂学徒应通过规则事件抽卡；发动星魂共鸣只能选择我方攻击力最高的怪兽。",
    difficulty: "demo",
    objectives: [
      "召唤星魂学徒，确认召唤抽牌由规则事件结算。",
      "发动星魂共鸣，观察目标必须是我方攻击力最高的怪兽。"
    ],
    playerHand: ["star-soul-apprentice", "soul-resonance"],
    playerField: ["gale-mage"],
    playerDeck: ["solar-knight"],
    aiField: ["iron-guardian"],
    aiHand: [],
    aiDeck: ["guard-sigil"]
  },
  expansionParry: {
    label: "扩展格挡演示",
    text: "起手包含裂隙壁卫和星魂格挡，场上已有暗属性怪兽，用来验证基础扩展的护盾与攻击响应。",
    goal: "召唤裂隙壁卫获得护盾，盖放星魂格挡后让对手攻击，陷阱应削弱攻击怪兽并继续结算。",
    difficulty: "demo",
    objectives: [
      "召唤裂隙壁卫，确认护盾获得由规则事件结算。",
      "发动星魂共鸣，强化当前最高攻击的我方怪兽。",
      "盖下星魂格挡，展示攻击响应和减攻结算。"
    ],
    playerHand: ["rift-bulwark", "soul-resonance", "soul-parry"],
    playerField: ["night-oracle"],
    playerDeck: [],
    aiField: ["star-lancer"],
    aiHand: [],
    aiDeck: ["guard-sigil"]
  },
  protagonistComeback: {
    label: "逆境觉醒演示",
    text: "主角生命值很低，场面落后；手牌和墓地预置抽牌、复活、加攻与防御陷阱，用来演示关键资源到手后的翻盘节奏。",
    goal: "发动余烬星愿补资源，醒星回召复活天穹逆星者，盖放残光护幕后挡下对手攻击，再用强化后的王牌完成反击。",
    difficulty: "demo",
    objectives: [
      "体验低生命值下抽牌、复活、盖陷阱的连续爽点。",
      "复活天穹逆星者并叠加爆发，展示主角王牌返场。",
      "用残光护幕挡下攻击，再完成一次反击攻击。"
    ],
    playerLp: 900,
    aiLp: 3000,
    playerHand: ["last-spark", "starwake-recall", "dawn-edge", "last-light-guard", "limit-break-oath"],
    playerDeck: ["spark-runner", "backlash-mirror", "star-shield"],
    playerField: ["spark-runner"],
    playerGrave: ["astral-comet-ace"],
    aiField: ["flare-titan"],
    aiHand: [],
    aiDeck: ["guard-sigil"]
  },
  protagonistComebackChallenge: {
    label: "逆境觉醒挑战",
    text: "主角仍处在低生命值与场面劣势中，但墓地、手牌和对手盖卡都会惩罚无脑全点。需要先补资源，正确回召王牌，保留再攻击资源，并在反击前处理对手的反制陷阱。",
    goal: "先用余烬星愿补牌，醒星回召必须选择天穹逆星者；第一回合盖下残光护幕并忍住不攻，挡下对手攻击后抽到解印射线，先清掉对手盖卡，再用战斗狂热开启反击。",
    difficulty: "challenge",
    objectives: [
      "先补两张资源，不要先把强化交给低星怪。",
      "醒星回召选择天穹逆星者，而不是星火信使。",
      "第一回合盖下残光护幕，挡住对手关键攻击。",
      "反击前先用解印射线清掉镜光反制。"
    ],
    hints: [
      "墓地列表从左到右不是推荐顺序，低星怪只是干扰目标。",
      "战斗狂热最好留到反击回合，确保王牌能连续攻击。",
      "如果没有盖残光护幕，对手攻击星火信使会直接形成斩杀。"
    ],
    recommendedLine: [
      "余烬星愿补资源",
      "醒星回召选择天穹逆星者",
      "破晓锋印和临界誓辉交给王牌",
      "盖残光护幕并结束回合",
      "解印射线清反制后战斗狂热反击"
    ],
    playerLp: 900,
    aiLp: 3400,
    playerHand: ["dawn-edge", "last-spark", "starwake-recall", "last-light-guard", "limit-break-oath"],
    playerDeck: ["battle-trance", "backlash-mirror", "dispelling-ray"],
    playerField: ["spark-runner"],
    playerGrave: ["spark-runner", "astral-comet-ace"],
    aiField: ["flare-titan"],
    aiTraps: ["mirror-snare"],
    aiHand: [],
    aiDeck: ["renewal"]
  },
  protagonistFinalCounter: {
    label: "终局反击演示",
    text: "主角空场低生命值，预置直击反弹陷阱和复活资源，展示先挡下终结攻击再返场的终局感。",
    goal: "盖放逆光折返并结束回合；对手直击时反弹伤害，随后利用墓地王牌寻找反击窗口。",
    playerLp: 700,
    aiLp: 1200,
    playerHand: ["backlash-mirror", "starwake-recall", "dawn-edge"],
    playerDeck: ["last-spark", "spark-runner"],
    playerField: [],
    playerGrave: ["astral-comet-ace"],
    aiField: ["star-lancer"],
    aiHand: [],
    aiDeck: ["guard-sigil"]
  },
  protagonistAceEvolution: {
    label: "王牌进化演示",
    text: "主角已经站住两只进化素材，手牌持有星魂铸升；对手场上有压制怪，适合演示素材送墓、王牌从卡组登场和登场压场。",
    goal: "发动星魂铸升，将两只素材送墓，特殊召唤天炉星铠王，并观察对手场上怪兽被压低。",
    difficulty: "demo",
    objectives: [
      "用两只素材发动星魂铸升，展示素材送墓。",
      "从卡组特殊召唤天炉星铠王。",
      "观察登场后压低对手场面并形成反击。"
    ],
    playerHand: ["soulforge-ascent", "starwell-runner", "material-reclaim"],
    playerDeck: ["astral-forge-dragon", "ace-vow-guard", "battle-trance"],
    playerField: ["ember-soul-initiate", "lumen-gearlet"],
    playerGrave: ["spark-runner"],
    aiField: ["void-siege-breaker"],
    aiHand: [],
    aiDeck: ["guard-sigil"]
  },
  protagonistAceProtection: {
    label: "王牌守护演示",
    text: "主角王牌已登场，对手握有裂核裁令并准备高攻压制；主角需要盖放王牌誓护守住王牌，再完成反击。",
    goal: "盖放王牌誓护并结束回合；对手削弱并攻击王牌时发动陷阱守住，再用王牌反击。",
    difficulty: "demo",
    objectives: [
      "盖下王牌誓护，准备应对对手解场。",
      "在对手攻击响应中守住王牌。",
      "用存活的王牌完成反击。"
    ],
    playerHand: ["ace-vow-guard", "battle-trance"],
    playerDeck: ["soulforge-ascent", "material-reclaim"],
    playerField: ["astral-forge-dragon"],
    playerTraps: ["last-light-guard"],
    aiField: ["void-siege-breaker"],
    aiHand: ["corebreak-edict"],
    aiDeck: ["guard-sigil"]
  },
  protagonistTrioOmega: {
    label: "终局三曜演示",
    text: "对手已经展开日曜、月曜、星曜三张压场王牌；月曜帷幕正在削弱诱标卫，玩家需要先盖下诱锁挡住日曜攻击，再清除帷幕、回收墓地小怪并完成终局反击。",
    goal: "盖放日冕诱锁并结束回合；挡下日曜攻击后，用碎月解幕清掉月曜帷幕，余烁归轨回场余烁小卫，再发动三曜终断连续突破月曜与星曜。",
    difficulty: "demo",
    objectives: [
      "观察三曜王牌同时压场：高攻、持续削弱、终局追击。",
      "用日冕诱锁诱导并破解日曜攻击。",
      "清除月曜帷幕后，让墓地低星怪成为终局突破点。"
    ],
    hints: [
      "折光诱标卫被月曜帷幕压低，清除帷幕后数值会由规则引擎释放。",
      "三曜终断不能在月曜帷幕仍在场时发动。",
      "胜利来自余烁小卫的连续攻击，不是高攻怪兽碾压。"
    ],
    recommendedLine: [
      "盖放日冕诱锁并结束回合",
      "在日曜攻击响应中发动日冕诱锁",
      "碎月解幕破坏月曜帷幕",
      "余烁归轨选择余烁小卫",
      "三曜终断后连续攻击月曜与星曜"
    ],
    playerLp: 1300,
    aiLp: 900,
    playerHand: ["trio-solar-snare", "trio-moonbreaker-ray", "trio-ember-recall", "trio-final-counter"],
    playerDeck: ["trio-chain-veil", "last-spark"],
    playerField: [{ id: "trio-decoy-ward", mode: "defense", changedMode: true }],
    playerGrave: ["trio-ember-pawn"],
    aiField: ["trio-sun-judicator", "trio-moon-warden", "trio-star-herald"],
    aiTraps: ["trio-moon-dominion"],
    aiHand: [],
    aiDeck: ["eclipse-barrier"],
    setupContinuousEffects: [{
      source: { owner: "ai", zone: "traps", index: 0 },
      target: { owner: "player", zone: "field", index: 0 },
      effectId: "lunarDominion"
    }]
  },
  protagonistTrioOmegaChallenge: {
    label: "终局三曜挑战",
    text: "终局战结构复现：三张原创三曜王牌分工压制。挑战版不再把答案一次交到手里，错误回召或急着攻击都会消耗关键资源，必须先撑过对手回合再组织反击。",
    goal: "保留墓地里的真正终局资源，先布置防御并撑过日曜攻势；回到自己回合后再判断清场、回召和终断的顺序。",
    difficulty: "challenge",
    objectives: [
      "不要直接攻击曜冕裁决者，低星怪会被高攻反杀。",
      "不要把唯一回召浪费在看起来更强的墓地怪兽上。",
      "第一回合不能完成胜利，必须先布置防御并跨过对手回合。",
      "反击前必须清除月曜帷幕，否则三曜终断不能转化为胜势。"
    ],
    hints: [
      "墓地里攻击力最高的怪兽并不一定是正确回召目标。",
      "能点的魔法不代表现在就该点；唯一回召被用掉后不会回来。",
      "攻击力最高的敌人常常只是诱导错误路线的显眼目标。"
    ],
    recommendedLine: [
      "先保住防御窗口，不要急着用完手牌。",
      "回到自己回合后再处理持续压制。",
      "最后的胜点来自被保留的低星墓地资源。"
    ],
    playerLp: 1300,
    aiLp: 900,
    playerHand: ["trio-solar-snare", "trio-ember-recall", "trio-final-counter"],
    playerDeck: ["trio-chain-veil", "trio-moonbreaker-ray", "last-spark"],
    playerField: [{ id: "trio-decoy-ward", mode: "defense", changedMode: true }],
    playerGrave: ["flare-titan", "trio-ember-pawn"],
    aiField: ["trio-sun-judicator", "trio-moon-warden", "trio-star-herald"],
    aiTraps: ["trio-moon-dominion"],
    aiHand: [],
    aiDeck: ["eclipse-barrier"],
    setupContinuousEffects: [{
      source: { owner: "ai", zone: "traps", index: 0 },
      target: { owner: "player", zone: "field", index: 0 },
      effectId: "lunarDominion"
    }]
  },
  protagonistTrioOmegaFull: {
    label: "终局三曜完整对局",
    text: "从 4000 生命值和完整牌堆开始的三曜主题对局。对手会优先建立三曜压制，玩家需要用低星资源、抽滤、防御陷阱和墓地回收逐步换取反击窗口。",
    goal: "在正常起手和长牌堆中识别三曜压制核心；先守住关键资源，再清理持续压制并利用保留下来的低星资源建立优势。",
    difficulty: "challenge",
    aiStyle: "scriptedPressure",
    objectives: [
      "在完整对局中识别三曜压制核心。",
      "不要把回召资源浪费在看似更直观的高攻诱饵上。",
      "保留防御手段，等待反击窗口。"
    ],
    hints: [
      "对手场上最亮眼的攻击力不一定是第一优先目标。",
      "先铺资源或防御通常比立刻打出所有手牌更稳。",
      "持续压制不清掉时，墓地资源和终局反击都很难转化成胜势。"
    ],
    recommendedLine: [
      "用低星怪和防御陷阱撑过第一轮压制。",
      "等对手三曜压力落地后，再选择清后场或保留墓地回收。",
      "反击窗口来自前面留下的低星资源和防御交换，而不是起手高攻碾压。"
    ],
    playerLp: 4000,
    aiLp: 4000,
    openingDrawCount: 5,
    playerHand: [],
    aiHand: [],
    playerField: [],
    aiField: [],
    playerGrave: [],
    aiGrave: [],
    playerDeck: deckPresets.protagonistTrioOmegaFull.ids,
    aiDeck: deckPresets.trioOmegaRivalFull.ids
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
