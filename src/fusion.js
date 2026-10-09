export function normalizeFusionRequirements(materials = []) {
  return (Array.isArray(materials) ? materials : [])
    .map((entry) => typeof entry === "string"
      ? { templateId: entry, count: 1 }
      : {
          templateId: entry?.templateId || entry?.id || "",
          count: Math.max(1, Number(entry?.count) || 1)
        })
    .filter((entry) => entry.templateId);
}

export function fusionOptionsForCard(card) {
  if (card?.type !== "spell" || card.effect !== "fusionSummon" || !card.fusion) return [];
  const sourceOptions = Array.isArray(card.fusion.options) && card.fusion.options.length > 0
    ? card.fusion.options
    : [card.fusion];

  return sourceOptions
    .map((option) => ({
      resultTemplateId: option?.resultTemplateId || option?.result || option?.cardId || "",
      materials: normalizeFusionRequirements(option?.materials || [])
    }))
    .filter((option) => option.resultTemplateId && option.materials.length > 0);
}

export function fusionOptionForResult(card, resultTemplateId = "") {
  const options = fusionOptionsForCard(card);
  if (!resultTemplateId) return options.length === 1 ? options[0] : null;
  return options.find((option) => option.resultTemplateId === resultTemplateId) || null;
}

function fusionCandidateTemplateId(candidate) {
  return candidate?.templateId
    || candidate?.card?.templateId
    || candidate?.card?.id
    || candidate?.id
    || "";
}

export function forcedFusionMaterialSelection(materials = [], candidates = []) {
  const requirements = normalizeFusionRequirements(materials);
  const available = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({
      ...candidate,
      templateId: fusionCandidateTemplateId(candidate)
    }))
    .filter((candidate) => candidate.templateId);
  const selected = [];
  const ambiguous = [];
  const missing = [];

  requirements.forEach((requirement) => {
    const matches = available.filter((candidate) => candidate.templateId === requirement.templateId);
    if (matches.length < requirement.count) {
      missing.push({ ...requirement, availableCount: matches.length });
      return;
    }
    if (matches.length === requirement.count) {
      selected.push(...matches);
      return;
    }
    ambiguous.push({ ...requirement, candidateCount: matches.length });
  });

  const requiredCount = requirements.reduce((total, requirement) => total + requirement.count, 0);
  return {
    selected,
    ambiguous,
    missing,
    requiredCount,
    unique: requirements.length > 0
      && missing.length === 0
      && ambiguous.length === 0
      && selected.length === requiredCount
  };
}
