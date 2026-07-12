function ownerLabel(owner) {
  if (owner === "player") return "你";
  if (owner === "ai") return "AI";
  return "未知方";
}

function viewEntry({ chainIndex, owner, card, runtimeCardId = "", pending = false }) {
  return {
    chainIndex,
    owner,
    ownerLabel: ownerLabel(owner),
    cardId: card?.templateId || card?.id || "",
    runtimeCardId,
    name: card?.name || "公开效果",
    pending
  };
}

export function buildChainStackEntries({
  chain = [],
  findCard = () => null,
  pendingCard = null,
  pendingOwner = "player"
} = {}) {
  const entries = chain.map((link, index) => {
    const found = findCard(link?.cardId);
    const card = found?.card || found || null;
    return viewEntry({
      chainIndex: Number(link?.linkId) || index + 1,
      owner: link?.playerId || found?.owner || "",
      card,
      runtimeCardId: link?.cardId || ""
    });
  });

  if (pendingCard) {
    entries.push(viewEntry({
      chainIndex: entries.length + 1,
      owner: pendingOwner,
      card: pendingCard,
      runtimeCardId: pendingCard.uid || pendingCard.engineId || "",
      pending: true
    }));
  }

  return entries;
}

export function chainResolutionOrderText(entries = []) {
  return entries
    .slice()
    .reverse()
    .map((entry) => `CL${entry.chainIndex}`)
    .join(" → ");
}
