export function buildLifeDisplay(value, maximum = 4000) {
  const safeMaximum = Number.isFinite(maximum) && maximum > 0 ? maximum : 4000;
  const safeValue = Number.isFinite(value)
    ? Math.max(0, Math.min(safeMaximum, value))
    : 0;
  const current = Math.round(safeValue);
  const max = Math.round(safeMaximum);

  return {
    current,
    max,
    text: `${current} / ${max}`,
    ariaLabel: `生命值 ${current} / ${max}`,
    percent: (safeValue / safeMaximum) * 100
  };
}
