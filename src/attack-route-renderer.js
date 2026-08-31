function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function rectCenter(rect = {}) {
  return {
    x: finiteNumber(rect.left ?? rect.x) + finiteNumber(rect.width) / 2,
    y: finiteNumber(rect.top ?? rect.y) + finiteNumber(rect.height) / 2
  };
}

function distanceToRectEdge(rect, unitX, unitY) {
  const halfWidth = Math.max(0, finiteNumber(rect?.width) / 2);
  const halfHeight = Math.max(0, finiteNumber(rect?.height) / 2);
  const horizontal = Math.abs(unitX) > 0.0001 ? halfWidth / Math.abs(unitX) : Infinity;
  const vertical = Math.abs(unitY) > 0.0001 ? halfHeight / Math.abs(unitY) : Infinity;
  return Math.min(horizontal, vertical);
}

export function buildAttackRouteSegment(referenceRect, attackerRect, targetRect, options = {}) {
  if (!referenceRect || !attackerRect || !targetRect) return null;
  const referenceLeft = finiteNumber(referenceRect.left ?? referenceRect.x);
  const referenceTop = finiteNumber(referenceRect.top ?? referenceRect.y);
  const start = rectCenter(attackerRect);
  const end = rectCenter(targetRect);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const centerDistance = Math.hypot(deltaX, deltaY);
  if (centerDistance < 1) return null;
  const unitX = deltaX / centerDistance;
  const unitY = deltaY / centerDistance;
  const endpointGap = Math.max(0, finiteNumber(options.endpointGap ?? 10));
  const attackerEdge = distanceToRectEdge(attackerRect, unitX, unitY);
  const targetEdge = distanceToRectEdge(targetRect, unitX, unitY);
  const length = centerDistance - attackerEdge - targetEdge - endpointGap * 2;
  if (length < 1) return null;
  const startOffset = attackerEdge + endpointGap;
  return {
    x: start.x + unitX * startOffset - referenceLeft,
    y: start.y + unitY * startOffset - referenceTop,
    length,
    angle: Math.atan2(deltaY, deltaX) * 180 / Math.PI,
    targetIndex: Number.isInteger(options.targetIndex) ? options.targetIndex : -1,
    direct: Boolean(options.direct),
    active: Boolean(options.active)
  };
}

export function renderAttackRouteLayer({
  document,
  root,
  reference,
  attacker,
  targets = [],
  activeTargetIndex = null
} = {}) {
  if (!root) return [];
  root.replaceChildren();
  const referenceRect = reference?.getBoundingClientRect?.();
  const attackerRect = attacker?.getBoundingClientRect?.();
  const validTargets = targets.filter((entry) => entry?.element?.getBoundingClientRect);
  const singleTarget = validTargets.length === 1;
  const segments = validTargets
    .map((entry) => buildAttackRouteSegment(
      referenceRect,
      attackerRect,
      entry.element.getBoundingClientRect(),
      {
        targetIndex: entry.targetIndex,
        direct: entry.targetIndex < 0,
        active: activeTargetIndex === entry.targetIndex || (activeTargetIndex == null && singleTarget)
      }
    ))
    .filter(Boolean);

  for (const segment of segments) {
    const route = document.createElement("span");
    route.className = `attack-route${segment.active ? " is-active" : ""}${segment.direct ? " is-direct" : ""}`;
    route.dataset.targetIndex = String(segment.targetIndex);
    route.style.setProperty("--attack-route-x", `${segment.x}px`);
    route.style.setProperty("--attack-route-y", `${segment.y}px`);
    route.style.setProperty("--attack-route-length", `${segment.length}px`);
    route.style.setProperty("--attack-route-angle", `${segment.angle}deg`);
    root.appendChild(route);
  }
  root.hidden = segments.length === 0;
  root.dataset.routeCount = String(segments.length);
  return segments;
}
