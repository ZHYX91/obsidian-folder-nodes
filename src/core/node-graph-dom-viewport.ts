import type { NodeGraphCanvasCamera, NodeGraphCanvasSize } from "./node-graph-canvas";

/** Represent any camera pan using a reachable, non-negative DOM scroll position. */
export function nodeGraphDomViewport(
  camera: NodeGraphCanvasCamera,
  content: NodeGraphCanvasSize,
  viewport: NodeGraphCanvasSize,
) {
  const inset = 24;
  const left = Math.max(inset, camera.panX);
  const top = Math.max(inset, camera.panY);
  const scrollLeft = left - camera.panX;
  const scrollTop = top - camera.panY;
  return {
    left,
    top,
    scrollLeft,
    scrollTop,
    width: Math.max(left + content.width * camera.zoom + inset, scrollLeft + viewport.width + inset),
    height: Math.max(top + content.height * camera.zoom + inset, scrollTop + viewport.height + inset),
  };
}
