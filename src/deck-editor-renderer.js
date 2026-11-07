function clearChildren(node) {
  if (!node) return;
  node.textContent = "";
}

function renderTextList(document, root, entries, renderEntry) {
  if (!root) return;
  const fragment = document.createDocumentFragment();
  entries.forEach((entry, index) => {
    fragment.appendChild(renderEntry(entry, index));
  });
  clearChildren(root);
  root.appendChild(fragment);
}

function renderDeckList(document, root, decks, handlers) {
  renderTextList(document, root, decks, (deck) => {
    const item = document.createElement("li");
    item.className = "deck-editor-deck-item";
    if (deck.selected) item.classList.add("selected");
    item.dataset.deckId = deck.id;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "deck-editor-deck-select";
    button.textContent = `${deck.name}（${deck.size} 张）`;
    button.addEventListener("click", () => handlers?.onSelectDeck?.(deck.id));
    item.appendChild(button);
    return item;
  });
}

function renderDraftList(document, root, entries, handlers) {
  renderTextList(document, root, entries, (entry) => {
    const item = document.createElement("li");
    item.className = "deck-editor-draft-item";
    item.dataset.cardId = entry.id;

    const label = document.createElement("span");
    label.className = "deck-editor-draft-label";
    label.textContent = `${entry.name} x${entry.count}`;
    item.appendChild(label);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "deck-editor-remove";
    remove.textContent = "移除 1 张";
    remove.addEventListener("click", () => handlers?.onRemoveCard?.(entry.id));
    item.appendChild(remove);
    return item;
  });
}

function renderLibraryGroup(document, root, group, handlers) {
  const section = document.createElement("section");
  section.className = "deck-editor-library-group";
  section.dataset.group = group.key;

  const heading = document.createElement("h4");
  heading.textContent = `${group.label}（${group.cards.length}）`;
  section.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "deck-editor-library-list";
  group.cards.forEach((card) => {
    const item = document.createElement("li");
    item.className = "deck-editor-library-card";
    item.dataset.cardId = card.id;
    if (card.maxed) item.classList.add("maxed");

    const add = document.createElement("button");
    add.type = "button";
    add.disabled = card.maxed;
    add.className = "deck-editor-library-add";
    add.title = card.maxed ? `同名卡已达 ${card.count} 张上限` : `加入 ${card.name}`;
    const name = document.createElement("strong");
    name.textContent = card.name;
    const meta = document.createElement("small");
    meta.textContent = card.meta;
    const count = document.createElement("span");
    count.className = "deck-editor-library-count";
    count.textContent = card.maxed ? `${card.count}/${card.count}` : `${card.count}/${3}`;
    add.append(name, meta, count);
    add.addEventListener("click", () => handlers?.onAddCard?.(card.id));
    item.appendChild(add);
    list.appendChild(item);
  });
  section.appendChild(list);
  root?.appendChild(section);
}

function renderPresetOptions(document, select, presetOptions = []) {
  if (!select) return;
  const selectedPreset = select.value;
  const fragment = document.createDocumentFragment();
  presetOptions.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.label;
    fragment.appendChild(option);
  });
  clearChildren(select);
  select.appendChild(fragment);
  if (presetOptions.some((entry) => entry.id === selectedPreset)) {
    select.value = selectedPreset;
  }
}

export function renderDeckEditor(document, elements, view, handlers, { presetOptions = [] } = {}) {
  if (!elements.deckEditorModal) return;
  renderDeckList(document, elements.deckEditorDeckList, view.decks, handlers);
  renderDraftList(document, elements.deckEditorDraftList, view.draftEntries, handlers);
  renderPresetOptions(document, elements.deckEditorPresetSelect, presetOptions);

  if (elements.deckEditorName) {
    if (document.activeElement !== elements.deckEditorName) {
      elements.deckEditorName.value = view.draftName;
    }
  }
  if (elements.deckEditorSize) {
    elements.deckEditorSize.textContent = `${view.draftSize} 张`;
  }
  if (elements.deckEditorValidation) {
    elements.deckEditorValidation.textContent = view.validationText;
    elements.deckEditorValidation.classList.toggle("valid", view.validation.ok);
  }
  if (elements.deckEditorSave) {
    elements.deckEditorSave.disabled = !view.canSave;
  }
  if (elements.deckEditorDelete) {
    elements.deckEditorDelete.disabled = !view.canDelete;
  }

  if (elements.deckEditorSearch && elements.deckEditorSearch.value !== view.libraryQuery) {
    elements.deckEditorSearch.value = view.libraryQuery;
  }
  if (elements.deckEditorType) elements.deckEditorType.value = view.libraryType;
  if (elements.deckEditorClearFilters) elements.deckEditorClearFilters.disabled = !view.libraryFiltered;
  if (elements.deckEditorLibraryStatus) elements.deckEditorLibraryStatus.textContent = view.libraryStatus;

  const root = elements.deckEditorLibrary;
  const filterKey = JSON.stringify([view.libraryQuery, view.libraryType]);
  const scrollTop = root?.dataset.filterKey === filterKey ? root.scrollTop : 0;
  clearChildren(root);
  view.libraryGroups.forEach((group) => {
    renderLibraryGroup(document, root, group, handlers);
  });
  if (root && view.libraryMatchCount === 0) {
    const empty = document.createElement("p");
    empty.className = "deck-editor-library-empty";
    empty.textContent = "没有匹配的卡牌，试试其他关键词或清除筛选。";
    root.appendChild(empty);
  }
  if (root) { root.dataset.filterKey = filterKey; root.scrollTop = scrollTop; }
}

export function bindDeckEditorEvents(elements, handlers = {}) {
  elements.deckEditorSearch?.addEventListener("input", (event) => handlers.onLibraryQueryChange?.(event.target.value));
  elements.deckEditorType?.addEventListener("change", (event) => handlers.onLibraryTypeChange?.(event.target.value));
  elements.deckEditorClearFilters?.addEventListener("click", () => {
    handlers.onClearLibraryFilters?.();
    elements.deckEditorSearch?.focus();
  });
  elements.deckEditorClose?.addEventListener("click", () => handlers.onClose?.());
  elements.deckEditorNew?.addEventListener("click", () => handlers.onNewDeck?.());
  elements.deckEditorImportPreset?.addEventListener("click", () => {
    const presetId = elements.deckEditorPresetSelect?.value;
    if (presetId) handlers.onImportPreset?.(presetId);
  });
  elements.deckEditorName?.addEventListener("input", (event) => {
    handlers.onNameChange?.(event.target.value);
  });
  elements.deckEditorSave?.addEventListener("click", () => handlers.onSave?.());
  elements.deckEditorDelete?.addEventListener("click", () => handlers.onDelete?.());
  elements.deckEditorModal?.addEventListener("click", (event) => {
    if (event.target === elements.deckEditorModal) handlers.onClose?.();
  });
}
