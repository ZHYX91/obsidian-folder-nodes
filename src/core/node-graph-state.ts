import type { NodeGraphScope } from "./node-graph-scope";
import {
  nodeGraphTopologyDescendants,
  type NodeGraphTopology,
} from "./node-graph-topology";
import { normalizeVaultPath } from "./paths";

export type NodeGraphRangeDepth = 1 | 2 | 3 | "all" | "collapse";

export interface NodeGraphExpansionState {
  readonly collapsedIds?: ReadonlySet<string>;
  readonly expandedIds: ReadonlySet<string>;
}

export interface NodeGraphExpansionSession {
  readonly scopes: ReadonlyMap<string, NodeGraphExpansionState>;
}

export interface NodeGraphSearchSnapshot<TCamera> {
  readonly camera: TCamera;
  readonly expansion: NodeGraphExpansionState;
  readonly focusId: string | null;
  readonly scopeKey: string;
}

export interface NodeGraphSearchRestore<TCamera> {
  readonly camera: TCamera;
  readonly expansion: NodeGraphExpansionState;
  readonly focusId: string | null;
}

export function createNodeGraphExpansionSession(): NodeGraphExpansionSession {
  return { scopes: new Map() };
}

export function nodeGraphScopeKey(scope: NodeGraphScope): string {
  return scope.mode === "global" ? "global" : `${scope.mode}:${normalizeVaultPath(scope.rootPath)}`;
}

export function nodeGraphDefaultExpansion(
  topology: NodeGraphTopology,
  scope: NodeGraphScope,
): NodeGraphExpansionState {
  return expansionState(nodeGraphScopeAnchors(topology, scope).filter((id) => hasChildren(topology, id)));
}

export function nodeGraphExpansionForScope(
  session: NodeGraphExpansionSession,
  topology: NodeGraphTopology,
  scope: NodeGraphScope,
): NodeGraphExpansionState {
  const stored = session.scopes.get(nodeGraphScopeKey(scope));
  return stored === undefined ? nodeGraphDefaultExpansion(topology, scope) : reconcileExpansion(topology, scope, stored);
}

export function withNodeGraphExpansion(
  session: NodeGraphExpansionSession,
  scope: NodeGraphScope,
  expansion: NodeGraphExpansionState,
): NodeGraphExpansionSession {
  const scopes = new Map(session.scopes);
  scopes.set(nodeGraphScopeKey(scope), cloneExpansion(expansion));
  return { scopes };
}

export function toggleNodeGraphNode(
  topology: NodeGraphTopology,
  expansion: NodeGraphExpansionState,
  nodeId: string,
): NodeGraphExpansionState {
  const id = normalizeVaultPath(nodeId);
  if (!hasChildren(topology, id)) return cloneExpansion(expansion);
  const expandedIds = new Set(expansion.expandedIds);
  const collapsedIds = new Set(expansion.collapsedIds ?? []);
  if (expandedIds.has(id)) {
    expandedIds.delete(id);
    collapsedIds.add(id);
  } else {
    expandedIds.add(id);
    collapsedIds.delete(id);
  }
  return expansionState(expandedIds, collapsedIds);
}

export function toggleNodeGraphBranch(
  topology: NodeGraphTopology,
  expansion: NodeGraphExpansionState,
  nodeId: string,
): NodeGraphExpansionState {
  const branch = nodeGraphTopologyDescendants(topology, nodeId)
    .filter((id) => hasChildren(topology, id));
  if (branch.length === 0) return cloneExpansion(expansion);
  const expandedIds = new Set(expansion.expandedIds);
  const collapsedIds = new Set(expansion.collapsedIds ?? []);
  const fullyExpanded = branch.every((id) => expandedIds.has(id));
  for (const id of branch) {
    if (fullyExpanded) {
      expandedIds.delete(id);
      collapsedIds.add(id);
    } else {
      expandedIds.add(id);
      collapsedIds.delete(id);
    }
  }
  return expansionState(expandedIds, collapsedIds);
}

export function setNodeGraphRangeDepth(
  topology: NodeGraphTopology,
  scope: NodeGraphScope,
  range: NodeGraphRangeDepth,
): NodeGraphExpansionState {
  const maximumDepth = range === "all" ? Number.POSITIVE_INFINITY : range === "collapse" ? 1 : range;
  const expandedIds = new Set<string>();
  const pending = nodeGraphScopeAnchors(topology, scope).map((id) => ({ depth: 0, id }));
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor];
    if (current === undefined) break;
    const node = topology.nodes.get(current.id);
    if (node === undefined || node.children.length === 0 || current.depth >= maximumDepth) continue;
    expandedIds.add(current.id);
    for (const child of node.children) pending.push({ depth: current.depth + 1, id: child });
  }
  return { expandedIds };
}

export function expandNodeGraphAncestors(
  topology: NodeGraphTopology,
  scope: NodeGraphScope,
  expansion: NodeGraphExpansionState,
  nodeIds: Iterable<string>,
): NodeGraphExpansionState {
  const allowed = nodeGraphStructuralScopeIds(topology, scope);
  const expandedIds = new Set(expansion.expandedIds);
  const collapsedIds = new Set(expansion.collapsedIds ?? []);
  for (const rawId of nodeIds) {
    let id = normalizeVaultPath(rawId);
    if (!allowed.has(id)) continue;
    while (true) {
      const parentId = topology.nodes.get(id)?.parentId;
      if (parentId === null || parentId === undefined || !allowed.has(parentId)) break;
      if (hasChildren(topology, parentId)) {
        expandedIds.add(parentId);
        collapsedIds.delete(parentId);
      }
      id = parentId;
    }
  }
  return expansionState(expandedIds, collapsedIds);
}

export function captureNodeGraphSearchSnapshot<TCamera>(
  scope: NodeGraphScope,
  expansion: NodeGraphExpansionState,
  focusId: string | null,
  camera: TCamera,
): NodeGraphSearchSnapshot<TCamera> {
  return {
    camera,
    expansion: cloneExpansion(expansion),
    focusId: focusId === null ? null : normalizeVaultPath(focusId),
    scopeKey: nodeGraphScopeKey(scope),
  };
}

export function restoreNodeGraphSearchSnapshot<TCamera>(
  snapshot: NodeGraphSearchSnapshot<TCamera>,
  scope: NodeGraphScope,
): NodeGraphSearchRestore<TCamera> | null {
  if (snapshot.scopeKey !== nodeGraphScopeKey(scope)) return null;
  return {
    camera: snapshot.camera,
    expansion: cloneExpansion(snapshot.expansion),
    focusId: snapshot.focusId,
  };
}

/** Restores the progressive replacement for the former relation-mode workspace state. */
export function nodeGraphShowLinksFromPersistedState(value: unknown, fallback = false): boolean {
  if (typeof value !== "object" || value === null) return fallback;
  const input = value as { readonly relationMode?: unknown; readonly showLinks?: unknown };
  if (typeof input.showLinks === "boolean") return input.showLinks;
  if (input.relationMode === "links" || input.relationMode === "hybrid") return true;
  if (input.relationMode === "structure") return false;
  return fallback;
}

export function nodeGraphScopeAnchors(topology: NodeGraphTopology, scope: NodeGraphScope): readonly string[] {
  if (scope.mode === "global") return topology.roots;
  const rootId = normalizeVaultPath(scope.rootPath);
  return topology.nodes.has(rootId) ? [rootId] : [];
}

export function nodeGraphStructuralScopeIds(topology: NodeGraphTopology, scope: NodeGraphScope): ReadonlySet<string> {
  if (scope.mode === "global") return new Set(topology.nodes.keys());
  return new Set(nodeGraphTopologyDescendants(topology, scope.rootPath));
}

function reconcileExpansion(
  topology: NodeGraphTopology,
  scope: NodeGraphScope,
  expansion: NodeGraphExpansionState,
): NodeGraphExpansionState {
  const collapsedIds = new Set(
    [...expansion.collapsedIds ?? []]
      .map(normalizeVaultPath)
      .filter((id) => topology.nodes.has(id)),
  );
  const expandedIds = [
    ...[...expansion.expandedIds].filter((id) => topology.nodes.has(id)),
    ...[...nodeGraphDefaultExpansion(topology, scope).expandedIds].filter((id) => !collapsedIds.has(id)),
  ];
  return expansionState(expandedIds, collapsedIds);
}

function cloneExpansion(expansion: NodeGraphExpansionState): NodeGraphExpansionState {
  return expansionState(expansion.expandedIds, expansion.collapsedIds);
}

function expansionState(ids: Iterable<string>, collapsed: Iterable<string> = []): NodeGraphExpansionState {
  const collapsedIds = new Set([...collapsed].map(normalizeVaultPath));
  const expandedIds = new Set([...ids].map(normalizeVaultPath).filter((id) => !collapsedIds.has(id)));
  return collapsedIds.size === 0 ? { expandedIds } : { collapsedIds, expandedIds };
}

function hasChildren(topology: NodeGraphTopology, id: string): boolean {
  return (topology.nodes.get(id)?.children.length ?? 0) > 0;
}
