import { createCardElement } from "./card-renderer.js";
import { buildSupportCardDisplay } from "./support-card-display.js";

function ownerLabel(owner) {
  return owner === "player" ? "我方" : "敌方";
}

function enabledClassEntries(entries = {}) {
  return Object.entries(entries)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([className]) => className);
}

function unavailableEffectTargetLabel(reason = "") {
  if (/该格为空/.test(reason)) return "不可选：空格";
  if (/不是己方怪兽/.test(reason)) return "不可选：非己方";
  if (/不是敌方怪兽/.test(reason)) return "不可选：非敌方";
  if (/攻击力最高/.test(reason)) return "不可选：非最高攻击";
  if (/目标抗性/.test(reason)) return "不可选：目标抗性";
  return "不可选";
}

export function monsterFieldSlotView({
  card = null,
  owner = "player",
  index = 0,
  state = {},
  animationKey = "",
  targetable = false,
  targetSelected = false,
  attackTargetable = false,
  attackReadiness = null,
  tributeCandidate = false,
  tributeSelected = false,
  fusionCandidate = false,
  fusionSelected = false,
  materialTarget = null,
  materialKind = "",
  splitTarget = null,
  spellTarget = null
} = {}) {
  const selected = owner === "player"
    && state.selected?.zone === "playerField"
    && state.selected?.index === index;
  const materialCandidate = materialTarget
    ? Boolean(materialTarget.ok)
    : Boolean(tributeCandidate || fusionCandidate);
  const materialSelected = Boolean(tributeSelected || fusionSelected);
  const materialUnavailable = Boolean(materialTarget && !materialTarget.ok);
  const splitCandidate = Boolean(splitTarget?.ok);
  const splitUnavailable = Boolean(splitTarget && !splitTarget.ok);
  const effectTargetState = spellTarget ? (spellTarget.ok ? "legal" : "unavailable") : "";
  const effectTargetReason = spellTarget && !spellTarget.ok ? spellTarget.reason || "不能选择该目标。" : "";
  const effectTargetUnavailable = effectTargetState === "unavailable";
  const effectTargetLabel = effectTargetUnavailable ? unavailableEffectTargetLabel(effectTargetReason) : "";
  const interactionTarget = materialTarget || splitTarget || spellTarget;
  const disabled = owner === "ai"
    && !card
    && !targetable
    && !attackTargetable
    && !interactionTarget;
  const attacksLocked = Boolean(
    card
    && (state[owner]?.attacksSkipped || card.attackLockReason)
    && card.type === "monster"
    && card.mode !== "defense"
  );
  const attackReady = attackReadiness
    ? Boolean(attackReadiness.ok)
    : Boolean(
      card?.type === "monster"
      && state.started
      && !state.paused
      && !state.gameOver
      && state.turn === owner
      && state.phase === "battle"
      && card.mode !== "defense"
      && !card.used
      && !attacksLocked
    );
  const attackReason = attackReadiness?.reason || "";
  const animationClass = animationKey === `summon-${owner}-${index}`
    ? "summon-flash"
    : animationKey === `hit-${owner}-${index}`
      ? "hit-flash"
      : "";

  return {
    owner,
    index,
    disabled,
    targetable,
    targetSelected,
    attackTargetable,
    attacksLocked,
    attackReady,
    attackReason,
    animationClass,
    materialTarget,
    materialCandidate,
    materialSelected,
    materialUnavailable,
    splitTarget,
    splitCandidate,
    splitUnavailable,
    title: effectTargetReason || interactionTarget?.reason || attackReason,
    effectTargetState,
    effectTargetReason,
    effectTargetLabel,
    targetState: splitTarget ? (splitCandidate ? "candidate" : "unavailable") : "",
    targetReason: splitTarget?.reason || "",
    materialState: materialTarget
      ? (materialCandidate ? (materialSelected ? "selected" : "candidate") : "unavailable")
      : "",
    materialReason: materialTarget?.reason || "",
    ariaLabel: `${ownerLabel(owner)}召唤区 ${index + 1}${selected ? "，当前选中" : ""}${targetSelected ? "，已选择为魔法目标" : ""}${interactionTarget?.reason ? `，${interactionTarget.reason}` : ""}`,
    slotClasses: enabledClassEntries({
      targetable,
      "target-selected": targetSelected,
      "attack-target": attackTargetable,
      "tribute-candidate": materialCandidate,
      "tribute-selected": materialSelected,
      "tribute-unavailable": materialKind === "tribute" && materialUnavailable,
      "fusion-candidate": materialKind === "fusion" && materialCandidate,
      "fusion-selected": materialKind === "fusion" && materialSelected,
      "fusion-unavailable": materialKind === "fusion" && materialUnavailable,
      "split-candidate": splitCandidate,
      "split-unavailable": splitUnavailable,
      "effect-target-unavailable": effectTargetUnavailable
    }),
    cardClasses: enabledClassEntries({
      selected,
      used: card?.used,
      "attack-ready": attackReady,
      "attack-locked": attacksLocked,
      defense: card?.mode === "defense",
      enhanced: (card?.tempAtk || 0) > 0 || (card?.tempDef || 0) > 0,
      weakened: (card?.tempAtk || 0) < 0 || (card?.tempDef || 0) < 0 || (card?.battleWear || 0) > 0,
      protected: Boolean(card?.destructionProtection && !card?.destructionProtectionUsed),
      targetable,
      "target-selected": targetSelected,
      "attack-target": attackTargetable,
      "tribute-candidate": materialCandidate,
      "tribute-selected": materialSelected,
      "tribute-unavailable": materialKind === "tribute" && materialUnavailable,
      "fusion-candidate": materialKind === "fusion" && materialCandidate,
      "fusion-selected": materialKind === "fusion" && materialSelected,
      "fusion-unavailable": materialKind === "fusion" && materialUnavailable,
      "split-candidate": splitCandidate,
      "split-unavailable": splitUnavailable,
      "effect-target-unavailable": effectTargetUnavailable
    })
  };
}

export function supportFieldSlotView({
  card = null,
  owner = "player",
  index = 0,
  targetable = false,
  targetSelected = false,
  spellTarget = null,
  trapChoiceReady = false,
  trapChoiceSelected = false
} = {}) {
  const targetInteraction = Boolean(spellTarget);
  const effectTargetUnavailable = Boolean(spellTarget && !spellTarget.ok);
  const effectTargetReason = effectTargetUnavailable ? spellTarget.reason || "不能选择该目标。" : "";
  const effectTargetLabel = effectTargetUnavailable
    ? !card
      ? "不可选：空格"
      : owner !== "ai"
        ? "不可选：非敌方"
        : "不可选"
    : "";
  const revealed = Boolean(card && (owner === "player" || card.type === "spell"));
  const supportDisplay = revealed
    ? buildSupportCardDisplay(card, {
      responseReady: trapChoiceReady,
      responseSelected: trapChoiceSelected,
      targetable
    })
    : null;
  const zoneLabel = `${ownerLabel(owner)}魔陷区 ${index + 1}`;

  return {
    owner,
    index,
    targetable,
    targetSelected,
    targetInteraction,
    effectTargetState: spellTarget ? (spellTarget.ok ? "legal" : "unavailable") : "",
    effectTargetReason,
    effectTargetLabel,
    title: effectTargetReason,
    trapChoiceReady,
    trapChoiceSelected,
    revealed,
    supportDisplay,
    ariaLabel: `${supportDisplay
      ? `${zoneLabel}，${card.name}，${supportDisplay.description}`
      : `${zoneLabel}${card ? "，盖放卡牌" : "，空位"}`}${targetSelected ? "，已选择为魔法目标" : ""}${effectTargetReason ? `，${effectTargetReason}` : ""}`,
    slotClasses: enabledClassEntries({
      "trap-response": trapChoiceReady,
      "trap-response-selected": trapChoiceSelected,
      targetable,
      "target-selected": targetSelected,
      "support-target-unavailable": effectTargetUnavailable,
      [`support-${supportDisplay?.key}`]: Boolean(supportDisplay)
    }),
    cardClasses: enabledClassEntries({
      "trap-response": trapChoiceReady,
      "trap-response-selected": trapChoiceSelected,
      targetable,
      "target-selected": targetSelected,
      "support-target-unavailable": effectTargetUnavailable,
      [`support-${supportDisplay?.key}`]: Boolean(supportDisplay)
    })
  };
}

function addClasses(element, classes = []) {
  classes.forEach((className) => element.classList.add(className));
}

export function renderMonsterZones({
  document,
  root,
  duelist,
  owner,
  state,
  animationKey = "",
  assetForCard = () => "",
  targetableAt = () => false,
  targetSelectedAt = () => false,
  attackTargetableAt = () => false,
  attackReadinessAt = () => null,
  selectedTributeIndexes = [],
  selectedFusionIndexes = [],
  fusionCandidateAt = () => false,
  materialTargetAt = () => null,
  splitTargetAt = () => null,
  spellTargetAt = () => null,
  effectMarkersAt = () => [],
  onSlotClick = () => {},
  onSlotDoubleClick = () => {},
  onCardClick = () => {},
  onAttackPreview = () => {},
  onAttackPreviewRestore = () => {}
} = {}) {
  const fragment = document.createDocumentFragment();
  duelist.field.forEach((card, index) => {
    const targetable = targetableAt(index);
    const targetSelected = targetSelectedAt(index);
    const attackTargetable = attackTargetableAt(index);
    const attackReadiness = attackReadinessAt(index);
    const materialTarget = materialTargetAt(index);
    const splitTarget = splitTargetAt(index);
    const spellTarget = spellTargetAt(index);
    const tributeCandidate = owner === "player" && Boolean(state.pendingTribute) && Boolean(card);
    const fusionCandidate = owner === "player"
      && Boolean(state.pendingFusion)
      && Boolean(card)
      && fusionCandidateAt(index);
    const view = monsterFieldSlotView({
      card,
      owner,
      index,
      state,
      animationKey,
      targetable,
      targetSelected,
      attackTargetable,
      attackReadiness,
      tributeCandidate,
      tributeSelected: selectedTributeIndexes.includes(index),
      fusionCandidate,
      fusionSelected: selectedFusionIndexes.includes(index),
      materialTarget,
      materialKind: state.pendingTribute ? "tribute" : state.pendingFusion ? "fusion" : "",
      splitTarget,
      spellTarget
    });
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `slot ${card ? "" : "empty"}`;
    slot.dataset.owner = owner;
    slot.dataset.index = String(index);
    slot.dataset.testid = `${owner}-field-${index}`;
    addClasses(slot, view.slotClasses);
    if (view.materialState) slot.dataset.materialState = view.materialState;
    if (view.materialReason) slot.dataset.materialReason = view.materialReason;
    if (view.targetState) slot.dataset.targetState = view.targetState;
    if (view.targetReason) slot.dataset.targetReason = view.targetReason;
    if (view.effectTargetState) slot.dataset.effectTargetState = view.effectTargetState;
    if (view.effectTargetReason) slot.dataset.effectTargetReason = view.effectTargetReason;
    if (view.effectTargetLabel) slot.dataset.effectTargetLabel = view.effectTargetLabel;
    if (view.title) slot.title = view.title;
    if (attackReadiness) {
      slot.dataset.attackState = view.attackReady ? "ready" : "unavailable";
      slot.dataset.attackReason = view.attackReason;
    }
    slot.disabled = view.disabled;
    slot.setAttribute("aria-disabled", view.disabled ? "true" : "false");
    slot.setAttribute("aria-label", view.ariaLabel);
    slot.setAttribute("aria-pressed", String(view.targetSelected));
    slot.addEventListener("click", () => onSlotClick(index));
    slot.addEventListener("dblclick", (event) => {
      event.preventDefault();
      onSlotDoubleClick(index);
    });

    if (attackTargetable) {
      slot.addEventListener("pointerenter", () => onAttackPreview(index));
      slot.addEventListener("pointerleave", onAttackPreviewRestore);
      slot.addEventListener("focus", () => onAttackPreview(index));
      slot.addEventListener("blur", onAttackPreviewRestore);
    }

    if (card) {
      const cardEl = createCardElement(document, card, {
        asset: assetForCard(card),
        attacksLocked: view.attacksLocked,
        attackReady: view.attackReady,
        effectMarkers: effectMarkersAt(index),
        showStateRail: card.type === "monster",
        showTributeRequirement: false
      });
      cardEl.dataset.zone = `${owner}-field`;
      if (card.type === "monster") cardEl.classList.add("field-monster-card");
      addClasses(cardEl, view.cardClasses);
      if (attackReadiness) {
        cardEl.dataset.attackState = view.attackReady ? "ready" : "unavailable";
        cardEl.dataset.attackReason = view.attackReason;
      }
      if (view.animationClass) cardEl.classList.add(view.animationClass);
      cardEl.addEventListener("click", (event) => {
        event.stopPropagation();
        onCardClick(index);
      });
      slot.appendChild(cardEl);
      if (view.cardClasses.includes("selected")) {
        const selectionChip = document.createElement("span");
        selectionChip.className = "field-selection-chip";
        selectionChip.textContent = "当前操作";
        selectionChip.setAttribute("aria-hidden", "true");
        slot.appendChild(selectionChip);
      }
    }
    fragment.appendChild(slot);
  });
  root.replaceChildren(fragment);
}

export function renderSupportZones({
  document,
  root,
  duelist,
  owner,
  state,
  assetForCard = () => "",
  targetableAt = () => false,
  targetSelectedAt = () => false,
  spellTargetAt = () => null,
  onSlotClick = () => {},
  onSlotDoubleClick = () => {},
  onCardClick = () => {},
  onCardDoubleClick = () => {}
} = {}) {
  const fragment = document.createDocumentFragment();
  duelist.traps.forEach((card, index) => {
    const trapChoiceReady = owner === "player"
      && Boolean(state.pendingTrapChoice?.trapIndexes?.includes(index));
    const trapChoiceSelected = trapChoiceReady
      && state.pendingTrapChoice?.selectedIndex === index;
    const view = supportFieldSlotView({
      card,
      owner,
      index,
      targetable: targetableAt(index),
      targetSelected: targetSelectedAt(index),
      spellTarget: spellTargetAt(index),
      trapChoiceReady,
      trapChoiceSelected
    });
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `trap-slot ${card ? "" : "empty"}`;
    slot.dataset.owner = owner;
    slot.dataset.index = String(index);
    slot.dataset.testid = `${owner}-trap-${index}`;
    addClasses(slot, view.slotClasses);
    slot.setAttribute("aria-pressed", String(view.targetSelected));
    if (view.effectTargetState) slot.dataset.effectTargetState = view.effectTargetState;
    if (view.effectTargetReason) slot.dataset.effectTargetReason = view.effectTargetReason;
    if (view.effectTargetLabel) slot.dataset.effectTargetLabel = view.effectTargetLabel;
    if (view.title) slot.title = view.title;
    if (view.supportDisplay) slot.dataset.supportState = view.supportDisplay.key;
    slot.setAttribute("aria-label", view.ariaLabel);
    slot.addEventListener("click", () => onSlotClick(index));
    slot.addEventListener("dblclick", (event) => {
      event.preventDefault();
      onSlotDoubleClick(index);
    });

    if (card) {
      const cardEl = view.revealed
        ? createCardElement(document, card, { asset: assetForCard(card) })
        : document.createElement("article");
      const supportTypeClass = card.type === "spell" ? "player-spell" : "player-trap";
      cardEl.className = view.revealed
        ? `${cardEl.className} field-support-card ${supportTypeClass}`
        : "card back";
      cardEl.dataset.zone = `${owner}-trap`;
      cardEl.dataset.cardId = view.revealed ? card.id || "" : "hidden";
      cardEl.dataset.cardName = view.revealed ? card.name || "" : "盖放的卡牌";
      cardEl.dataset.cardType = view.revealed ? card.type || "trap" : "hidden";
      addClasses(cardEl, view.cardClasses);

      if (view.supportDisplay) {
        cardEl.dataset.supportState = view.supportDisplay.key;
        cardEl.setAttribute(
          "aria-label",
          `${card.name}，${view.supportDisplay.typeLabel}，${view.supportDisplay.description}`
        );
        const stateChip = document.createElement("span");
        stateChip.className = `support-state-chip ${view.supportDisplay.key}`;
        stateChip.textContent = view.supportDisplay.label;
        stateChip.setAttribute("aria-hidden", "true");
        cardEl.appendChild(stateChip);
      }

      if (view.revealed) {
        cardEl.addEventListener("click", (event) => {
          event.stopPropagation();
          if (view.targetInteraction) onSlotClick(index);
          else onCardClick(card, index);
        });
      }
      cardEl.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onCardDoubleClick(card, index);
      });
      slot.appendChild(cardEl);
    }
    fragment.appendChild(slot);
  });
  root.replaceChildren(fragment);
}
