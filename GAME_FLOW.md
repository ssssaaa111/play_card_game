# 游戏流程与状态机

最后更新：2026-06-17

本文描述当前实现中的真实流程。规则变化时，应同时更新对应流程图、阶段表和事件说明。

## 状态所有权

```mermaid
flowchart LR
    Input[玩家或 AI 操作] --> Command[GameEngine.dispatch Command]
    Command --> Validate[校验回合 阶段 时点 条件 目标]
    Validate --> Events[产生 GameEvent]
    Events --> Apply[applyGameEvent 修改规则状态]
    Apply --> Invariants[assertValidGameState]
    Invariants --> Adapter[engine-adapter 回放到 UI 状态]
    Adapter --> View[渲染 动画 音效 语音 日志]
```

- `GameEngine` 是规则真相来源。
- 卡牌和公共操作不能直接修改规则状态，只能产生事件。
- `engine-adapter` 负责把规则事件投影到当前固定槽位 UI。
- 动画、声音、选中状态和 DOM 不属于核心规则状态。

## 一局游戏

```mermaid
flowchart TD
    Setup[setup 开局配置] --> Start[玩家点击开始决斗]
    Start --> Opening[双方起手抽 5 张]
    Opening --> PlayerTurn[START_TURN 玩家]
    PlayerTurn --> Draw[draw 自动抽 1 张]
    Draw --> Main[main 主要阶段]
    Main --> Decision{还有合法操作吗}
    Decision -->|召唤 魔法 盖陷阱 切换表示| Main
    Decision -->|可以攻击或使用战斗阶段卡牌| Battle[battle 战斗阶段]
    Decision -->|没有操作| AutoEnd[autoEnd 反应时间]
    Battle --> BattleDecision{还有合法操作吗}
    BattleDecision -->|攻击 魔法 盖陷阱| Battle
    BattleDecision -->|没有操作或主动结束| AutoEnd
    AutoEnd --> AiTurn[START_TURN AI]
    AiTurn --> AiDraw[draw AI 自动抽卡]
    AiDraw --> AiMain[main AI 出牌和召唤]
    AiMain --> AiBattle[battle AI 选择攻击]
    AiBattle --> CheckEnd{任一方生命值为 0}
    CheckEnd -->|否| PlayerTurn
    CheckEnd -->|是| GameOver[gameOver]
```

当前没有要求玩家手动点击“结束主要阶段”。状态机会根据当前场面和手牌判断：

- 主要阶段仍有合法操作时继续等待玩家。
- 没有主要阶段操作，但存在攻击或战斗阶段操作时自动进入战斗阶段。
- 所有操作都不可用时进入约 2 秒的 `autoEnd`，给玩家确认场面的时间，再交给 AI。
- 玩家仍可主动“跳过攻击”或“结束回合”。

## 核心阶段

| Phase | Engine Timing | 当前行为 | 主要合法命令 |
| --- | --- | --- | --- |
| `setup` | `setup` | 选择角色、卡组、AI 和测试场景 | 初始化，不允许正式出牌 |
| `draw` | `draw` | 当前回合玩家自动抽 1 张 | `DRAW_CARDS`、`CHANGE_PHASE` |
| `main` | `mainOpen` | 召唤、发动魔法、盖陷阱、切换表示 | `SUMMON_MONSTER`、`ACTIVATE_CARD`、`SET_TRAP`、`CHANGE_MONSTER_MODE` |
| `battle` | `battleOpen` | 攻击，也可发动魔法或盖陷阱 | `DECLARE_ATTACK`、`RESOLVE_BATTLE`、`ACTIVATE_CARD`、`SET_TRAP`、`SKIP_REMAINING_ATTACKS` |
| `end` | `end` | 核心引擎保留的结束阶段 | 当前 UI 通过回合交接完成，尚未作为可见阶段停留 |

通常召唤限制属于玩家回合资源：第一次召唤产生 `NORMAL_SUMMON_USED`，后续召唤必须消费 `extraSummon` 能力。

## UI 行动窗口

`Phase` 表示规则阶段，`actionWindow` 表示当前界面允许玩家进行哪类交互和倒计时。两者不能混用。

| Action Window | 用途 | 默认倒计时 |
| --- | --- | --- |
| `setup` | 开局设置 | 无 |
| `draw` | 自动抽卡等待 | 无 |
| `main` | 主要阶段操作 | 30 秒 |
| `targetSelect` | 选择魔法目标 | 20 秒 |
| `battle` | 攻击及战斗阶段操作 | 30 秒 |
| `response` | 选择是否发动陷阱 | 20 秒 |
| `resolution` | 动画和规则结算，禁止插入普通操作 | 无 |
| `autoEnd` | 无合法操作后的反应时间 | 约 2 秒 |
| `ai` | AI 行动 | 无玩家倒计时 |
| `gameOver` | 胜负已确定 | 无 |

`Phase`、`Timing`、响应窗口、连锁和 `actionWindow` 均由规则事件管理。`turn-state.js` 只负责根据当前牌局计算建议窗口和超时策略；浏览器计时器读取事件中的 `windowId` 与 `deadline` 显示进度，不直接创建或修改窗口状态。

```mermaid
flowchart LR
    Decision[计算下一合法操作窗口] --> Command[OPEN_ACTION_WINDOW]
    Command --> Event[ACTION_WINDOW_OPENED]
    Event --> Machine[machine.actionWindow]
    Event --> Adapter[UI 回放 windowId deadline reason]
    Adapter --> Timer[浏览器显示倒计时进度]
    Timer -->|到期且 windowId 未变化| Timeout[执行该窗口的超时策略]
    Timer -->|窗口已变化| Ignore[忽略旧计时器]
```

### 自动结束回合事件链

`autoEnd` 不再由 UI 直接写入 `autoEnding`。UI 只负责发现“当前没有合法操作”和启动浏览器计时器；规则状态通过以下命令和事件交接：

```mermaid
flowchart LR
    NoAction[无合法操作] --> Request[REQUEST_AUTO_END]
    Request --> Requested[AUTO_END_REQUESTED]
    Request --> Window[ACTION_WINDOW_OPENED autoEnd]
    Window --> Timer[浏览器等待 deadline]
    Timer -->|玩家有新意图| Cancel[CANCEL_AUTO_END]
    Cancel --> Canceled[AUTO_END_CANCELED]
    Timer -->|deadline 到期| Commit[COMMIT_AUTO_END]
    Commit --> Committed[AUTO_END_COMMITTED]
    Committed --> EndTurn[TURN_ENDED]
    EndTurn --> NextTurn[START_TURN nextPlayer]
```

手动结束回合直接走 `END_TURN -> TURN_ENDED -> START_TURN nextPlayer`。`TURN_ENDED` 会把核心阶段推进到 `end`，清理响应窗口、连锁、行动窗口和待提交的自动结束请求。

## 单次操作结算

```mermaid
flowchart TD
    Select[选择卡牌 怪兽或按钮] --> Build[适配层构造 Command]
    Build --> Dispatch[GameEngine.dispatch]
    Dispatch --> Legal{规则校验通过}
    Legal -->|否| Reject[拒绝命令 不改变状态]
    Legal -->|是| EventLog[记录 COMMAND_DISPATCHED 和派生事件]
    EventLog --> Replay[按顺序 applyGameEvent]
    Replay --> Assert[校验区域 容量 生命值 回合玩家等不变量]
    Assert --> UI[UI 回放事件]
    UI --> Feedback[日志 动画 音效 语音]
    Feedback --> Recheck[重新计算合法操作和下一个窗口]
```

任何失败命令都不应消耗卡牌、攻击次数或能力资源。

## 攻击、响应窗口与连锁

```mermaid
flowchart TD
    Choose[选择攻击怪兽和目标] --> Declare[DECLARE_ATTACK]
    Declare --> ValidateTarget{目标是否合法}
    ValidateTarget -->|否| Reject[拒绝攻击]
    ValidateTarget -->|是| AttackEvent[ATTACK_DECLARED]
    AttackEvent --> Response[打开 attackDeclaration 响应窗口]
    Response --> TrapChoice{响应方有可发动陷阱吗}
    TrapChoice -->|放弃| Close[关闭响应窗口]
    TrapChoice -->|选择陷阱| Chain[ADD_CHAIN_LINK]
    Chain --> Priority{对方还能连锁吗}
    Priority -->|能并选择响应| Chain
    Priority -->|双方放弃| ResolveChain[RESOLVE_CHAIN 后进先出]
    ResolveChain --> Cancelled{攻击被取消吗}
    Close --> DamageWindow{是否为直接攻击}
    DamageWindow -->|是| DirectResponse[打开 damageStep 响应窗口]
    DamageWindow -->|否| Battle[RESOLVE_BATTLE]
    DirectResponse --> Battle
    Cancelled -->|取消且消耗攻击次数| MarkUsed[MARK_MONSTER_USED]
    Cancelled -->|未取消| Battle
    MarkUsed --> ResetCheck{有 attackReset 且怪兽仍在场}
    Battle --> BattleEvents[伤害 护盾 战损 破坏 攻后效果]
    BattleEvents --> ResetCheck
    ResetCheck -->|是| Reset[ABILITY_SPENT 加 MONSTER_READIED]
    ResetCheck -->|否| Open[回到 battleOpen]
    Reset --> Open
```

攻击规则要点：

- 对方有怪兽时必须先攻击怪兽，除非怪兽自身或 `directAttack` 能力允许直击。
- 每只攻击表示且未行动的怪兽通常每回合可攻击一次。
- 攻击被某些陷阱取消时，是否消耗攻击次数由陷阱规则决定。
- `attackReset` 在攻击次数被消耗后自动消费；攻击怪兽仍在场时产生 `MONSTER_READIED`。
- “跳过攻击”通过 `SKIP_REMAINING_ATTACKS` 将当前可攻击怪兽标记为已行动，清空攻击重置和直击许可，并授予本回合 `skipAttackLock`。新召唤怪兽也不能绕过该锁。

## 连锁数据

响应窗口至少保存：

- 当前拥有响应优先权的玩家。
- 触发时点和恢复时点。
- 触发事件 ID。
- 攻击者、原目标、直击目标等上下文。
- 当前连锁列表。

连锁项通过 `CHAIN_LINK_ADDED` 和 `CHAIN_LINK_COMMITTED` 建立，双方都放弃继续响应后，由 `RESOLVE_CHAIN` 按后进先出顺序结算。

## 属性组合与角色被动

召唤、发动魔法或盖放陷阱完成后，UI 只负责派发一次组合检查命令。组合条件、每回合标记和实际效果均由引擎结算。

```mermaid
flowchart TD
    ActionDone[召唤 魔法或盖陷阱结算完成] --> Command[RESOLVE_ELEMENT_COMBOS]
    Command --> Read[读取场上怪兽属性 来源和 comboFlags]
    Read --> Match{存在尚未触发的组合}
    Match -->|否| Return[返回行动窗口]
    Match -->|是| ComboEvent[COMBO_TRIGGERED]
    ComboEvent --> Mark[事件写入 comboFlags]
    Mark --> Passive{本回合角色被动是否未触发}
    Passive -->|是| PassiveEvent[CHARACTER_PASSIVE_TRIGGERED]
    PassiveEvent --> PassiveOps[执行声明式被动 operations]
    Passive -->|否| ComboOps[执行组合 operations]
    PassiveOps --> ComboOps
    ComboOps --> RuleEvents[抽卡 伤害 护盾 属性修改事件]
    RuleEvents --> More{还有其他匹配组合}
    More -->|是| ComboEvent
    More -->|否| Feedback[UI 根据事件播放动画 音效和日志]
```

- 组合定义位于 `src/combos.js`，条件和效果均为声明式数据。
- `COMBO_TRIGGERED` 是 `comboFlags` 的唯一写入来源。
- `CHARACTER_PASSIVE_TRIGGERED` 是 `comboThisTurn` 的唯一写入来源，保证同一回合只触发一次角色被动。
- 角色被动存放在玩家规则状态的 `comboPassive.operations` 中，不允许自由函数直接修改状态。
- 多个组合同时满足时按定义顺序结算；角色被动只跟随第一个组合触发一次。

## 文档维护规则

以下变化必须同步更新本文：

1. 新增、删除或改变 `Phase`、`Timing`、`actionWindow`。
2. 改变回合自动推进条件或倒计时。
3. 新增响应时点、连锁规则或优先权规则。
4. 改变攻击次数、召唤次数、能力持续时间等核心资源。
5. 新增会改变主流程的持续效果或特殊胜利条件。

规则实现仍遵循 [RULE_ENGINE.md](RULE_ENGINE.md) 中的测试优先、命令、事件和状态校验约束。
