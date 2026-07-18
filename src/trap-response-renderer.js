import { applyCardArt } from "./card-art.js";
import { buildChainStackEntries, chainResolutionOrderText } from "./chain-view.js";
import { canActivateTrapResponse } from "./response-state.js";
import { buildTrapChoiceDisplay } from "./trap-choice-display.js";

export function trapResponsePromptText(choice, traps = [], activationText = () => "") {
  if (!choice) return "";
  const selectedCard = traps[choice.selectedIndex];
  if (selectedCard) {
    return activationText(selectedCard, choice.eventName, choice.details);
  }
  const firstCard = traps[choice.trapIndexes?.[0]];
  const eventText = firstCard
    ? activationText(firstCard, choice.eventName, choice.details).split("是否连锁发动")[0]
    : "";
  const names = (choice.trapIndexes || [])
    .map((index) => traps[index]?.name)
    .filter(Boolean)
    .join("、");
  return `${eventText}可发动陷阱：${names}。单击响应卡选择，双击可直接发动；本事件只能发动一张。`;
}

export function buildTrapResponseView({
  choice = null,
  traps = [],
  chain = [],
  findCard = () => null,
  activationText = () => ""
} = {}) {
  if (!choice) {
    return {
      visible: false,
      detailsText: "",
      statusText: "",
      actionText: "发动陷阱",
      actionDisabled: false,
      choices: [],
      stackEntries: [],
      resolutionOrder: ""
    };
  }

  const selectedCard = traps[choice.selectedIndex];
  const choices = (choice.trapIndexes || [])
    .map((trapIndex) => {
      const card = traps[trapIndex];
      if (!card) return null;
      return {
        trapIndex,
        card,
        ...buildTrapChoiceDisplay(card, { selected: choice.selectedIndex === trapIndex })
      };
    })
    .filter(Boolean);
  const stackEntries = buildChainStackEntries({
    chain,
    findCard,
    pendingCard: choice.eventName === "chain" ? selectedCard : null,
    pendingOwner: "player"
  });
  const selectedChainIndex = selectedCard
    ? stackEntries.find((entry) => entry.pending)?.chainIndex || chain.length + 1
    : null;

  return {
    visible: true,
    detailsText: trapResponsePromptText(choice, traps, activationText),
    statusText: selectedCard
      ? `已选择：${selectedCard.name} · 将加入 CL${selectedChainIndex}`
      : `可响应 ${choices.length} 张 · 本事件限发动 1 张`,
    actionText: selectedCard ? `发动 ${selectedCard.name} · CL${selectedChainIndex}` : "发动陷阱",
    actionDisabled: !canActivateTrapResponse(choice, traps),
    choices,
    stackEntries,
    resolutionOrder: chainResolutionOrderText(stackEntries)
  };
}

function renderTrapChoices({
  document,
  root,
  choices,
  onSelect,
  onActivate
}) {
  if (!root) return;
  root.replaceChildren();
  root.hidden = choices.length === 0;
  choices.forEach((choice) => {
    const { card, trapIndex } = choice;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "trap-choice-card";
    button.dataset.trapChoiceIndex = String(trapIndex);
    button.dataset.cardId = card.id;
    button.dataset.choiceState = choice.state;
    button.classList.toggle("selected", choice.state === "selected");
    button.setAttribute("aria-pressed", String(choice.state === "selected"));
    button.setAttribute("aria-label", choice.ariaLabel);
    button.title = "单击选择，双击直接发动";

    const art = document.createElement("span");
    art.className = `trap-choice-art ${card.type || "trap"}`;
    art.setAttribute("aria-hidden", "true");
    if (!applyCardArt(art, card.id)) art.textContent = card.icon || "陷";

    const type = document.createElement("span");
    type.className = "trap-choice-type";
    type.textContent = choice.typeLabel;
    art.appendChild(type);

    const body = document.createElement("span");
    body.className = "trap-choice-body";
    const heading = document.createElement("span");
    heading.className = "trap-choice-title";
    const name = document.createElement("strong");
    name.textContent = choice.name;
    const status = document.createElement("span");
    status.className = `trap-choice-state ${choice.state}`;
    status.textContent = choice.stateLabel;
    const text = document.createElement("span");
    text.className = "trap-choice-effect";
    text.textContent = choice.effectText;

    heading.appendChild(name);
    heading.appendChild(status);
    body.appendChild(heading);
    body.appendChild(text);
    button.appendChild(art);
    button.appendChild(body);
    button.addEventListener("click", () => onSelect(trapIndex));
    button.addEventListener("dblclick", (event) => {
      event.preventDefault();
      onActivate(trapIndex);
    });
    root.appendChild(button);
  });
}

function renderChainStack({
  document,
  root,
  entries,
  resolutionOrder,
  onCardClick
}) {
  if (!root) return;
  root.replaceChildren();
  root.hidden = entries.length === 0;
  if (entries.length === 0) return;

  const heading = document.createElement("div");
  heading.className = "chain-stack-head";
  const title = document.createElement("strong");
  title.textContent = `当前连锁 · ${entries.length} 段`;
  const rule = document.createElement("span");
  rule.textContent = "后进先出";
  heading.appendChild(title);
  heading.appendChild(rule);
  root.appendChild(heading);

  entries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "chain-stack-entry";
    row.classList.toggle("pending", entry.pending);
    row.dataset.owner = entry.owner || "unknown";
    row.dataset.chainState = entry.pending ? "pending" : "queued";
    row.setAttribute("aria-label", `CL${entry.chainIndex}，${entry.ownerLabel}，${entry.name}，${entry.pending ? "待发动" : "等待结算"}`);

    const index = document.createElement("span");
    index.className = "chain-stack-index";
    index.textContent = `CL${entry.chainIndex}`;
    const art = document.createElement("span");
    art.className = "chain-stack-art";
    art.setAttribute("aria-hidden", "true");
    if (!entry.cardId || !applyCardArt(art, entry.cardId)) art.textContent = `CL${entry.chainIndex}`;

    const main = document.createElement("span");
    main.className = "chain-stack-main";
    const owner = document.createElement("span");
    owner.className = "chain-stack-owner";
    owner.textContent = entry.ownerLabel;
    const name = document.createElement(entry.cardId ? "button" : "span");
    name.className = "chain-stack-card";
    name.textContent = entry.name;
    if (entry.cardId) {
      name.type = "button";
      name.dataset.cardId = entry.cardId;
      name.title = `查看 ${entry.name} 详情`;
      name.addEventListener("click", () => onCardClick(entry.cardId));
    }
    const status = document.createElement("span");
    status.className = "chain-stack-state";
    status.textContent = entry.pending ? "待发动" : "等待结算";

    main.appendChild(owner);
    main.appendChild(name);
    row.appendChild(index);
    row.appendChild(art);
    row.appendChild(main);
    row.appendChild(status);
    root.appendChild(row);
  });

  if (entries.length <= 1) return;
  const order = document.createElement("div");
  order.className = "chain-resolution-order";
  const label = document.createElement("span");
  label.className = "chain-resolution-label";
  label.textContent = "结算顺序：";
  order.appendChild(label);
  entries.slice().reverse().forEach((entry, index) => {
    const step = document.createElement("span");
    step.className = `chain-resolution-step ${entry.pending ? "pending" : ""}`;
    step.textContent = `CL${entry.chainIndex}`;
    order.appendChild(step);
    if (index < entries.length - 1) {
      const arrow = document.createElement("span");
      arrow.className = "chain-resolution-arrow";
      arrow.textContent = " → ";
      order.appendChild(arrow);
    }
  });
  order.setAttribute("aria-label", `结算顺序：${resolutionOrder}`);
  root.appendChild(order);
}

export function renderTrapResponsePanel({
  document,
  elements = {},
  choice = null,
  traps = [],
  chain = [],
  findCard = () => null,
  activationText = () => "",
  onSelect = () => {},
  onActivate = () => {},
  onCardClick = () => {}
} = {}) {
  const view = buildTrapResponseView({
    choice,
    traps,
    chain,
    findCard,
    activationText
  });
  if (!view.visible) {
    clearTrapResponsePanel(elements);
    return view;
  }

  if (elements.chainText) elements.chainText.textContent = view.detailsText;
  if (elements.chainStatus) elements.chainStatus.textContent = view.statusText;
  if (elements.chainYes) {
    elements.chainYes.textContent = view.actionText;
    elements.chainYes.disabled = view.actionDisabled;
  }
  renderTrapChoices({
    document,
    root: elements.chainChoices,
    choices: view.choices,
    onSelect,
    onActivate
  });
  renderChainStack({
    document,
    root: elements.chainStack,
    entries: view.stackEntries,
    resolutionOrder: view.resolutionOrder,
    onCardClick
  });
  return view;
}

export function clearTrapResponsePanel(elements = {}) {
  if (elements.chainChoices) {
    elements.chainChoices.replaceChildren();
    elements.chainChoices.hidden = true;
  }
  if (elements.chainStack) {
    elements.chainStack.replaceChildren();
    elements.chainStack.hidden = true;
  }
  if (elements.chainStatus) elements.chainStatus.textContent = "";
  if (elements.chainYes) {
    elements.chainYes.disabled = false;
    elements.chainYes.textContent = "发动陷阱";
  }
}
