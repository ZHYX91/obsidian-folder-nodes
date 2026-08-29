import type { NodeGraphTree } from "./node-graph-layout";

export type NodeGraphRelationMode = "structure" | "links" | "hybrid";

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

  const visit = (node: NodeGraphTree, depth: number): void => {
    if (nodeIds.has(node.id)) throw new Error(`Duplicate Node Graph id: ${node.id}`);
    nodeIds.add(node.id);
    nodes.push({ id: node.id, depth });
    for (const child of node.children) {
      mergeEdge(edges, node.id, child.id, "structure");
      visit(child, depth + 1);
    }
  };
  visit(root, 0);

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

export function edgesForMode(model: NodeGraphModel, mode: NodeGraphRelationMode): readonly NodeGraphModelEdge[] {
  if (mode === "structure") return model.edges.filter((edge) => edge.structure);
  if (mode === "links") return model.edges.filter((edge) => edge.link);
  return model.edges.filter((edge) => edge.structure || edge.link);
}

interface MutableEdge {
  source: string;
  target: string;
  structure: boolean;
  link: boolean;
}

function mergeEdge(edges: Map<string, MutableEdge>, left: string, right: string, kind: "structure" | "link"): void {
  const [source, target] = left.localeCompare(right, "en") <= 0 ? [left, right] : [right, left];
  const key = `${source}\u0000${target}`;
  const edge = edges.get(key) ?? { source, target, structure: false, link: false };
  edge[kind] = true;
  edges.set(key, edge);
}

function compareEdges(left: NodeGraphModelEdge, right: NodeGraphModelEdge): number {
  return left.source.localeCompare(right.source, "en") || left.target.localeCompare(right.target, "en");
}
