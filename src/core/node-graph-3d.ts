import type { NodeGraphModel } from "./node-graph-model";

export interface NodeGraphPoint3D {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly depth: number;
}

export interface NodeGraphCamera {
  readonly yaw: number;
  readonly pitch: number;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export interface NodeGraphProjectedPoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly depth: number;
}

export interface NodeGraph3DOptions {
  readonly spacingX?: number;
  readonly spacingY?: number;
  readonly spacingZ?: number;
}

const DEFAULT_SPACING_X = 220;
const DEFAULT_SPACING_Y = 140;
const DEFAULT_SPACING_Z = 260;
const NODE_HALF_WIDTH = 90;
const NODE_HALF_HEIGHT = 23;
const MIN_CAMERA_ZOOM = 0.005;

export function layoutNodeGraph3D(model: NodeGraphModel, options: NodeGraph3DOptions = {}): readonly NodeGraphPoint3D[] {
  const spacingX = positive(options.spacingX, DEFAULT_SPACING_X);
  const spacingY = positive(options.spacingY, DEFAULT_SPACING_Y);
  const spacingZ = positive(options.spacingZ, DEFAULT_SPACING_Z);
  const byDepth = new Map<number, string[]>();
  for (const node of model.nodes) {
    const level = byDepth.get(node.depth) ?? [];
    level.push(node.id);
    byDepth.set(node.depth, level);
  }
  const points: NodeGraphPoint3D[] = [];
  for (const [depth, ids] of [...byDepth.entries()].sort(([a], [b]) => a - b)) {
    ids.sort((a, b) => a.localeCompare(b, "en"));
    const columns = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
    const rows = Math.max(1, Math.ceil(ids.length / columns));
    for (const [index, id] of ids.entries()) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      points.push({
        id,
        x: (column - (columns - 1) / 2) * spacingX,
        y: (row - (rows - 1) / 2) * spacingY,
        z: compressedDepth(depth) * spacingZ,
        depth,
      });
    }
  }
  return points;
}

function compressedDepth(depth: number): number {
  if (depth <= 0) return 0;
  return Math.log2(depth + 1);
}

export function projectNodeGraph3D(
  points: readonly NodeGraphPoint3D[],
  camera: NodeGraphCamera,
  viewportWidth: number,
  viewportHeight: number,
): readonly NodeGraphProjectedPoint[] {
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  const zoom = clamp(camera.zoom, MIN_CAMERA_ZOOM, 4);
  const focal = Math.max(width, height) * 1.4;
  return points.map((point) => {
    const yawX = point.x * cy - point.z * sy;
    const yawZ = point.x * sy + point.z * cy;
    const pitchY = point.y * cp - yawZ * sp;
    const pitchZ = point.y * sp + yawZ * cp;
    const perspective = focal / Math.max(focal * 0.35, focal + pitchZ);
    const scale = perspective * zoom;
    return {
      id: point.id,
      x: width / 2 + camera.panX + yawX * scale,
      y: height / 2 + camera.panY + pitchY * scale,
      scale,
      depth: point.depth,
    };
  });
}

export function defaultNodeGraphCamera(): NodeGraphCamera {
  return { yaw: -0.55, pitch: 0.38, zoom: 0.9, panX: 0, panY: 0 };
}

export function fitNodeGraphCamera(
  points: readonly NodeGraphPoint3D[],
  camera: NodeGraphCamera,
  viewportWidth: number,
  viewportHeight: number,
  padding = 48,
): NodeGraphCamera {
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  if (points.length === 0) return { ...camera, panX: 0, panY: 0 };
  const neutral = { ...camera, zoom: 1, panX: 0, panY: 0 };
  const neutralBounds = projectedBounds(projectNodeGraph3D(points, neutral, width, height));
  const availableWidth = Math.max(1, width - Math.max(0, padding) * 2);
  const availableHeight = Math.max(1, height - Math.max(0, padding) * 2);
  const zoom = clamp(Math.min(
    availableWidth / Math.max(1, neutralBounds.width),
    availableHeight / Math.max(1, neutralBounds.height),
  ), MIN_CAMERA_ZOOM, 4);
  const fitted = { ...camera, zoom, panX: 0, panY: 0 };
  const fittedBounds = projectedBounds(projectNodeGraph3D(points, fitted, width, height));
  return {
    ...fitted,
    panX: width / 2 - fittedBounds.centerX,
    panY: height / 2 - fittedBounds.centerY,
  };
}

export function rotateNodeGraphCamera(camera: NodeGraphCamera, deltaX: number, deltaY: number): NodeGraphCamera {
  return {
    ...camera,
    yaw: camera.yaw + deltaX * 0.006,
    pitch: clamp(camera.pitch + deltaY * 0.006, -1.2, 1.2),
  };
}

export function panNodeGraphCamera(camera: NodeGraphCamera, deltaX: number, deltaY: number): NodeGraphCamera {
  return { ...camera, panX: camera.panX + deltaX, panY: camera.panY + deltaY };
}

export function zoomNodeGraphCamera(camera: NodeGraphCamera, deltaY: number): NodeGraphCamera {
  const factor = Math.exp(-deltaY * 0.0015);
  return { ...camera, zoom: clamp(camera.zoom * factor, MIN_CAMERA_ZOOM, 4) };
}

function projectedBounds(points: readonly NodeGraphProjectedPoint[]): {
  readonly centerX: number;
  readonly centerY: number;
  readonly height: number;
  readonly width: number;
} {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const scale = Math.max(0.65, Math.min(1.2, point.scale));
    left = Math.min(left, point.x - NODE_HALF_WIDTH * scale);
    right = Math.max(right, point.x + NODE_HALF_WIDTH * scale);
    top = Math.min(top, point.y - NODE_HALF_HEIGHT * scale);
    bottom = Math.max(bottom, point.y + NODE_HALF_HEIGHT * scale);
  }
  return {
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  };
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
