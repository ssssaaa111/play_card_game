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

export function monsterFieldSlotView({
  card = null,
  owner = "player",
  index = 0,
  state = {},
  animationKey = "",
  targetable = false,
  attackTargetable = false,
  tributeCandidate = false,
  tributeSelected = false,
  fusionCandidate = false,
  fusionSelected = false
} = {}) {
  const materialCandidate = Boolean(tributeCandidate || fusionCandidate);
  const materialSelected = Boolean(tributeSelected || fusionSelected);
  const disabled = owner === "ai" && !card && !targetable && !attackTargetable;
  const attacksLocked = Boolean(
    card
    && owner === "player"
    && state.player?.attacksSkipped
    && card.type === "monster"
    && !card.used
    && card.mode !== "defense"
  );
  const attackReady = Boolean(
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
    attackTargetable,
    materialCandidate,
    materialSelected,
    attacksLocked,
    attackReady,
    animationClass,
    ariaLabel: `${ownerLabel(owner)}召唤区 ${index + 1}`,
    slotClasses: enabledClassEntries({
      targetable,
      "attack-target": attackTargetable,
      "tribute-candidate": materialCandidate,
      "tribute-selected": materialSelected
    }),
    cardClasses: enabledClassEntries({
      selected: owner === "player"
        && state.selected?.zone === "playerField"
        && state.selected?.index === index,
      used: card?.used,
      "attack-ready": attackReady,
      "attack-locked": attacksLocked,
      defense: card?.mode === "defense",
      enhanced: (card?.tempAtk || 0) > 0 || (card?.tempDef || 0) > 0,
      weakened: (card?.tempAtk || 0) < 0 || (card?.tempDef || 0) < 0 || (card?.battleWear || 0) > 0,
      protected: Boolean(card?.destructionProtection && !card?.destructionProtectionUsed),
      targetable,
      "attack-target": attackTargetable,
      "tribute-candidate": materialCandidate,
      "tribute-selected": materialSelected
    })
  };
}

export function supportFieldSlotView({
  card = null,
  owner = "player",
  index = 0,
  targetable = false,
  trapChoiceReady = false,
  trapChoiceSelected = false
} = {}) {
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
    trapChoiceReady,
    trapChoiceSelected,
    revealed,
    supportDisplay,
    ariaLabel: supportDisplay
      ? `${zoneLabel}，${card.name}，${supportDisplay.description}`
      : `${zoneLabel}${card ? "，盖放卡牌" : "，空位"}`,
    slotClasses: enabledClassEntries({
      "trap-response": trapChoiceReady,
      "trap-response-selected": trapChoiceSelected,
      targetable,
      [`support-${supportDisplay?.key}`]: Boolean(supportDisplay)
    }),
    cardClasses: enabledClassEntries({
      "trap-response": trapChoiceReady,
      "trap-response-selected": trapChoiceSelected,
      targetable,
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
  attackTargetableAt = () => false,
  selectedTributeIndexes = [],
  selectedFusionIndexes = [],
  fusionCandidateAt = () => false,
  onSlotClick = () => {},
  onCardClick = () => {},
  onAttackPreview = () => {},
  onAttackPreviewRestore = () => {}
} = {}) {
  const fragment = document.createDocumentFragment();
  duelist.field.forEach((card, index) => {
    const targetable = targetableAt(index);
    const attackTargetable = attackTargetableAt(index);
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
      attackTargetable,
      tributeCandidate,
      tributeSelected: tributeCandidate && selectedTributeIndexes.includes(index),
      fusionCandidate,
      fusionSelected: fusionCandidate && selectedFusionIndexes.includes(index)
    });
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `slot ${card ? "" : "empty"}`;
    slot.dataset.owner = owner;
    slot.dataset.index = String(index);
    slot.dataset.testid = `${owner}-field-${index}`;
    addClasses(slot, view.slotClasses);
    slot.disabled = view.disabled;
    slot.setAttribute("aria-disabled", view.disabled ? "true" : "false");
    slot.setAttribute("aria-label", view.ariaLabel);
    slot.addEventListener("click", () => onSlotClick(index));

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
        showStateRail: card.type === "monster"
      });
      cardEl.dataset.zone = `${owner}-field`;
      if (card.type === "monster") cardEl.classList.add("field-monster-card");
      addClasses(cardEl, view.cardClasses);
      if (view.animationClass) cardEl.classList.add(view.animationClass);
      cardEl.addEventListener("click", (event) => {
        event.stopPropagation();
        onCardClick(index);
      });
      slot.appendChild(cardEl);
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
  onSlotClick = () => {},
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
    if (view.supportDisplay) slot.dataset.supportState = view.supportDisplay.key;
    slot.setAttribute("aria-label", view.ariaLabel);
    slot.addEventListener("click", () => onSlotClick(index));

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

      if (owner === "player") {
        cardEl.addEventListener("click", (event) => {
          event.stopPropagation();
          onCardClick(card, index);
        });
        cardEl.addEventListener("dblclick", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onCardDoubleClick(card, index);
        });
      }
      slot.appendChild(cardEl);
    }
    fragment.appendChild(slot);
  });
  root.replaceChildren(fragment);
}
