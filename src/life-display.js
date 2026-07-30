export function buildLifeDisplay(value, maximum = 4000) {
  const numericMaximum = Number(maximum);
  const numericValue = Number(value);
  const safeMaximum = Number.isFinite(numericMaximum) && numericMaximum > 0 ? numericMaximum : 4000;
  const safeValue = Number.isFinite(numericValue)
    ? Math.max(0, Math.min(safeMaximum, numericValue))
    : 0;
  const current = Math.round(safeValue);
  const max = Math.round(safeMaximum);
  const percent = (safeValue / safeMaximum) * 100;
  const tone = percent <= 25 ? "critical" : percent <= 50 ? "warning" : "stable";

  return {
    current,
    max,
    text: `${current} / ${max}`,
    ariaLabel: `生命值 ${current} / ${max}`,
    percent,
    tone
  };
}
