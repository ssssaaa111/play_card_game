// Declarative event triggers shared by story beats, scripted encounters and campaign objectives.

const COMPARABLE_EVENT_FIELDS = [
  "playerId",
  "reason",
  "summonType",
  "direct"
];

function normalizedTemplateId(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value.card?.id || value.id || value.templateId || "";
  }
  return "";
}

function eventZone(event, field, nestedField) {
  return event?.[field] || event?.[nestedField]?.zone || "";
}

function eventReferencesCard(event, cardId, resolveCardId) {
  if (!cardId) return true;
  const declaredTemplateIds = [event?.resultTemplateId, event?.cardTemplateId, event?.templateId]
    .filter(Boolean);
  if (declaredTemplateIds.includes(cardId)) return true;

  const references = event?.cardId
    ? [event.cardId]
    : event?.attackerCardId
      ? [event.attackerCardId]
      : [event?.sourceCardId].filter(Boolean);
  for (const reference of references) {
    if (reference === cardId) return true;
    const resolved = typeof resolveCardId === "function" ? resolveCardId(reference, event) : "";
    if (normalizedTemplateId(resolved) === cardId) return true;
  }
  return false;
}

export function scenarioEventMatches(event, when = {}, { resolveCardId } = {}) {
  if (!event || !when || typeof when !== "object") return false;
  if (when.eventType && event.type !== when.eventType) return false;
  for (const field of COMPARABLE_EVENT_FIELDS) {
    if (Object.hasOwn(when, field) && event[field] !== when[field]) return false;
  }
  if (when.fromZone && eventZone(event, "fromZone", "from") !== when.fromZone) return false;
  if (when.toZone && eventZone(event, "toZone", "to") !== when.toZone) return false;
  return eventReferencesCard(event, when.cardId, resolveCardId);
}

export function scenarioTriggerProgress(
  trigger = {},
  { events = [], afterEventId = 0, resolveCardId } = {}
) {
  const candidates = (Array.isArray(events) ? events : [])
    .filter((event) => (Number(event?.id) || 0) > (Number(afterEventId) || 0));
  const sequence = Array.isArray(trigger?.sequence) ? trigger.sequence : null;
  if (sequence?.length) {
    const eventIds = [];
    let searchFrom = 0;
    for (const when of sequence) {
      const offset = candidates.slice(searchFrom).findIndex((event) =>
        scenarioEventMatches(event, when, { resolveCardId })
      );
      if (offset < 0) return { completed: false, eventIds };
      const index = searchFrom + offset;
      eventIds.push(candidates[index].id);
      searchFrom = index + 1;
    }
    return { completed: true, eventIds };
  }

  const when = trigger?.when || trigger?.match || trigger;
  const matched = candidates.find((event) => scenarioEventMatches(event, when, { resolveCardId }));
  return { completed: Boolean(matched), eventIds: matched ? [matched.id] : [] };
}

export function evaluateScenarioObjectives(objectives = [], context = {}) {
  return (Array.isArray(objectives) ? objectives : []).map((objective) => {
    const progress = scenarioTriggerProgress(objective, context);
    const liveHint = (Array.isArray(objective?.liveHints) ? objective.liveHints : [])
      .map((entry, index) => ({
        entry,
        index,
        progress: scenarioTriggerProgress(entry, context)
      }))
      .filter(({ progress: hintProgress }) => hintProgress.completed)
      .sort((left, right) => {
        const leftEventId = Number(left.progress.eventIds.at(-1)) || 0;
        const rightEventId = Number(right.progress.eventIds.at(-1)) || 0;
        return leftEventId - rightEventId || left.index - right.index;
      })
      .at(-1);
    return {
      id: objective?.id || "",
      label: objective?.label || objective?.id || "章节目标",
      completed: progress.completed,
      eventIds: progress.eventIds,
      hint: progress.completed ? "" : liveHint?.entry?.text || "",
      hintEventIds: liveHint?.progress?.eventIds || []
    };
  });
}
