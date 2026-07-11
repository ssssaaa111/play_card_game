const atlas = (asset, ids, columns, rows) => Object.fromEntries(ids.map((id, index) => {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = columns === 1 ? 50 : (column / (columns - 1)) * 100;
  const y = rows === 1 ? 50 : (row / (rows - 1)) * 100;

  return [id, {
    asset,
    size: `${columns * 100}% ${rows * 100}%`,
    position: `${x}% ${y}%`
  }];
}));

export const cardArtById = Object.freeze({
  ...atlas("assets/card-art-spells-01.png", [
    "burst-rune",
    "renewal",
    "war-chant",
    "seer-call",
    "element-echo",
    "twin-summon",
    "rally-strike",
    "star-shield",
    "pierce-line",
    "godbreaker-spear",
    "grave-return",
    "battle-trance",
    "star-breach",
    "flame-gale-burst",
    "starforge-fusion",
    "eclipse-barrier"
  ], 4, 4),
  ...atlas("assets/card-art-spells-02.png", [
    "blade-sigil",
    "aegis-plate",
    "prism-drive",
    "overclock-core",
    "dispelling-ray",
    "soul-resonance",
    "last-spark",
    "spark-split",
    "starwake-recall",
    "dawn-edge",
    "limit-break-oath",
    "soulforge-ascent",
    "material-reclaim",
    "corebreak-edict",
    "trio-moon-dominion",
    "trio-moonbreaker-ray"
  ], 4, 4),
  ...atlas("assets/card-art-spells-03.png", [
    "trio-ember-recall",
    "trio-final-counter"
  ], 2, 1),
  ...atlas("assets/card-art-traps-01.png", [
    "mirror-snare",
    "guard-sigil",
    "summon-flare",
    "counter-array",
    "storm-shift",
    "void-lock",
    "phantom-switch",
    "weakening-web",
    "soul-parry",
    "reversal-flare",
    "chain-nullifier",
    "last-light-guard",
    "backlash-mirror",
    "ace-vow-guard",
    "trio-solar-snare",
    "trio-chain-veil"
  ], 4, 4)
});

export function applyCardArt(element, cardId) {
  const art = cardArtById[cardId];
  if (!art) return false;

  element.style.setProperty("--card-art-image", `url("${art.asset}")`);
  element.style.setProperty("--card-art-size", art.size);
  element.style.setProperty("--card-art-position", art.position);
  return true;
}
