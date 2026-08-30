import type { NodeGraphLayoutDirection } from "./types";

import { NODE_GRAPH_CARD_WIDTH_REGULAR } from "./node-graph-card-width";

export interface NodeGraphTree {
  readonly id: string;
  readonly children: readonly NodeGraphTree[];
}

export interface NodeGraphLayoutOptions {
  readonly nodeWidth?: number;
  readonly nodeWidths?: ReadonlyMap<string, number>;
  readonly nodeHeight?: number;
  readonly horizontalGap?: number;
  readonly verticalGap?: number;
  readonly padding?: number;
  readonly direction?: NodeGraphLayoutDirection;
}

export interface NodeGraphLayoutNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly width: number;
}

export interface NodeGraphLayoutEdge {
  readonly source: string;
  readonly target: string;
}

export interface NodeGraphLayout {
  readonly nodes: readonly NodeGraphLayoutNode[];
  readonly edges: readonly NodeGraphLayoutEdge[];
  readonly width: number;
  readonly height: number;
  readonly maxNodeWidth: number;
  readonly nodeHeight: number;
  readonly direction: NodeGraphLayoutDirection;
}

export interface NodeGraphViewportFit {
  readonly scale: number;
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

const DEFAULT_NODE_WIDTH = NODE_GRAPH_CARD_WIDTH_REGULAR;
const DEFAULT_NODE_HEIGHT = 46;
const DEFAULT_LEFT_TO_RIGHT_HORIZONTAL_GAP = 72;
const DEFAULT_LEFT_TO_RIGHT_VERTICAL_GAP = 18;
const DEFAULT_TOP_TO_BOTTOM_HORIZONTAL_GAP = 36;
const DEFAULT_TOP_TO_BOTTOM_VERTICAL_GAP = 64;
const DEFAULT_PADDING = 32;

export function layoutNodeGraph(root: NodeGraphTree, options: NodeGraphLayoutOptions = {}): NodeGraphLayout {
  return layoutNodeGraphForest([root], options);
}

export function layoutNodeGraphForest(roots: readonly NodeGraphTree[], options: NodeGraphLayoutOptions = {}): NodeGraphLayout {
  if (roots.length === 0) {
    const nodeWidth = positive(options.nodeWidth, DEFAULT_NODE_WIDTH);
    const nodeHeight = positive(options.nodeHeight, DEFAULT_NODE_HEIGHT);
    const padding = nonNegative(options.padding, DEFAULT_PADDING);
    const direction = layoutDirection(options.direction);
    return { nodes: [], edges: [], width: nodeWidth + padding * 2, height: nodeHeight + padding * 2, maxNodeWidth: nodeWidth, nodeHeight, direction };
  }
  if (roots.length === 1) {
    const root = roots[0];
    if (root === undefined) throw new Error("Node Graph forest lost its root");
    return layoutSingleNodeGraph(root, options);
  }
  const virtualRoot = "\u0000folder-nodes-forest-root";
  const base = layoutSingleNodeGraph({ id: virtualRoot, children: roots }, options);
  const padding = nonNegative(options.padding, DEFAULT_PADDING);
  const visibleNodes = normalizeLayoutNodes(
    base.nodes.filter(({ id }) => id !== virtualRoot),
    padding,
  );
  return {
    ...layoutBounds(visibleNodes, base.nodeHeight, base.direction, padding, options.nodeWidth),
    nodes: visibleNodes.map((node) => ({ ...node, depth: node.depth - 1 })),
    edges: base.edges.filter(({ source }) => source !== virtualRoot),
  };
}

function layoutSingleNodeGraph(root: NodeGraphTree, options: NodeGraphLayoutOptions): NodeGraphLayout {
  const defaultNodeWidth = positive(options.nodeWidth, DEFAULT_NODE_WIDTH);
  const nodeHeight = positive(options.nodeHeight, DEFAULT_NODE_HEIGHT);
  const direction = layoutDirection(options.direction);
  const horizontalGap = nonNegative(options.horizontalGap, defaultHorizontalGap(direction));
  const verticalGap = nonNegative(options.verticalGap, defaultVerticalGap(direction));
  const padding = nonNegative(options.padding, DEFAULT_PADDING);
  const nodes: NodeGraphLayoutNode[] = [];
  const edges: NodeGraphLayoutEdge[] = [];
  let nextLeafPosition = padding;
  const positions = new Map<string, MutableLayoutNode>();
  const subtreeSpans = direction === "top-to-bottom" ? new Map<string, number>() : null;
  const pending: Array<{ readonly depth: number; readonly node: NodeGraphTree; readonly visited: boolean }> = [
    { depth: 0, node: root, visited: false },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const { depth, node, visited } = current;
    const children = node.children;
    if (!visited) {
      pending.push({ depth, node, visited: true });
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child !== undefined) pending.push({ depth: depth + 1, node: child, visited: false });
      }
      continue;
    }
    const width = positive(options.nodeWidths?.get(node.id), defaultNodeWidth);
    const placedChildren = children.map((child) => {
      const placed = positions.get(child.id);
      if (placed === undefined) throw new Error(`Node Graph layout lost child position: ${child.id}`);
      edges.push({ source: node.id, target: child.id });
      return placed;
    });
    let breadthPosition = 0;
    if (direction === "left-to-right" && placedChildren.length === 0) {
      breadthPosition = nextLeafPosition;
      nextLeafPosition += nodeHeight + verticalGap;
    } else if (direction === "left-to-right") {
      const first = placedChildren[0];
      const last = placedChildren[placedChildren.length - 1];
      if (first === undefined || last === undefined) throw new Error("Node Graph layout lost a child position");
      breadthPosition = (first.y + last.y) / 2;
    }
    const placed: MutableLayoutNode = {
      id: node.id,
      x: 0,
      y: direction === "left-to-right" ? breadthPosition : padding + depth * (nodeHeight + verticalGap),
      depth,
      width,
    };
    nodes.push(placed);
    positions.set(node.id, placed);
    if (subtreeSpans !== null) {
      const childrenSpan = children.reduce((sum, child) => {
        const span = subtreeSpans.get(child.id);
        if (span === undefined) throw new Error(`Node Graph layout lost child span: ${child.id}`);
        return sum + span;
      }, 0) + Math.max(0, children.length - 1) * horizontalGap;
      subtreeSpans.set(node.id, Math.max(width, childrenSpan));
    }
  }
  if (direction === "left-to-right") placeHorizontalDepths(root, positions, padding, horizontalGap);
  else if (subtreeSpans !== null) placeVerticalBreadths(root, positions, subtreeSpans, padding, horizontalGap);
  const normalized = normalizeLayoutNodes(nodes, padding);
  return { nodes: normalized, edges, ...layoutBounds(normalized, nodeHeight, direction, padding, defaultNodeWidth) };
}

function placeVerticalBreadths(
  root: NodeGraphTree,
  positions: ReadonlyMap<string, MutableLayoutNode>,
  subtreeSpans: ReadonlyMap<string, number>,
  padding: number,
  horizontalGap: number,
): void {
  const pending: Array<{ readonly bandStart: number; readonly node: NodeGraphTree }> = [
    { bandStart: padding, node: root },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const { bandStart, node } = current;
    const position = positions.get(node.id);
    const span = subtreeSpans.get(node.id);
    if (position === undefined || span === undefined) throw new Error(`Node Graph layout lost subtree geometry: ${node.id}`);
    position.x = bandStart + (span - position.width) / 2;
    let childrenSpan = Math.max(0, node.children.length - 1) * horizontalGap;
    for (const child of node.children) childrenSpan += subtreeSpans.get(child.id) ?? 0;
    let childStart = bandStart + (span - childrenSpan) / 2;
    const placements: Array<{ readonly bandStart: number; readonly node: NodeGraphTree }> = [];
    for (const child of node.children) {
      placements.push({ bandStart: childStart, node: child });
      childStart += (subtreeSpans.get(child.id) ?? 0) + horizontalGap;
    }
    for (let index = placements.length - 1; index >= 0; index -= 1) {
      const placement = placements[index];
      if (placement !== undefined) pending.push(placement);
    }
  }
}

interface MutableLayoutNode {
  readonly id: string;
  x: number;
  y: number;
  readonly depth: number;
  readonly width: number;
}

function placeHorizontalDepths(
  root: NodeGraphTree,
  positions: ReadonlyMap<string, MutableLayoutNode>,
  padding: number,
  horizontalGap: number,
): void {
  const rootPosition = positions.get(root.id);
  if (rootPosition === undefined) throw new Error(`Node Graph layout lost root position: ${root.id}`);
  rootPosition.x = padding;
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) break;
    const parent = positions.get(node.id);
    if (parent === undefined) throw new Error(`Node Graph layout lost parent position: ${node.id}`);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child === undefined) continue;
      const placed = positions.get(child.id);
      if (placed === undefined) throw new Error(`Node Graph layout lost child position: ${child.id}`);
      placed.x = parent.x + parent.width + horizontalGap;
      pending.push(child);
    }
  }
}

function normalizeLayoutNodes(nodes: readonly NodeGraphLayoutNode[], padding: number): NodeGraphLayoutNode[] {
  if (nodes.length === 0) return [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
  }
  const offsetX = padding - minX;
  const offsetY = padding - minY;
  return nodes.map((node) => ({ ...node, x: node.x + offsetX, y: node.y + offsetY }));
}

function layoutBounds(
  nodes: readonly NodeGraphLayoutNode[],
  nodeHeight: number,
  direction: NodeGraphLayoutDirection,
  padding: number,
  fallbackNodeWidth = DEFAULT_NODE_WIDTH,
): Pick<NodeGraphLayout, "direction" | "height" | "maxNodeWidth" | "nodeHeight" | "width"> {
  let maxRight = 0;
  let maxBottom = 0;
  let maxNodeWidth = nodes.length === 0 ? positive(fallbackNodeWidth, DEFAULT_NODE_WIDTH) : 0;
  for (const node of nodes) {
    maxRight = Math.max(maxRight, node.x + node.width);
    maxBottom = Math.max(maxBottom, node.y + nodeHeight);
    maxNodeWidth = Math.max(maxNodeWidth, node.width);
  }
  return {
    width: Math.max(maxNodeWidth + padding * 2, maxRight + padding),
    height: Math.max(nodeHeight + padding * 2, maxBottom + padding),
    maxNodeWidth,
    nodeHeight,
    direction,
  };
}

function layoutDirection(value: NodeGraphLayoutDirection | undefined): NodeGraphLayoutDirection {
  return value === "top-to-bottom" ? "top-to-bottom" : "left-to-right";
}

function defaultHorizontalGap(direction: NodeGraphLayoutDirection): number {
  return direction === "left-to-right" ? DEFAULT_LEFT_TO_RIGHT_HORIZONTAL_GAP : DEFAULT_TOP_TO_BOTTOM_HORIZONTAL_GAP;
}

function defaultVerticalGap(direction: NodeGraphLayoutDirection): number {
  return direction === "left-to-right" ? DEFAULT_LEFT_TO_RIGHT_VERTICAL_GAP : DEFAULT_TOP_TO_BOTTOM_VERTICAL_GAP;
}

export function fitNodeGraphViewport(
  contentWidth: number,
  contentHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 24,
  minimumScale = 0,
): NodeGraphViewportFit {
  const width = positive(contentWidth, 1);
  const height = positive(contentHeight, 1);
  const availableWidth = nonNegative(viewportWidth, 0);
  const availableHeight = nonNegative(viewportHeight, 0);
  const inset = nonNegative(padding, 24);
  if (availableWidth === 0 || availableHeight === 0) {
    return { scale: 1, stageWidth: width, stageHeight: height, offsetX: 0, offsetY: 0 };
  }
  const fittedScale = Math.min(
    1,
    Math.max(1, availableWidth - inset * 2) / width,
    Math.max(1, availableHeight - inset * 2) / height,
  );
  const scale = Math.max(Math.min(1, nonNegative(minimumScale, 0)), fittedScale);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const stageWidth = Math.max(availableWidth, scaledWidth + inset * 2);
  const stageHeight = Math.max(availableHeight, scaledHeight + inset * 2);
  return {
    scale,
    stageWidth,
    stageHeight,
    offsetX: (stageWidth - scaledWidth) / 2,
    offsetY: (stageHeight - scaledHeight) / 2,
  };
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
