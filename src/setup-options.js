function optionEntries(source = {}) {
  return Object.entries(source).map(([id, definition]) => ({
    id,
    label: definition?.label || definition?.name || id
  }));
}

export function roleSetupOptions(roleProfiles = {}) {
  return optionEntries(roleProfiles);
}

export function aiSetupOptions(aiProfiles = {}) {
  return optionEntries(aiProfiles);
}

export function deckSetupOptions(deckPresets = {}, { testMode = false, customDecks = [] } = {}) {
  const presetEntries = optionEntries(deckPresets).filter(({ id }) =>
    testMode || deckPresets[id]?.setupVisibility !== "internal"
  );
  const customEntries = customDecks.map((deck) => ({
    id: deck.id,
    label: deck.name,
    custom: true
  }));
  return [...presetEntries, ...customEntries];
}

export function scenarioSetupOptions(scenarioSetups = {}, { testMode = false } = {}) {
  return optionEntries(scenarioSetups).filter(({ id }) =>
    testMode || scenarioSetups[id]?.setupVisibility === "player"
  );
}
