export function buildLifeDisplay(value, startingLife = 4000) {
  const numericStartingLife = Number(startingLife);
  const numericValue = Number(value);
  const safeStartingLife = Number.isFinite(numericStartingLife) && numericStartingLife > 0 ? numericStartingLife : 4000;
  const safeValue = Number.isFinite(numericValue)
    ? Math.max(0, numericValue)
    : 0;
  const current = Math.round(safeValue);
  const starting = Math.round(safeStartingLife);
  const relativePercent = (safeValue / safeStartingLife) * 100;
  const percent = Math.min(100, relativePercent);
  const tone = relativePercent <= 25 ? "critical" : relativePercent <= 50 ? "warning" : "stable";

  return {
    current,
    starting,
    text: String(current),
    ariaLabel: `生命值 ${current}`,
    percent,
    tone
  };
}
