function ownerLabel(owner) {
  if (owner === "player") return "你";
  if (owner === "ai") return "AI";
  return "未知方";
}

function cardView(cardId, owner, findCard) {
  const found = findCard(cardId);
  const card = found?.card || found || null;
  return {
    cardId: card?.templateId || card?.id || "",
    runtimeCardId: cardId || "",
    name: card?.name || "公开效果",
    owner: owner || found?.owner || "",
    ownerLabel: ownerLabel(owner || found?.owner || "")
  };
}

function chainHistoryEntry(events, resolvedEvent, findCard) {
  const links = (resolvedEvent.resolvedLinks || [])
    .slice()
    .sort((left, right) => Number(left.linkId) - Number(right.linkId));
  if (links.length === 0) return null;

  const negations = events.filter((event) => event.type === "EFFECT_NEGATED");
  const resolvedLinks = events.filter((event) => event.type === "CHAIN_LINK_RESOLVED");
  const viewLinks = links.map((link, index) => {
    const view = cardView(link.cardId, link.playerId, findCard);
    const resolved = resolvedLinks.find((event) => event.linkId === link.linkId && event.cardId === link.cardId);
    const negation = negations.find((event) => event.targetEffectId === link.cardId);
    const sourceLink = negation
      ? links.find((candidate) => candidate.cardId === negation.sourceCardId)
      : null;
    const negated = Boolean(resolved?.skipped || negation);
    return {
      ...view,
      chainIndex: Number(link.linkId) || index + 1,
      status: negated ? "negated" : "resolved",
      statusLabel: negated ? "被无效" : "已生效",
      negatedByChainIndex: sourceLink ? Number(sourceLink.linkId) : null
    };
  });

  return {
    id: `chain:${resolvedEvent.id || resolvedEvent.sequence || "resolved"}`,
    eventId: resolvedEvent.id || null,
    linkCount: viewLinks.length,
    activationOrder: viewLinks.map((link) => `CL${link.chainIndex}`).join(" → "),
    resolutionOrder: viewLinks.slice().reverse().map((link) => `CL${link.chainIndex}`).join(" → "),
    links: viewLinks
  };
}

export function buildChainHistory(events = [], { findCard = () => null, limit = 3 } = {}) {
  const histories = [];
  let groupStart = 0;

  events.forEach((event, index) => {
    if (event?.type !== "CHAIN_RESOLVED") return;
    const entry = chainHistoryEntry(events.slice(groupStart, index + 1), event, findCard);
    if (entry) histories.unshift(entry);
    groupStart = index + 1;
  });

  return histories.slice(0, Math.max(0, limit));
}
