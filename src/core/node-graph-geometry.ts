import type { NodeGraphLayoutDirection } from "./types";

export interface NodeGraphPoint {
  readonly x: number;
  readonly y: number;
}

export interface NodeGraphBox extends NodeGraphPoint {
  readonly height: number;
  readonly width: number;
}

export interface NodeGraphCubicGeometry {
  readonly control1: NodeGraphPoint;
  readonly control2: NodeGraphPoint;
  readonly source: NodeGraphPoint;
  readonly target: NodeGraphPoint;
}

export interface NodeGraphQuadraticGeometry {
  readonly control: NodeGraphPoint;
  readonly source: NodeGraphPoint;
  readonly target: NodeGraphPoint;
}

export function nodeGraphBoxFromTopLeft(
  x: number,
  y: number,
  width: number,
  height: number,
): NodeGraphBox {
  return { x: x + width / 2, y: y + height / 2, width, height };
}

export function nodeGraphBoxFromCenter(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
): NodeGraphBox {
  return { x, y, width: halfWidth * 2, height: halfHeight * 2 };
}

export function nodeGraphStructureGeometry(
  sourceBox: NodeGraphBox,
  targetBox: NodeGraphBox,
  direction: NodeGraphLayoutDirection,
): NodeGraphCubicGeometry {
  if (direction === "top-to-bottom") {
    const source = { x: sourceBox.x, y: sourceBox.y + sourceBox.height / 2 };
    const target = { x: targetBox.x, y: targetBox.y - targetBox.height / 2 };
    const middleY = (source.y + target.y) / 2;
    return {
      source,
      control1: { x: source.x, y: middleY },
      control2: { x: target.x, y: middleY },
      target,
    };
  }
  const source = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y };
  const target = { x: targetBox.x - targetBox.width / 2, y: targetBox.y };
  const middleX = (source.x + target.x) / 2;
  return {
    source,
    control1: { x: middleX, y: source.y },
    control2: { x: middleX, y: target.y },
    target,
  };
}

export function nodeGraphLinkGeometry(
  sourceBox: NodeGraphBox,
  targetBox: NodeGraphBox,
  offset = 0,
): NodeGraphQuadraticGeometry {
  const source = clipToward(sourceBox, targetBox);
  const target = clipToward(targetBox, sourceBox);
  const shifted = offsetSegment(source, target, offset);
  const dx = shifted.target.x - shifted.source.x;
  const dy = shifted.target.y - shifted.source.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.min(96, Math.max(24, length * 0.14));
  return {
    source: shifted.source,
    control: {
      x: (shifted.source.x + shifted.target.x) / 2 - dy / length * bend,
      y: (shifted.source.y + shifted.target.y) / 2 + dx / length * bend,
    },
    target: shifted.target,
  };
}

export function nodeGraphCubicPath(geometry: NodeGraphCubicGeometry): string {
  const { source, control1, control2, target } = geometry;
  return `M ${source.x} ${source.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${target.x} ${target.y}`;
}

export function nodeGraphQuadraticPath(geometry: NodeGraphQuadraticGeometry): string {
  const { source, control, target } = geometry;
  return `M ${source.x} ${source.y} Q ${control.x} ${control.y}, ${target.x} ${target.y}`;
}

export function nodeGraphBoxContains(box: NodeGraphBox, point: NodeGraphPoint): boolean {
  return Math.abs(point.x - box.x) <= box.width / 2
    && Math.abs(point.y - box.y) <= box.height / 2;
}

function clipToward(box: NodeGraphBox, target: NodeGraphPoint): NodeGraphPoint {
  const dx = target.x - box.x;
  const dy = target.y - box.y;
  if (dx === 0 && dy === 0) return { x: box.x, y: box.y };
  const halfWidth = Math.max(0, box.width / 2);
  const halfHeight = Math.max(0, box.height / 2);
  const xRatio = halfWidth === 0 ? Number.POSITIVE_INFINITY : Math.abs(dx) / halfWidth;
  const yRatio = halfHeight === 0 ? Number.POSITIVE_INFINITY : Math.abs(dy) / halfHeight;
  const ratio = 1 / Math.max(xRatio, yRatio);
  return { x: box.x + dx * ratio, y: box.y + dy * ratio };
}

function offsetSegment(source: NodeGraphPoint, target: NodeGraphPoint, offset: number): {
  readonly source: NodeGraphPoint;
  readonly target: NodeGraphPoint;
} {
  if (offset === 0) return { source, target };
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const offsetX = -dy / length * offset;
  const offsetY = dx / length * offset;
  return {
    source: { x: source.x + offsetX, y: source.y + offsetY },
    target: { x: target.x + offsetX, y: target.y + offsetY },
  };
}
