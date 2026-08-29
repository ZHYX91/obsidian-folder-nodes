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

export const LARGE_NODE_GRAPH_THRESHOLD = 500;

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
  halfWidth: number,
  halfHeight: number,
  padding = 24,
): boolean {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const nodeHalfWidth = Math.max(2, halfWidth * point.scale);
  const nodeHalfHeight = Math.max(2, halfHeight * point.scale);
  return point.x + nodeHalfWidth >= -padding
    && point.x - nodeHalfWidth <= width + padding
    && point.y + nodeHalfHeight >= -padding
    && point.y - nodeHalfHeight <= height + padding;
}

export function hitTestNodeGraphCanvas(
  points: readonly NodeGraphCanvasPoint[],
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
): string | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point === undefined) continue;
    const width = Math.max(4, halfWidth * point.scale);
    const height = Math.max(4, halfHeight * point.scale);
    const dx = Math.abs(x - point.x);
    const dy = Math.abs(y - point.y);
    if (dx > width || dy > height) continue;
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
