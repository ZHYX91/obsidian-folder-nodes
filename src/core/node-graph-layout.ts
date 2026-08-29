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
const DEFAULT_HORIZONTAL_GAP = 36;
const DEFAULT_VERTICAL_GAP = 64;
const DEFAULT_PADDING = 32;

export function layoutNodeGraph(root: NodeGraphTree, options: NodeGraphLayoutOptions = {}): NodeGraphLayout {
  const nodeWidth = positive(options.nodeWidth, DEFAULT_NODE_WIDTH);
  const nodeHeight = positive(options.nodeHeight, DEFAULT_NODE_HEIGHT);
  const horizontalGap = nonNegative(options.horizontalGap, DEFAULT_HORIZONTAL_GAP);
  const verticalGap = nonNegative(options.verticalGap, DEFAULT_VERTICAL_GAP);
  const padding = nonNegative(options.padding, DEFAULT_PADDING);
  const nodes: NodeGraphLayoutNode[] = [];
  const edges: NodeGraphLayoutEdge[] = [];
  let nextLeafX = padding;
  let maxDepth = 0;
  let maxRight = padding + nodeWidth;

  const place = (node: NodeGraphTree, depth: number): NodeGraphLayoutNode => {
    maxDepth = Math.max(maxDepth, depth);
    const children = node.children.map((child) => {
      const placed = place(child, depth + 1);
      edges.push({ source: node.id, target: child.id });
      return placed;
    });
    let x: number;
    if (children.length === 0) {
      x = nextLeafX;
      nextLeafX += nodeWidth + horizontalGap;
    } else {
      const first = children[0];
      const last = children[children.length - 1];
      if (first === undefined || last === undefined) throw new Error("Node Graph layout lost a child position");
      x = (first.x + last.x) / 2;
    }
    const placed: NodeGraphLayoutNode = {
      id: node.id,
      x,
      y: padding + depth * (nodeHeight + verticalGap),
      depth,
    };
    nodes.push(placed);
    maxRight = Math.max(maxRight, x + nodeWidth);
    return placed;
  };

  place(root, 0);
  return {
    nodes,
    edges,
    width: Math.max(nodeWidth + padding * 2, maxRight + padding),
    height: padding * 2 + (maxDepth + 1) * nodeHeight + maxDepth * verticalGap,
    nodeWidth,
    nodeHeight,
  };
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
