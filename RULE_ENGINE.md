# Rule engine guardrails

`src/game-engine.js` is the new rules boundary for card behavior. It is intentionally small for now so it can sit beside the current UI without forcing a large visual refactor.

The current turn, phase, action-window, attack, response, and chain flow is documented in [GAME_FLOW.md](GAME_FLOW.md). Update that document when a rules change alters the main game flow.

## Required flow

1. Write or update a test in `tests/game-engine.test.mjs`.
2. Run `npm run test:engine` and confirm the expected failure.
3. Register or change the card effect in the engine.
4. Run `npm run test:engine`.
5. Run `npm test`.

For new cards, the rule test is part of the card definition. Do not add a card effect without a matching rules test.

## State ownership

- Rules-layer state changes must go through `GameEngine.dispatch(action)`.
- `dispatch` resolves actions by emitting `GameEvent` objects. State mutation happens in `applyGameEvent`, not inside card effects.
- UI code should treat `GameEngine.getState()` as read-only. It returns a defensive copy, so mutating it cannot mutate live engine state.
- Card effect functions receive `EffectContext`, not raw state.
- The client should be treated as presentation only. The engine state and event log are the source of truth.

## Command and event log

- Public operations enter the rules layer as commands passed to `dispatch`.
- A successful command first records `COMMAND_DISPATCHED`.
- Derived state changes are represented as follow-up events.
- The event log must be replayable with `applyGameEvent`.

## EffectContext API

Card effects should only use these methods:

- `drawCards`
- `dealDamage`
- `heal`
- `gainShield`
- `moveCard`
- `destroyCard`
- `summonMonster`
- `modifyStat`
- `negateEffect`
- `grantAbility`

## Card effect DSL

Card effects should be declarative DSL definitions, not free JavaScript functions.

Example:

```js
draw2: {
  duration: EffectDuration.oneShot,
  operations: [{ op: "drawCards", player: "self", count: 2 }]
}
```

The engine rejects function effects. One-shot effects and continuous effects use different `EffectDuration` values and are not resolved through the same path.

Monster `onSummon` and `afterAttack` hooks must reference effect ids in the same DSL registry. Adding a monster-triggered effect means adding rule tests first, then registering the DSL operations.

Continuous equipment spells use `EffectDuration.continuous`. Activating one moves the spell from hand to `spellTrapZone`, emits `CONTINUOUS_EFFECT_REGISTERED`, then applies its stat modifiers through `STAT_MODIFIED` events with `duration: "continuous"`. If the equipment source leaves the spell/trap zone, or the equipped monster leaves the monster zone, the engine emits `CONTINUOUS_EFFECT_RELEASED` and reverses the continuous stat modifiers with follow-up `STAT_MODIFIED` events. When an equipped monster leaves play, the now-invalid equipment card is destroyed through normal movement/destruction events. Continuous definitions currently support `modifyStat` operations only; expanding that list requires new rule tests first.

## Event and validation guarantees

Every successful `dispatch` emits `GameEvent` entries, applies those events, and then runs `assertValidGameState`.

The current event applier handles:

- `CARD_MOVED`
- `CARDS_DRAWN`
- `DAMAGE_DEALT`
- `LP_HEALED`
- `SHIELD_GAINED`
- `STAT_MODIFIED`
- `CONTINUOUS_EFFECT_REGISTERED`
- `CONTINUOUS_EFFECT_RELEASED`
- `MONSTER_SUMMONED`
- `PHASE_CHANGED`
- `TIMING_CHANGED`
- `RESPONSE_WINDOW_OPENED`
- `RESPONSE_WINDOW_CLOSED`
- `CHAIN_LINK_ADDED`
- `CHAIN_RESOLVED`
- `ABILITY_GRANTED`
- `ABILITY_SPENT`
- `TURN_DRAW_RESOLVED`
- `GAME_OVER_DECLARED`

Audit-only events such as `CARD_ACTIVATED`, `MONSTER_SUMMONED`, `CARD_DESTROYED`, and `EFFECT_NEGATED` are still recorded in the same log.

The validator catches:

- a card id appearing in multiple zones
- a zone referencing a missing card id
- monster and spell/trap zones exceeding `FIELD_SIZE`
- player LP becoming `NaN` or another non-finite value
- a missing current turn player
- active continuous effects whose source is no longer in a spell/trap zone
- active continuous effects whose target is no longer in a monster zone

## Phase rules

`Phase` is the rules-layer phase state machine:

- spells and normal summons are legal in `main`
- trap activation is legal in `battle`
- turn draw resolution uses `RESOLVE_TURN_DRAW` in `draw` and advances to `main` only if the player survives
- lethal damage declares `GAME_OVER_DECLARED`; UI should replay that event instead of inferring victory from LP directly
- illegal phase actions throw `GameRuleError`

## Timing, chain, and abilities

- `Timing` models explicit windows such as `mainOpen`, `attackDeclaration`, `damageStep`, and `chainResolution`.
- `ResponseWindow` models whether a response is optional or mandatory.
- Chain links are stored under `state.machine.chain` and only change through chain events.
- Complex permissions such as direct attack, extra summon, and attack reset should be represented as abilities, then granted or spent through events.
- Skipping remaining attacks uses `SKIP_REMAINING_ATTACKS`, consumes attack-only abilities through events, and grants the turn-scoped `skipAttackLock` ability.
- A queued `attackReset` is spent automatically when an attack chance is consumed; a surviving attacker is readied through `MONSTER_READIED`.
- Element combos resolve through `RESOLVE_ELEMENT_COMBOS`. `COMBO_TRIGGERED` and `CHARACTER_PASSIVE_TRIGGERED` own the combo and once-per-turn passive flags.
- Element combos and character passives declare `operations`; UI code and card configuration must not store free functions that mutate rule state.
- Attack-after effects use the same DSL registry through the monster `afterAttack` key, so custom and existing monster effects share one implementation path.

## UI action windows

- Action-window transitions use `OPEN_ACTION_WINDOW` and `ACTION_WINDOW_OPENED`; UI code must not assign `actionWindow`, `actionWindowId`, or `actionDeadline` directly.
- UI timers are presentation consumers of the event-owned `windowId` and `deadline`, not a second source of window state.
- `main` uses `mainOpen` timing and a 30 second idle timeout.
- `targetSelect` uses `targetSelection` timing and a 20 second target-selection timeout.
- `response` uses `responseWindow` timing and a 12 second response timeout.
- When target selection times out, the UI should auto-select the only legal target. If there are zero or multiple legal targets, cancel that selection and return to the main action window.
- Passive interactions such as viewing a card may restart the current window timer, but must not erase the current action window.

## AI and browser smoke

- AI decision functions in `src/ai.js` are pure planners. They return command-shaped actions such as `spell`, `setTrap`, `summon`, `attack`, `skipAttack`, or `none`; they must not mutate game state.
- AI execution in `src/app.js` should consume those planned actions and then use the same adapter/`GameEngine.dispatch` path as player actions.
- Browser smoke baselines run with `npm run smoke:browser` against `127.0.0.1:5177`. If Windows blocks the npm wrapper, run the same entrypoint directly with `node scripts/browser-smoke.mjs <smoke-name>`. The runner first creates Chrome profiles under project `.tmp`, then falls back to the OS temp directory when that path is denied. A scenario should first be implemented in `src/browser-smoke.js`, then added to `scripts/browser-smoke.mjs` when it becomes part of the default regression set.

## Turn handoff and auto-end

- Manual turn handoff uses `END_TURN`; automatic no-action handoff uses `REQUEST_AUTO_END`, `CANCEL_AUTO_END`, and `COMMIT_AUTO_END`.
- Turn-start draw uses `RESOLVE_TURN_DRAW`, which emits draw or deck-out events, records `TURN_DRAW_RESOLVED`, and emits `PHASE_CHANGED` to `main` only when the current player is still alive.
- Game-over handoff uses `GAME_OVER_DECLARED`. Applying that event records winner/losers, clears response windows, chain links, and auto-end state, then opens the `gameOver` action window for presentation.
- `AUTO_END_REQUESTED` owns the pending auto-end flag. UI code must not directly assign `autoEnding` except when constructing or resetting an unstarted local game state.
- `COMMIT_AUTO_END` emits `AUTO_END_COMMITTED` and `TURN_ENDED`. `TURN_ENDED` moves the engine phase to `end` and clears response windows, chain links, action windows, and pending auto-end state.
- The browser timer is only a scheduler. When the deadline fires it dispatches `COMMIT_AUTO_END`; it does not directly change turn ownership.
- The next player starts through a separate `START_TURN` command so turn end and turn start remain distinct events in the log.
