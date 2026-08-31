import type { NodeGraphTree } from "./node-graph-layout";

export interface NodeGraphModelNode {
  readonly id: string;
  readonly depth: number;
}

export interface NodeGraphModelEdge {
  readonly source: string;
  readonly target: string;
  readonly structure: boolean;
  readonly link: boolean;
}

export interface NodeGraphModel {
  readonly nodes: readonly NodeGraphModelNode[];
  readonly edges: readonly NodeGraphModelEdge[];
}

export function buildNodeGraphModel(
  root: NodeGraphTree,
  linksBySource: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): NodeGraphModel {
  const nodes: NodeGraphModelNode[] = [];
  const nodeIds = new Set<string>();
  const edges = new Map<string, MutableEdge>();
  const pending: Array<{ readonly depth: number; readonly node: NodeGraphTree }> = [{ depth: 0, node: root }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const { depth, node } = current;
    if (nodeIds.has(node.id)) throw new Error(`Duplicate Node Graph id: ${node.id}`);
    nodeIds.add(node.id);
    nodes.push({ id: node.id, depth });
    const children = node.children;
    for (const child of children) {
      mergeEdge(edges, node.id, child.id, "structure");
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) pending.push({ depth: depth + 1, node: child });
    }
  }

  for (const [source, targets] of linksBySource) {
    if (!nodeIds.has(source)) continue;
    for (const target of targets) {
      if (source === target || !nodeIds.has(target)) continue;
      mergeEdge(edges, source, target, "link");
    }
  }

  return {
    nodes,
    edges: [...edges.values()]
      .map(({ source, target, structure, link }) => ({ source, target, structure, link }))
      .sort(compareEdges),
  };
}

export function buildNodeGraphModelFromNodes(
  nodes: readonly NodeGraphModelNode[],
  structureEdges: readonly { readonly source: string; readonly target: string }[],
  linksBySource: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): NodeGraphModel {
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) throw new Error(`Duplicate Node Graph id: ${node.id}`);
    nodeIds.add(node.id);
  }
  const edges = new Map<string, MutableEdge>();
  for (const edge of structureEdges) {
    if (edge.source === edge.target || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    mergeEdge(edges, edge.source, edge.target, "structure");
  }
  for (const [source, targets] of linksBySource) {
    if (!nodeIds.has(source)) continue;
    for (const target of targets) {
      if (source === target || !nodeIds.has(target)) continue;
      mergeEdge(edges, source, target, "link");
    }
  }
  return {
    nodes: [...nodes],
    edges: [...edges.values()]
      .map(({ source, target, structure, link }) => ({ source, target, structure, link }))
      .sort(compareEdges),
  };
}

export function nodeGraphStructureEdges(model: NodeGraphModel): readonly NodeGraphModelEdge[] {
  return model.edges.filter((edge) => edge.structure);
}

export function nodeGraphLinkEdges(model: NodeGraphModel): readonly NodeGraphModelEdge[] {
  return model.edges.filter((edge) => edge.link);
}

export function edgesForShowLinks(model: NodeGraphModel, showLinks: boolean): readonly NodeGraphModelEdge[] {
  return model.edges.filter((edge) => edge.structure || (showLinks && edge.link));
}

export function nodeGraphFocusContextIds(
  model: NodeGraphModel,
  focusId: string | null,
  showLinks: boolean,
): ReadonlySet<string> {
  const context = new Set<string>();
  if (focusId === null) return context;
  context.add(focusId);

  let parentId: string | null = null;
  for (const edge of model.edges) {
    if (!edge.structure) continue;
    if (edge.source === focusId) context.add(edge.target);
    else if (edge.target === focusId) {
      parentId = edge.source;
      context.add(edge.source);
    }
  }
  if (parentId !== null) {
    for (const edge of model.edges) {
      if (edge.structure && edge.source === parentId) context.add(edge.target);
    }
  }
  if (showLinks) {
    for (const edge of model.edges) {
      if (!edge.link) continue;
      if (edge.source === focusId) context.add(edge.target);
      else if (edge.target === focusId) context.add(edge.source);
    }
  }
  return context;
}

interface MutableEdge {
  source: string;
  target: string;
  structure: boolean;
  link: boolean;
}

function mergeEdge(edges: Map<string, MutableEdge>, left: string, right: string, kind: "structure" | "link"): void {
  const [first, second] = left.localeCompare(right, "en") <= 0 ? [left, right] : [right, left];
  const key = `${first}\u0000${second}`;
  const edge = edges.get(key) ?? { source: first, target: second, structure: false, link: false };
  if (kind === "structure") {
    if (edge.structure && (edge.source !== left || edge.target !== right)) {
      throw new Error(`Conflicting Node Graph structure edge: ${left} -> ${right}`);
    }
    edge.source = left;
    edge.target = right;
    edge.structure = true;
  } else {
    edge.link = true;
  }
  edges.set(key, edge);
}

function compareEdges(left: NodeGraphModelEdge, right: NodeGraphModelEdge): number {
  return left.source.localeCompare(right.source, "en") || left.target.localeCompare(right.target, "en");
}
