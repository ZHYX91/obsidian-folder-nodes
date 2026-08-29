export interface NodeGraphCanvasCamera {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
}

export interface NodeGraphCanvasPoint {
  readonly id: string;
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export interface NodeGraphCanvasSize {
  readonly height: number;
  readonly width: number;
}

export interface NodeGraphCanvasGeometry {
  readonly halfHeight: number;
  readonly halfWidth: number;
  readonly kind: "card" | "dot";
  readonly label: boolean;
  readonly radius: number;
  readonly scale: number;
}

export const LARGE_NODE_GRAPH_THRESHOLD = 500;
export const NODE_GRAPH_CANVAS_NODE_WIDTH = 180;
export const NODE_GRAPH_CANVAS_NODE_HEIGHT = 46;
export const NODE_GRAPH_CANVAS_OVERVIEW_EDGE_LIMIT = 6_000;

export function nodeGraphCanvasGeometry(projectedScale: number): NodeGraphCanvasGeometry {
  const scale = clamp(Number.isFinite(projectedScale) ? projectedScale : 0, 0, 1.2);
  if (scale < 0.08) {
    return { halfHeight: 4, halfWidth: 4, kind: "dot", label: false, radius: 4, scale };
  }
  const width = Math.max(12, NODE_GRAPH_CANVAS_NODE_WIDTH * scale);
  const height = Math.max(7, NODE_GRAPH_CANVAS_NODE_HEIGHT * scale);
  return {
    halfHeight: height / 2,
    halfWidth: width / 2,
    kind: "card",
    label: scale >= 0.38,
    radius: 0,
    scale,
  };
}

export function selectNodeGraphCanvasOverviewEdges<T>(
  edges: readonly T[],
  limit = NODE_GRAPH_CANVAS_OVERVIEW_EDGE_LIMIT,
): readonly T[] {
  const boundedLimit = Math.max(1, Math.floor(limit));
  if (edges.length <= boundedLimit) return edges;
  const stride = Math.ceil(edges.length / boundedLimit);
  const selected: T[] = [];
  for (let index = 0; index < edges.length && selected.length < boundedLimit; index += stride) {
    const edge = edges[index];
    if (edge !== undefined) selected.push(edge);
  }
  return selected;
}

export function shouldUseNodeGraphCanvas(
  nodeCount: number,
  edgeCount = 0,
  threshold = LARGE_NODE_GRAPH_THRESHOLD,
): boolean {
  const limit = Math.max(0, threshold);
  return Math.max(0, nodeCount) > limit || Math.max(0, edgeCount) > limit;
}

export function fitNodeGraphCanvasCamera(
  content: NodeGraphCanvasSize,
  viewport: NodeGraphCanvasSize,
  padding = 32,
): NodeGraphCanvasCamera {
  const contentWidth = positive(content.width, 1);
  const contentHeight = positive(content.height, 1);
  const viewportWidth = positive(viewport.width, 1);
  const viewportHeight = positive(viewport.height, 1);
  const inset = Math.max(0, padding);
  const zoom = clamp(Math.min(
    Math.max(1, viewportWidth - inset * 2) / contentWidth,
    Math.max(1, viewportHeight - inset * 2) / contentHeight,
  ), 0.000_01, 8);
  return {
    zoom,
    panX: (viewportWidth - contentWidth * zoom) / 2,
    panY: (viewportHeight - contentHeight * zoom) / 2,
  };
}

export function panNodeGraphCanvasCamera(
  camera: NodeGraphCanvasCamera,
  deltaX: number,
  deltaY: number,
): NodeGraphCanvasCamera {
  return { ...camera, panX: camera.panX + deltaX, panY: camera.panY + deltaY };
}

export function zoomNodeGraphCanvasCamera(
  camera: NodeGraphCanvasCamera,
  deltaY: number,
  anchorX: number,
  anchorY: number,
): NodeGraphCanvasCamera {
  const zoom = clamp(camera.zoom * Math.exp(-deltaY * 0.0015), 0.000_01, 8);
  const ratio = zoom / camera.zoom;
  return {
    zoom,
    panX: anchorX - (anchorX - camera.panX) * ratio,
    panY: anchorY - (anchorY - camera.panY) * ratio,
  };
}

export function pointIsVisible(
  point: NodeGraphCanvasPoint,
  viewport: NodeGraphCanvasSize,
  padding = 24,
): boolean {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const geometry = nodeGraphCanvasGeometry(point.scale);
  return point.x + geometry.halfWidth >= -padding
    && point.x - geometry.halfWidth <= width + padding
    && point.y + geometry.halfHeight >= -padding
    && point.y - geometry.halfHeight <= height + padding;
}

export function hitTestNodeGraphCanvas(
  points: readonly NodeGraphCanvasPoint[],
  x: number,
  y: number,
): string | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point === undefined) continue;
    const geometry = nodeGraphCanvasGeometry(point.scale);
    const dx = Math.abs(x - point.x);
    const dy = Math.abs(y - point.y);
    if (dx > geometry.halfWidth || dy > geometry.halfHeight) continue;
    return point.id;
  }
  return null;
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
