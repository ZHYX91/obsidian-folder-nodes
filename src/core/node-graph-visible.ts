import type { NodeGraphScope } from "./node-graph-scope";
import {
  nodeGraphScopeAnchors,
  setNodeGraphRangeDepth,
  type NodeGraphExpansionState,
  type NodeGraphRangeDepth,
} from "./node-graph-state";
import type { NodeGraphTopology } from "./node-graph-topology";
import { normalizeVaultPath } from "./paths";

export interface NodeGraphVisibleEdge {
  readonly source: string;
  readonly target: string;
}

export interface NodeGraphVisibleNode {
  readonly depth: number;
  readonly id: string;
  readonly linkedOnly: boolean;
  readonly parentId: string | null;
}

export interface NodeGraphVisibleScene {
  readonly linkEdges: readonly NodeGraphVisibleEdge[];
  readonly linkedNeighborIds: ReadonlySet<string>;
  readonly nodeIds: ReadonlySet<string>;
  readonly nodes: readonly NodeGraphVisibleNode[];
  readonly rootIds: readonly string[];
  readonly structuralIds: ReadonlySet<string>;
  readonly structureEdges: readonly NodeGraphVisibleEdge[];
}

export interface NodeGraphVisibleSceneOptions {
  readonly showLinks?: boolean;
}

export function buildNodeGraphVisibleScene(
  topology: NodeGraphTopology,
  scope: NodeGraphScope,
  expansion: NodeGraphExpansionState,
  options: NodeGraphVisibleSceneOptions = {},
): NodeGraphVisibleScene {
  const structuralIds = visibleStructuralIds(topology, scope, expansion);
  const nodeIds = new Set(structuralIds);
  const linkedNeighborIds = new Set<string>();
  if (options.showLinks === true && scope.mode === "local") {
    for (const id of structuralIds) {
      for (const target of topology.links.get(id) ?? []) {
        if (nodeIds.has(target)) continue;
        nodeIds.add(target);
        linkedNeighborIds.add(target);
      }
    }
  }

  const effectiveParents = new Map<string, string | null>();
  for (const id of nodeIds) {
    const parentId = topology.nodes.get(id)?.parentId ?? null;
    effectiveParents.set(
      id,
      !linkedNeighborIds.has(id) && parentId !== null && structuralIds.has(parentId) ? parentId : null,
    );
  }
  const topologyOrder = stableTopologyOrder(topology);
  const rootIds = topologyOrder.filter((id) => nodeIds.has(id) && effectiveParents.get(id) === null);
  const depths = visibleDepths(topology, nodeIds, rootIds);
  const nodes = topologyOrder.flatMap((id): NodeGraphVisibleNode[] => {
    if (!nodeIds.has(id)) return [];
    return [{
      depth: depths.get(id) ?? 0,
      id,
      linkedOnly: linkedNeighborIds.has(id),
      parentId: effectiveParents.get(id) ?? null,
    }];
  });
  const structureEdges = nodes.flatMap(({ id, parentId }) => parentId === null ? [] : [{ source: parentId, target: id }]);
  const linkEdges: NodeGraphVisibleEdge[] = [];
  if (options.showLinks === true) {
    for (const source of nodeIds) {
      for (const target of topology.links.get(source) ?? []) {
        if (!nodeIds.has(target) || compareIds(source, target) >= 0) continue;
        linkEdges.push({ source, target });
      }
    }
    linkEdges.sort((left, right) => compareIds(left.source, right.source) || compareIds(left.target, right.target));
  }
  return {
    linkEdges,
    linkedNeighborIds,
    nodeIds,
    nodes,
    rootIds,
    structuralIds,
    structureEdges,
  };
}

function stableTopologyOrder(topology: NodeGraphTopology): readonly string[] {
  const ordered: string[] = [];
  const pending = [...topology.roots];
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const id = pending[cursor];
    if (id === undefined) continue;
    ordered.push(id);
    pending.push(...topology.nodes.get(id)?.children ?? []);
  }
  return ordered;
}

export function estimateNodeGraphRangeNodeCount(
  topology: NodeGraphTopology,
  scope: NodeGraphScope,
  range: NodeGraphRangeDepth,
  showLinks = false,
): number {
  return buildNodeGraphVisibleScene(
    topology,
    scope,
    setNodeGraphRangeDepth(topology, scope, range),
    { showLinks },
  ).nodes.length;
}

function visibleStructuralIds(
  topology: NodeGraphTopology,
  scope: NodeGraphScope,
  expansion: NodeGraphExpansionState,
): Set<string> {
  const visible = new Set<string>();
  const pending = [...nodeGraphScopeAnchors(topology, scope)].reverse();
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || visible.has(id)) continue;
    const node = topology.nodes.get(id);
    if (node === undefined) continue;
    visible.add(id);
    if (!expansion.expandedIds.has(id)) continue;
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child !== undefined) pending.push(child);
    }
  }
  if (scope.mode === "local") {
    const root = topology.nodes.get(normalizeVaultPath(scope.rootPath));
    const parentId = root?.parentId;
    if (parentId !== null && parentId !== undefined && topology.nodes.has(parentId)) visible.add(parentId);
  }
  return visible;
}

function visibleDepths(
  topology: NodeGraphTopology,
  visibleIds: ReadonlySet<string>,
  rootIds: readonly string[],
): ReadonlyMap<string, number> {
  const depths = new Map<string, number>();
  const pending = rootIds.map((id) => ({ depth: 0, id }));
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor];
    if (current === undefined || depths.has(current.id)) continue;
    depths.set(current.id, current.depth);
    for (const child of topology.nodes.get(current.id)?.children ?? []) {
      if (visibleIds.has(child)) pending.push({ depth: current.depth + 1, id: child });
    }
  }
  return depths;
}

function compareIds(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
