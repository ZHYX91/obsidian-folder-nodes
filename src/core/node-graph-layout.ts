import type { NodeGraphLayoutDirection } from "./types";

export interface NodeGraphTree {
  readonly id: string;
  readonly children: readonly NodeGraphTree[];
}

export interface NodeGraphLayoutOptions {
  readonly nodeWidth?: number;
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
  readonly nodeWidth: number;
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

const DEFAULT_NODE_WIDTH = 180;
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
    return { nodes: [], edges: [], width: nodeWidth + padding * 2, height: nodeHeight + padding * 2, nodeWidth, nodeHeight, direction };
  }
  if (roots.length === 1) {
    const root = roots[0];
    if (root === undefined) throw new Error("Node Graph forest lost its root");
    return layoutSingleNodeGraph(root, options);
  }
  const virtualRoot = "\u0000folder-nodes-forest-root";
  const base = layoutSingleNodeGraph({ id: virtualRoot, children: roots }, options);
  const horizontalGap = nonNegative(options.horizontalGap, defaultHorizontalGap(base.direction));
  const verticalGap = nonNegative(options.verticalGap, defaultVerticalGap(base.direction));
  const depthStep = base.direction === "left-to-right"
    ? base.nodeWidth + horizontalGap
    : base.nodeHeight + verticalGap;
  return {
    ...base,
    nodes: base.nodes.filter(({ id }) => id !== virtualRoot).map((node) => ({
      ...node,
      depth: node.depth - 1,
      x: base.direction === "left-to-right" ? node.x - depthStep : node.x,
      y: base.direction === "top-to-bottom" ? node.y - depthStep : node.y,
    })),
    edges: base.edges.filter(({ source }) => source !== virtualRoot),
    width: base.direction === "left-to-right" ? Math.max(base.nodeWidth, base.width - depthStep) : base.width,
    height: base.direction === "top-to-bottom" ? Math.max(base.nodeHeight, base.height - depthStep) : base.height,
  };
}

function layoutSingleNodeGraph(root: NodeGraphTree, options: NodeGraphLayoutOptions): NodeGraphLayout {
  const nodeWidth = positive(options.nodeWidth, DEFAULT_NODE_WIDTH);
  const nodeHeight = positive(options.nodeHeight, DEFAULT_NODE_HEIGHT);
  const direction = layoutDirection(options.direction);
  const horizontalGap = nonNegative(options.horizontalGap, defaultHorizontalGap(direction));
  const verticalGap = nonNegative(options.verticalGap, defaultVerticalGap(direction));
  const padding = nonNegative(options.padding, DEFAULT_PADDING);
  const nodes: NodeGraphLayoutNode[] = [];
  const edges: NodeGraphLayoutEdge[] = [];
  let nextLeafPosition = padding;
  let maxDepth = 0;
  let maxBreadth = padding + (direction === "left-to-right" ? nodeHeight : nodeWidth);
  const positions = new Map<string, NodeGraphLayoutNode>();
  const pending: Array<{ readonly depth: number; readonly node: NodeGraphTree; readonly visited: boolean }> = [
    { depth: 0, node: root, visited: false },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const { depth, node, visited } = current;
    const children = [...node.children].sort((left, right) => left.id.localeCompare(right.id, "en"));
    if (!visited) {
      pending.push({ depth, node, visited: true });
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child !== undefined) pending.push({ depth: depth + 1, node: child, visited: false });
      }
      continue;
    }
    maxDepth = Math.max(maxDepth, depth);
    const placedChildren = children.map((child) => {
      const placed = positions.get(child.id);
      if (placed === undefined) throw new Error(`Node Graph layout lost child position: ${child.id}`);
      edges.push({ source: node.id, target: child.id });
      return placed;
    });
    let breadthPosition: number;
    if (placedChildren.length === 0) {
      breadthPosition = nextLeafPosition;
      nextLeafPosition += direction === "left-to-right"
        ? nodeHeight + verticalGap
        : nodeWidth + horizontalGap;
    } else {
      const first = placedChildren[0];
      const last = placedChildren[placedChildren.length - 1];
      if (first === undefined || last === undefined) throw new Error("Node Graph layout lost a child position");
      breadthPosition = direction === "left-to-right"
        ? (first.y + last.y) / 2
        : (first.x + last.x) / 2;
    }
    const placed: NodeGraphLayoutNode = {
      id: node.id,
      x: direction === "left-to-right" ? padding + depth * (nodeWidth + horizontalGap) : breadthPosition,
      y: direction === "left-to-right" ? breadthPosition : padding + depth * (nodeHeight + verticalGap),
      depth,
    };
    nodes.push(placed);
    positions.set(node.id, placed);
    maxBreadth = Math.max(maxBreadth, breadthPosition + (direction === "left-to-right" ? nodeHeight : nodeWidth));
  }
  return {
    nodes,
    edges,
    width: direction === "left-to-right"
      ? padding * 2 + (maxDepth + 1) * nodeWidth + maxDepth * horizontalGap
      : Math.max(nodeWidth + padding * 2, maxBreadth + padding),
    height: direction === "left-to-right"
      ? Math.max(nodeHeight + padding * 2, maxBreadth + padding)
      : padding * 2 + (maxDepth + 1) * nodeHeight + maxDepth * verticalGap,
    nodeWidth,
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
): NodeGraphViewportFit {
  const width = positive(contentWidth, 1);
  const height = positive(contentHeight, 1);
  const availableWidth = nonNegative(viewportWidth, 0);
  const availableHeight = nonNegative(viewportHeight, 0);
  const inset = nonNegative(padding, 24);
  if (availableWidth === 0 || availableHeight === 0) {
    return { scale: 1, stageWidth: width, stageHeight: height, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(
    1,
    Math.max(1, availableWidth - inset * 2) / width,
    Math.max(1, availableHeight - inset * 2) / height,
  );
  return {
    scale,
    stageWidth: availableWidth,
    stageHeight: availableHeight,
    offsetX: (availableWidth - width * scale) / 2,
    offsetY: (availableHeight - height * scale) / 2,
  };
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
