# Rule engine guardrails

`src/game-engine.js` is the new rules boundary for card behavior. It is intentionally small for now so it can sit beside the current UI without forcing a large visual refactor.

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

## Event and validation guarantees

Every successful `dispatch` emits `GameEvent` entries, applies those events, and then runs `assertValidGameState`.

The current event applier handles:

- `CARD_MOVED`
- `CARDS_DRAWN`
- `DAMAGE_DEALT`
- `LP_HEALED`
- `SHIELD_GAINED`
- `STAT_MODIFIED`
- `MONSTER_SUMMONED`
- `PHASE_CHANGED`
- `TIMING_CHANGED`
- `RESPONSE_WINDOW_OPENED`
- `RESPONSE_WINDOW_CLOSED`
- `CHAIN_LINK_ADDED`
- `CHAIN_RESOLVED`
- `ABILITY_GRANTED`
- `ABILITY_SPENT`

Audit-only events such as `CARD_ACTIVATED`, `MONSTER_SUMMONED`, `CARD_DESTROYED`, and `EFFECT_NEGATED` are still recorded in the same log.

The validator catches:

- a card id appearing in multiple zones
- a zone referencing a missing card id
- monster and spell/trap zones exceeding `FIELD_SIZE`
- player LP becoming `NaN` or another non-finite value
- a missing current turn player

## Phase rules

`Phase` is the rules-layer phase state machine:

- spells and normal summons are legal in `main`
- trap activation is legal in `battle`
- illegal phase actions throw `GameRuleError`

## Timing, chain, and abilities

- `Timing` models explicit windows such as `mainOpen`, `attackDeclaration`, `damageStep`, and `chainResolution`.
- `ResponseWindow` models whether a response is optional or mandatory.
- Chain links are stored under `state.machine.chain` and only change through chain events.
- Complex permissions such as direct attack, extra summon, and attack reset should be represented as abilities, then granted or spent through events.

## UI action windows

- UI timers should be tied to explicit action windows, not scattered `setTimeout` checks.
- `main` uses `mainOpen` timing and a 30 second idle timeout.
- `targetSelect` uses `targetSelection` timing and a 20 second target-selection timeout.
- `response` uses `responseWindow` timing and a 12 second response timeout.
- When target selection times out, the UI should auto-select the only legal target. If there are zero or multiple legal targets, cancel that selection and return to the main action window.
- Passive interactions such as viewing a card may restart the current window timer, but must not erase the current action window.
