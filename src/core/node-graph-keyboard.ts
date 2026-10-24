export interface GraphKeyboardPoint { readonly id: string; readonly x: number; readonly y: number }

/** Arrow keys follow the displayed geometry; Home/End retain stable model order. */
export function graphKeyboardTarget(
  key: string,
  current: string | null,
  ordered: readonly string[],
  points: readonly GraphKeyboardPoint[],
): string | null {
  if (ordered.length === 0) return null;
  if (key === "End") return ordered[ordered.length - 1] ?? null;
  if (key === "Home" || current === null || !ordered.includes(current)) return ordered[0] ?? null;
  const origin = points.find((point) => point.id === current);
  if (origin === undefined) return current;
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const direction = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  let best = current;
  let bestScore = Infinity;
  for (const point of points) {
    if (point.id === current) continue;
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const forward = direction * (horizontal ? dx : dy);
    if (forward <= 0.5) continue;
    // Prefer nearby, aligned cards; no wrap to the opposite edge of the graph.
    const cross = Math.abs(horizontal ? dy : dx);
    const score = Math.hypot(forward, cross) + 2 * cross;
    if (score < bestScore) { bestScore = score; best = point.id; }
  }
  return best;
}
